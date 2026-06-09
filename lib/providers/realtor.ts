/* Realtor.com static search provider. Like the others, expect frequent
 * `blocked`/`empty` on static fetch; the browser-automation provider (future,
 * higher priority) is the path to real data. */

import {
  createStaticSiteProvider,
  type StaticSiteConfig,
} from "./staticSite";
import type { ScanQuery } from "./types";

/** Realtor uses "City_ST" (e.g. "Sherman_TX") in the search path. */
export function realtorSlug(market: string): string {
  const parts = market.split(",").map((s) => s.trim()).filter(Boolean);
  const city = (parts[0] ?? "").replace(/\s+/g, "-");
  const st = (parts[1] ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return st ? `${city}_${st}` : city;
}

export const realtorSite: StaticSiteConfig = {
  id: "realtor",
  label: "Realtor.com",
  origin: "https://www.realtor.com",
  priority: 22,
  buildSearchUrl: (q: ScanQuery) =>
    `https://www.realtor.com/realestateandhomes-search/${realtorSlug(q.market)}`,
  detailUrlRe: /\/realestateandhomes-detail\/[^"'\\<>\s]+/,
};

export const realtorProvider = createStaticSiteProvider(realtorSite);
