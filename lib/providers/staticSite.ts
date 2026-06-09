/* -------------------------------------------------------------------------- */
/*  Static HTML/JSON-LD search provider factory (free; no headless browser,    */
/*  no bot-protection bypass). Shared by the Zillow / Redfin / Realtor configs. */
/*                                                                            */
/*  Strategy: fetch the public market search page → find listing-detail URLs   */
/*  (site anchors + JSON-LD ItemList) → fetch the top-N detail pages → reuse    */
/*  `extractListing` (lib/urlImport) to normalize each into a ScannedProperty. */
/*  Many sites block automated requests; that is detected and returned as a    */
/*  graceful `blocked` status — the browser-automation provider (future,       */
/*  higher priority) is the path to real data on those sites.                  */
/* -------------------------------------------------------------------------- */

import { extractListing } from "../urlImport";
import { propertyKey } from "../deals";
import {
  freshTracking,
  scoreConfidence,
  type ScanContext,
  type ScanQuery,
  type ScannedProperty,
  type SearchProvider,
  type ProviderResult,
} from "./types";

export type StaticSiteConfig = {
  id: string;
  label: string;
  origin: string; // e.g. "https://www.zillow.com"
  priority: number;
  buildSearchUrl(query: ScanQuery): string;
  /** Finds listing-detail paths/URLs inside the search-results HTML. */
  detailUrlRe: RegExp;
};

export const BLOCK_MARKERS =
  /(px-captcha|perimeterx|access to this page has been denied|please verify you are a human|request unsuccessful|incapsula|\/recaptcha\/|are you a robot|unusual traffic)/i;

const toInt = (s: string): number | null => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const toDec = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Pull a few photo URLs from OpenGraph / twitter image tags. */
function ogImages(html: string): string[] {
  const out: string[] = [];
  const re =
    /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 10) {
    const c = m[0].match(/content\s*=\s*["']([^"']+)["']/i);
    if (c && /^https?:\/\//i.test(c[1]) && !out.includes(c[1])) out.push(c[1]);
  }
  return out;
}

/** Slugged "city-st" from "Sherman, TX". */
export function cityStateSlug(market: string, joiner = "-"): string {
  const parts = market.split(",").map((s) => s.trim()).filter(Boolean);
  const city = (parts[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, joiner);
  const st = (parts[1] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return st ? `${city}${joiner}${st}` : city;
}

/** Collect candidate listing-detail URLs from the search HTML. */
export function collectDetailUrls(
  html: string,
  cfg: StaticSiteConfig,
  cap: number,
): string[] {
  const seen = new Set<string>();
  const push = (raw: string) => {
    if (!raw) return;
    let abs = raw;
    if (abs.startsWith("//")) abs = "https:" + abs;
    else if (abs.startsWith("/")) abs = cfg.origin + abs;
    abs = abs.replace(/\\u002F/gi, "/").replace(/&amp;/g, "&").split("?")[0];
    if (/^https?:\/\//i.test(abs)) seen.add(abs);
  };

  let m: RegExpExecArray | null;
  const re = new RegExp(cfg.detailUrlRe.source, "gi");
  while ((m = re.exec(html)) !== null && seen.size < cap * 3) {
    push(m[0]);
  }

  // JSON-LD ItemList → itemListElement[].url (when present).
  const ld =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = ld.exec(html)) !== null && seen.size < cap * 3) {
    try {
      const data = JSON.parse(lm[1].trim());
      const nodes = Array.isArray(data) ? data : [data];
      for (const n of nodes) {
        const items = n?.itemListElement;
        if (Array.isArray(items)) {
          for (const it of items) {
            const u = it?.url ?? it?.item?.url ?? it?.item?.["@id"];
            if (typeof u === "string") push(u);
          }
        }
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return Array.from(seen).slice(0, cap);
}

/** Bounded-concurrency map. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Map fetched/rendered listing HTML to a normalized ScannedProperty. Shared by
 *  the static fetch providers and the browser-automation provider (which passes
 *  Playwright-rendered HTML), so both emit identical ScannedProperty shapes. */
export function htmlToScannedProperty(
  html: string,
  url: string,
  cfg: StaticSiteConfig,
  now: number,
): ScannedProperty | null {
  const r = extractListing(html, url);
  const f = r.extracted;
  const price = toInt(f.price);
  const beds = toInt(f.beds);
  const baths = toDec(f.baths);
  const sqft = toInt(f.sqft);
  const address = f.address.trim();
  // Need at least an address or a price to be a useful row.
  if (!address && price == null) return null;
  return {
    propertyKey: propertyKey({
      listingUrl: url,
      address,
      city: f.city,
      state: f.state,
      zip: f.zip,
    }),
    source: cfg.id,
    sourceLabel: cfg.label,
    listingUrl: url,
    address,
    city: f.city.trim(),
    state: f.state.trim(),
    zip: f.zip.trim(),
    price,
    beds,
    baths,
    sqft,
    lotSize: f.lotSize.trim(),
    yearBuilt: f.yearBuilt.trim(),
    description: f.description.trim(),
    photoUrls: ogImages(html),
    tracking: freshTracking(price, now),
    confidence: scoreConfidence({ address, price, beds, baths, sqft }),
    warnings: [],
  };
}

export function createStaticSiteProvider(cfg: StaticSiteConfig): SearchProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    kind: "search",
    priority: cfg.priority,
    isAvailable: () => true,
    async search(query: ScanQuery, ctx: ScanContext): Promise<ProviderResult> {
      const now = Date.now();
      const searchUrl = cfg.buildSearchUrl(query);
      const res = await ctx.fetchHtml(searchUrl);

      if (!res) {
        return {
          providerId: cfg.id,
          status: "error",
          properties: [],
          warnings: [
            `Couldn't reach ${cfg.label} (timeout or refused connection).`,
          ],
        };
      }
      const blocked =
        res.status === 403 ||
        res.status === 429 ||
        res.status === 401 ||
        BLOCK_MARKERS.test(res.html.slice(0, 20000));
      if (blocked) {
        return {
          providerId: cfg.id,
          status: "blocked",
          properties: [],
          warnings: [
            `${cfg.label} blocked basic extraction. Browser automation fallback can be added next.`,
          ],
        };
      }

      const urls = collectDetailUrls(res.html, cfg, ctx.maxResults);
      if (urls.length === 0) {
        return {
          providerId: cfg.id,
          status: "empty",
          properties: [],
          warnings: [
            `${cfg.label} returned a page, but no listing links were found in the static HTML (the results are likely rendered by JavaScript). Browser automation fallback can be added next.`,
          ],
        };
      }

      const pages = await mapPool(urls, 5, (u) => ctx.fetchHtml(u));
      const properties: ScannedProperty[] = [];
      for (let k = 0; k < pages.length; k++) {
        const page = pages[k];
        if (!page || !page.ok) continue;
        if (BLOCK_MARKERS.test(page.html.slice(0, 20000))) continue;
        const sp = htmlToScannedProperty(page.html, urls[k], cfg, now);
        if (sp) properties.push(sp);
      }

      if (properties.length === 0) {
        return {
          providerId: cfg.id,
          status: "empty",
          properties: [],
          warnings: [
            `${cfg.label} listing pages couldn't be parsed from static HTML. Browser automation fallback can be added next.`,
          ],
        };
      }
      return { providerId: cfg.id, status: "ok", properties, warnings: [] };
    },
  };
}
