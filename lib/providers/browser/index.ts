/* -------------------------------------------------------------------------- */
/*  Browser Automation Provider (Playwright) — PRIMARY search provider.        */
/*                                                                            */
/*  Opens Zillow/Redfin/Realtor in a real local Chromium, lets the page render,*/
/*  collects listing-detail URLs, renders each detail page, then reuses the    */
/*  EXISTING parser (`extractListing`) + mapper (`htmlToScannedProperty`) so it */
/*  emits the same ScannedProperty as every other provider. Free, local,       */
/*  opt-in (SCANNER_BROWSER=1). No bot-protection bypass: a normal browser/UA,  */
/*  and on a block/CAPTCHA we detect it and stop — we never solve or evade it.  */
/* -------------------------------------------------------------------------- */

import "server-only";
import type { Browser, BrowserContext, Page } from "playwright";
import { launchBrowser, newContext, closeQuietly } from "./launcher";
import {
  BLOCK_MARKERS,
  collectDetailUrls,
  htmlToScannedProperty,
  type StaticSiteConfig,
} from "../staticSite";
import { zillowSite } from "../zillow";
import { redfinSite } from "../redfin";
import { realtorSite } from "../realtor";
import { scanRedfinResults, newCounters } from "./redfinExtract";
import { dbg } from "./debug";
import type {
  ProviderDebug,
  ProviderResult,
  ProviderStatus,
  ScanContext,
  ScannedProperty,
  ScanQuery,
  SearchProvider,
} from "../types";

const NAV_TIMEOUT_MS = 25_000;
const PAGE_CONCURRENCY = 3;
// Stabilization: focus the browser provider on Redfin only. Zillow/Realtor
// configs remain available but are intentionally not scanned for now.
const SEARCH_SITES = [redfinSite];
// Silence "unused" while Zillow/Realtor are parked during stabilization.
void zillowSite;
void realtorSite;

const PHOTO_CDN = /(photos\.zillowstatic\.com|cdn-redfin\.com|rdcpix\.com)/i;

/* ------------------------------- utilities -------------------------------- */

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const clean = u.split("#")[0].split("?")[0].replace(/\/+$/, "");
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

async function looksBlocked(page: Page): Promise<boolean> {
  const u = page.url().toLowerCase();
  if (/captcha|px-captcha|access-denied|\/blocked/.test(u)) return true;
  try {
    const html = await page.content();
    return BLOCK_MARKERS.test(html.slice(0, 20_000));
  } catch {
    return false;
  }
}

async function autoScroll(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let total = 0;
        const step = 800;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          const atBottom =
            window.innerHeight + window.scrollY >=
            document.body.scrollHeight - 50;
          if (total >= 5000 || atBottom) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
  } catch {
    /* non-fatal */
  }
}

function mergePhotos(existing: string[], imgs: string[]): string[] {
  const set = new Set<string>(existing.filter(Boolean));
  for (const u of imgs) {
    if (set.size >= 12) break;
    if (typeof u === "string" && /^https?:\/\//.test(u) && PHOTO_CDN.test(u)) {
      set.add(u.split("?")[0]);
    }
  }
  return Array.from(set).slice(0, 12);
}

/* --------------------------- per-site URL collection ---------------------- */

type CollectResult = { status: ProviderStatus; urls: string[]; warning?: string };

/** Zillow / Realtor: navigate the search URL, render, scroll, collect links. */
async function collectViaSearchPage(
  context: BrowserContext,
  cfg: StaticSiteConfig,
  query: ScanQuery,
): Promise<CollectResult> {
  const page = await context.newPage();
  const re = new RegExp(cfg.detailUrlRe.source, "i");
  try {
    await page.goto(cfg.buildSearchUrl(query), {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    if (await looksBlocked(page)) {
      return {
        status: "blocked",
        urls: [],
        warning: `${cfg.label}: blocked basic extraction (no bypass attempted).`,
      };
    }
    const linkPart = cfg.id === "zillow" ? "/homedetails/" : "/realestateandhomes-detail/";
    await page
      .waitForSelector(`a[href*="${linkPart}"]`, { timeout: 8_000 })
      .catch(() => {});
    await autoScroll(page);

    const hrefs = await page
      .$$eval("a[href]", (els) => els.map((e) => (e as HTMLAnchorElement).href))
      .catch(() => [] as string[]);
    const content = await page.content().catch(() => "");
    const urls = dedupe([
      ...hrefs.filter((h) => re.test(h)),
      ...collectDetailUrls(content, cfg, query.maxResults * 3),
    ]);
    if (urls.length === 0) {
      return {
        status: "empty",
        urls: [],
        warning: `${cfg.label}: rendered, but no listing links were found.`,
      };
    }
    return { status: "ok", urls };
  } catch {
    return {
      status: "error",
      urls: [],
      warning: `${cfg.label}: search page failed to load in time.`,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function collectForSite(
  context: BrowserContext,
  cfg: StaticSiteConfig,
  query: ScanQuery,
): Promise<CollectResult> {
  // Redfin is handled by the dedicated results-card flow (scanRedfinResults).
  // Other portals are parked during stabilization; they would use the static
  // search-page collector if re-enabled in SEARCH_SITES.
  return collectViaSearchPage(context, cfg, query);
}

/* ------------------------------ detail render ----------------------------- */

type DetailResult = { sp: ScannedProperty | null; blocked: boolean };

async function extractDetail(
  context: BrowserContext,
  url: string,
  cfg: StaticSiteConfig,
  now: number,
): Promise<DetailResult> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // Best-effort wait for primary content; never fatal.
    await page
      .waitForSelector('[itemprop="price"], [data-testid="price"], script[type="application/ld+json"]', {
        timeout: 6_000,
      })
      .catch(() => {});
    const html = await page.content();
    if (BLOCK_MARKERS.test(html.slice(0, 20_000))) return { sp: null, blocked: true };

    const sp = htmlToScannedProperty(html, url, cfg, now);
    if (!sp) return { sp: null, blocked: false };

    const imgs = await page
      .$$eval("img", (els) =>
        els.map((e) => (e as HTMLImageElement).currentSrc || (e as HTMLImageElement).src),
      )
      .catch(() => [] as string[]);
    sp.photoUrls = mergePhotos(sp.photoUrls, imgs);
    return { sp, blocked: false };
  } catch {
    return { sp: null, blocked: false };
  } finally {
    await page.close().catch(() => {});
  }
}

async function renderDetails(
  context: BrowserContext,
  items: { url: string; cfg: StaticSiteConfig }[],
  now: number,
  ctx: ScanContext,
): Promise<ScannedProperty[]> {
  const out: ScannedProperty[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      if (ctx.signal.aborted) return;
      const { url, cfg } = items[i++];
      const sp = (await extractDetail(context, url, cfg, now)).sp;
      if (sp) out.push(sp);
    }
  };
  const n = Math.min(PAGE_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

/* ------------------------------- the provider ----------------------------- */

export const browserProvider: SearchProvider = {
  id: "browser",
  label: "Browser automation",
  kind: "search",
  priority: 10,
  isAvailable: () => process.env.SCANNER_BROWSER === "1",
  async search(query: ScanQuery, ctx: ScanContext): Promise<ProviderResult> {
    const now = Date.now();
    const warnings: string[] = [];
    let browser: Browser | null = null;

    try {
      try {
        browser = await launchBrowser();
      } catch {
        return {
          providerId: "browser",
          status: "unavailable",
          properties: [],
          warnings: [
            "Couldn't launch the local browser. Run `npm run scanner:install` to download Chromium, then retry.",
          ],
        };
      }

      const context = await newContext(browser);
      const counters = newCounters();
      let debug: ProviderDebug | undefined;
      let anyBlocked = false;
      let anyOk = false;
      try {
        const collected: ScannedProperty[] = [];
        const candidates: { url: string; cfg: StaticSiteConfig }[] = [];

        for (const cfg of SEARCH_SITES) {
          if (ctx.signal.aborted) {
            warnings.push("Stopped early (time budget reached).");
            break;
          }
          if (cfg.id === "redfin") {
            // Redfin: resolve the market -> results page, read listing cards
            // directly (detail pages are WAF-blocked).
            const r = await scanRedfinResults(context, query, cfg, now, counters, ctx);
            warnings.push(...r.warnings);
            debug = r.debug;
            if (r.status === "blocked") anyBlocked = true;
            if (r.status === "ok") anyOk = true;
            collected.push(...r.properties);
          } else {
            // Parked portals: static search-page collect + detail render.
            const r = await collectForSite(context, cfg, query);
            if (r.warning) warnings.push(r.warning);
            if (r.status === "blocked") anyBlocked = true;
            if (r.status === "ok") anyOk = true;
            for (const u of r.urls) candidates.push({ url: u, cfg });
          }
        }

        // Render any non-Redfin candidates (capped to maxResults).
        const seen = new Set<string>();
        const capped: { url: string; cfg: StaticSiteConfig }[] = [];
        for (const c of candidates) {
          if (capped.length >= query.maxResults) break;
          if (!seen.has(c.url)) {
            seen.add(c.url);
            capped.push(c);
          }
        }
        const rendered = capped.length
          ? await renderDetails(context, capped, now, ctx)
          : [];

        // Merge everything; dedupe by propertyKey.
        const byKey = new Map<string, ScannedProperty>();
        for (const p of [...collected, ...rendered]) {
          if (!byKey.has(p.propertyKey)) byKey.set(p.propertyKey, p);
        }
        const properties = Array.from(byKey.values()).slice(0, query.maxResults);

        // Debug summary (verification numbers).
        warnings.push(
          `Redfin debug — cards: ${counters.rendered}, converted: ${counters.converted}, blocked: ${counters.blocked}, errored: ${counters.errored}, unparseable: ${counters.failed.length}.`,
        );
        for (const fl of counters.failed.slice(0, 5)) {
          warnings.push(
            `Unparseable card: ${fl.title || fl.url} — missing ${fl.missing.join(", ") || "all key fields"}`,
          );
        }
        dbg("SUMMARY", {
          cards: counters.rendered,
          converted: counters.converted,
          blocked: counters.blocked,
          errored: counters.errored,
          unparseable: counters.failed.length,
          properties: properties.length,
        });

        const status: ProviderStatus =
          properties.length > 0 ? "ok" : anyBlocked ? "blocked" : anyOk ? "empty" : "empty";

        return { providerId: "browser", status, properties, warnings, debug };
      } finally {
        await context.close().catch(() => {});
      }
    } catch {
      return {
        providerId: "browser",
        status: "error",
        properties: [],
        warnings: [...warnings, "The browser scan failed unexpectedly."],
      };
    } finally {
      await closeQuietly(browser);
    }
  },
};
