/* Zillow static search provider. Will often return `blocked` until the future
 * browser-automation provider is added — that is expected and handled. */

import {
  createStaticSiteProvider,
  cityStateSlug,
  type StaticSiteConfig,
} from "./staticSite";

export const zillowSite: StaticSiteConfig = {
  id: "zillow",
  label: "Zillow",
  origin: "https://www.zillow.com",
  priority: 20,
  buildSearchUrl: (q) => `https://www.zillow.com/${cityStateSlug(q.market)}/`,
  detailUrlRe: /https?:\/\/www\.zillow\.com\/homedetails\/[^"'\\<>\s]+_zpid\/|\/homedetails\/[^"'\\<>\s]+_zpid\//,
};

export const zillowProvider = createStaticSiteProvider(zillowSite);
