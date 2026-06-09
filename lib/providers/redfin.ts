/* Redfin static search provider. Redfin's search-by-name normally needs a
 * region id (resolved via its autocomplete API), so the best-effort public URL
 * here will frequently 404/`blocked`/`empty`; that degrades gracefully and the
 * future browser-automation provider is the path to real Redfin data. */

import { createStaticSiteProvider, cityStateSlug } from "./staticSite";

export const redfinProvider = createStaticSiteProvider({
  id: "redfin",
  label: "Redfin",
  origin: "https://www.redfin.com",
  priority: 21,
  // Redfin uses /city/<id>/<ST>/<City>; without the id we attempt a city slug.
  buildSearchUrl: (q) => `https://www.redfin.com/city/${cityStateSlug(q.market, "-")}`,
  detailUrlRe: /\/[A-Z]{2}\/[A-Za-z0-9\-]+\/[^"'\\<>\s]*\/home\/\d+/,
});
