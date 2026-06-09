/* -------------------------------------------------------------------------- */
/*  Basic listing-URL import endpoint (free — no paid APIs, no headless        */
/*  browser, no bot-protection bypass).                                       */
/*                                                                            */
/*  Fetches the public page server-side (CORS blocks the browser from doing   */
/*  it), then hands the HTML to lib/urlImport for parsing. Always returns a    */
/*  structured `UrlExtractionResult` (200) — even on block/timeout — so the    */
/*  client can show transparency and offer the blank-with-link fallback.      */
/*  Hard input errors (bad/empty/private URL) return 400.                     */
/* -------------------------------------------------------------------------- */

import {
  extractListing,
  failedUrlResult,
  type UrlExtractionResult,
} from "@/lib/urlImport";

export const runtime = "nodejs";
export const maxDuration = 30;

const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 3_000_000;

// A normal desktop browser UA — identifies as a browser (standard for HTTP
// clients), but we do NOT solve CAPTCHAs or bypass blocks. Blocked requests
// fall through to a graceful "limited" result.
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

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  let url = "";
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
  } catch {
    return bad("Invalid request body.");
  }
  if (!url) return bad("No URL provided.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return bad("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return bad("Only http(s) listing URLs are supported.");
  }
  if (isBlockedHost(parsed.hostname)) {
    return bad("That host isn't allowed.");
  }

  // --- fetch the public page --------------------------------------------- //
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch {
    clearTimeout(timer);
    const result: UrlExtractionResult = failedUrlResult(url, [
      "We couldn't reach the listing (it timed out or refused the connection). You can still create a blank property with the link attached.",
    ]);
    return Response.json(result);
  }
  clearTimeout(timer);

  const warnings: string[] = [];
  if (!res.ok) {
    const blocked = res.status === 403 || res.status === 429 || res.status === 401;
    warnings.push(
      `The site responded with status ${res.status}${
        blocked ? " — it likely blocks automated requests" : ""
      }. We read what was available.`,
    );
  }

  const ctype = res.headers.get("content-type") || "";
  if (ctype && !/html|xml|text|json/i.test(ctype)) {
    const result = failedUrlResult(url, [
      `The link returned ${ctype || "non-HTML content"}, which we can't read. You can still create a blank property with the link attached.`,
    ]);
    return Response.json(result);
  }

  let html = "";
  try {
    html = await res.text();
  } catch {
    html = "";
  }
  if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);

  const result = extractListing(html, url, warnings);
  return Response.json(result);
}
