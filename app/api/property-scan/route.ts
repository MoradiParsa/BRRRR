/* -------------------------------------------------------------------------- */
/*  Universal Property Scanner — server scan endpoint (free; no paid APIs, no   */
/*  headless browser, no bot-protection bypass).                               */
/*                                                                            */
/*  Runs the active SEARCH providers (Zillow/Redfin/Realtor static today),     */
/*  supplying an SSRF-guarded fetch with per-request timeout + size cap and a   */
/*  global time budget. File providers (CSV/PDF) run client-side and never hit  */
/*  this route. Always returns 200 with per-provider statuses (so the UI can    */
/*  show "blocked → browser automation next") except on malformed input (400). */
/* -------------------------------------------------------------------------- */

import { getActiveSearchProviders } from "@/lib/providers/registry";
import { MAX_SCAN_RESULTS } from "@/lib/buyBox";
import type {
  ProviderRunStatus,
  ScanContext,
  ScanQuery,
  ScanResponse,
  ScannedProperty,
} from "@/lib/providers/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_FETCH_TIMEOUT_MS = 12_000;
const GLOBAL_BUDGET_MS = 50_000;
const MAX_HTML_BYTES = 3_000_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Block obvious SSRF targets (localhost, private/link-local/reserved IPs). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

function makeFetchHtml(globalSignal: AbortSignal): ScanContext["fetchHtml"] {
  return async (url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isBlockedHost(parsed.hostname)) return null;
    if (globalSignal.aborted) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_FETCH_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    globalSignal.addEventListener("abort", onAbort);
    try {
      const res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const contentType = res.headers.get("content-type") || "";
      if (contentType && !/html|xml|text|json/i.test(contentType)) {
        return { ok: res.ok, status: res.status, html: "", contentType };
      }
      let html = "";
      try {
        html = await res.text();
      } catch {
        html = "";
      }
      if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);
      return { ok: res.ok, status: res.status, html, contentType };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      globalSignal.removeEventListener("abort", onAbort);
    }
  };
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

function parseQuery(body: unknown): ScanQuery | null {
  if (!body || typeof body !== "object") return null;
  const q = (body as Record<string, unknown>).query as Record<string, unknown> | undefined;
  if (!q || typeof q !== "object") return null;
  const market = String(q.market ?? "").trim();
  if (!market) return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) ? v : null;
  const maxResultsRaw = num(q.maxResults) ?? 25;
  return {
    market,
    maxPrice: num(q.maxPrice),
    minBeds: num(q.minBeds),
    minBaths: num(q.minBaths),
    maxResults: Math.max(1, Math.min(MAX_SCAN_RESULTS, maxResultsRaw)),
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const query = parseQuery(body);
  if (!query) return bad("A market is required to scan.");

  const globalCtrl = new AbortController();
  const budgetTimer = setTimeout(() => globalCtrl.abort(), GLOBAL_BUDGET_MS);

  try {
    const providers = getActiveSearchProviders();
    const ctx: ScanContext = {
      fetchHtml: makeFetchHtml(globalCtrl.signal),
      maxResults: query.maxResults,
      signal: globalCtrl.signal,
    };

    const results = await Promise.all(
      providers.map(async (p) => {
        try {
          return await p.search(query, ctx);
        } catch {
          return {
            providerId: p.id,
            status: "error" as const,
            properties: [],
            warnings: [`${p.label} failed unexpectedly.`],
          };
        }
      }),
    );

    // Merge in priority order (providers are pre-sorted); dedupe by key, union photos.
    const merged = new Map<string, ScannedProperty>();
    for (const r of results) {
      for (const p of r.properties) {
        const existing = merged.get(p.propertyKey);
        if (!existing) {
          merged.set(p.propertyKey, { ...p });
        } else {
          existing.photoUrls = Array.from(
            new Set([...existing.photoUrls, ...p.photoUrls]),
          );
        }
      }
    }
    const properties = Array.from(merged.values()).slice(0, query.maxResults);

    const statuses: ProviderRunStatus[] = results.map((r) => {
      const prov = providers.find((p) => p.id === r.providerId);
      return {
        providerId: r.providerId,
        label: prov?.label ?? r.providerId,
        status: r.status,
        count: r.properties.length,
        warnings: r.warnings,
      };
    });

    const payload: ScanResponse = { properties, statuses };
    return Response.json(payload);
  } finally {
    clearTimeout(budgetTimer);
  }
}
