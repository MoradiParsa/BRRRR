/* -------------------------------------------------------------------------- */
/*  Basic listing-URL extraction (free, no paid APIs, no headless browser).   */
/*                                                                            */
/*  Pure + isomorphic: HTML string in → normalized fields out. Reads only     */
/*  PUBLIC signals — JSON-LD (schema.org), OpenGraph/meta tags, and embedded   */
/*  JSON keys — using string/regex parsing (no dependencies). It does NOT      */
/*  bypass bot protection, log in, or run JS. Many sites block automated       */
/*  requests; in that case extraction returns `limited: true` and the caller   */
/*  falls back to a blank property with the link attached.                     */
/*                                                                            */
/*  Modularity: `URL_PROVIDERS` is a registry of extraction strategies. Today  */
/*  only the static-HTML provider is implemented. A headless-browser provider  */
/*  (Playwright/Puppeteer) can be added later as a fallback by registering it  */
/*  here — nothing else needs to change.                                       */
/* -------------------------------------------------------------------------- */

import {
  dealStateFromExtractedSource,
  emptyExtractedFields,
  FIELD_LABELS,
  type ExtractedFields,
  type ExtractedKey,
  type FieldConfidence,
} from "./extraction";
import { linkDealState, type DealState } from "./deals";

/* --------------------------------- types ---------------------------------- */

export type UrlExtractionResult = {
  url: string;
  sourceId: string;
  sourceLabel: string;
  confidence: number; // 0–1, over the key fields
  extracted: ExtractedFields;
  fieldConfidence: FieldConfidence;
  fieldsFound: string[]; // human labels (includes "Source website")
  fieldsMissing: string[]; // human labels
  warnings: string[];
  limited: boolean; // true when nothing useful was extracted
};

/** Fields the URL importer attempts (a subset of the full review model). */
export const URL_FIELD_KEYS: ExtractedKey[] = [
  "address",
  "city",
  "state",
  "zip",
  "price",
  "beds",
  "baths",
  "sqft",
  "lotSize",
  "yearBuilt",
  "description",
];

const KEY_FIELDS: ExtractedKey[] = ["address", "price", "beds", "baths", "sqft"];

const BASIC_WARNING =
  "Basic extraction reads only public HTML, meta tags, and structured data — verify every value against the listing.";

/* ------------------------------- source id -------------------------------- */

export function detectSource(rawUrl: string): { id: string; label: string } {
  let host = "";
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  if (host.includes("zillow.")) return { id: "zillow", label: "Zillow" };
  if (host.includes("redfin.")) return { id: "redfin", label: "Redfin" };
  if (host.includes("realtor.")) return { id: "realtor", label: "Realtor.com" };
  if (host.includes("trulia.")) return { id: "trulia", label: "Trulia" };
  if (host.includes("homes.com")) return { id: "homes", label: "Homes.com" };
  if (host) return { id: "generic", label: host };
  return { id: "generic", label: "the listing site" };
}

/* ------------------------------ tiny helpers ------------------------------ */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function clean(s: unknown): string {
  if (s == null) return "";
  return decodeEntities(String(s)).replace(/\s+/g, " ").trim();
}

/** Positive integer as a string, or "" (used for price/sqft/beds). */
function intString(s: unknown): string {
  const n = parseInt(String(s ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

/** Positive number (allows one decimal) as a string, or "" (baths). */
function decimalString(s: unknown): string {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function yearString(s: unknown): string {
  const m = String(s ?? "").match(/(?:18|19|20)\d{2}/);
  return m ? m[0] : "";
}

/* ------------------------------- draft model ------------------------------ */

type Draft = { fields: ExtractedFields; conf: FieldConfidence };

/** Set a field only if still empty — earlier (higher-priority) sources win. */
function set(d: Draft, k: ExtractedKey, value: string, confidence: number) {
  const v = value.trim();
  if (!v || d.fields[k]) return;
  d.fields[k] = v;
  d.conf[k] = confidence;
}

/* ------------------------------ JSON-LD layer ----------------------------- */

function collectJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = m[1].trim();
    if (!txt) continue;
    try {
      walk(JSON.parse(txt), out);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

function walk(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (node && typeof node === "object") {
    out.push(node as Record<string, unknown>);
    const graph = (node as Record<string, unknown>)["@graph"];
    if (graph) walk(graph, out);
  }
}

function applyJsonLd(d: Draft, nodes: Record<string, unknown>[]) {
  for (const node of nodes) {
    const n = node as Record<string, any>;

    const addr = n.address;
    if (addr && typeof addr === "object") {
      set(d, "address", clean(addr.streetAddress), 0.9);
      set(d, "city", clean(addr.addressLocality), 0.9);
      set(d, "state", clean(addr.addressRegion), 0.9);
      set(d, "zip", clean(addr.postalCode), 0.9);
    } else if (typeof addr === "string") {
      parseAddressString(d, clean(addr), 0.75);
    }

    const offers = n.offers;
    const price =
      (offers && (offers.price ?? offers.priceSpecification?.price)) ?? n.price;
    set(d, "price", intString(price), 0.85);

    const fs = n.floorSize;
    const sqft = fs && typeof fs === "object" ? fs.value : fs;
    set(d, "sqft", intString(sqft), 0.8);

    set(d, "beds", intString(n.numberOfBedrooms), 0.8);
    set(
      d,
      "baths",
      decimalString(n.numberOfBathroomsTotal ?? n.numberOfBathrooms),
      0.8,
    );
    set(d, "yearBuilt", yearString(n.yearBuilt), 0.75);
    set(d, "description", clean(n.description).slice(0, 1500), 0.7);
    set(d, "name", clean(n.name), 0.6);
  }
}

function parseAddressString(d: Draft, str: string, conf: number) {
  const m = str.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5})/);
  if (m) {
    set(d, "address", m[1], conf);
    set(d, "city", m[2], conf);
    set(d, "state", m[3].toUpperCase(), conf);
    set(d, "zip", m[4], conf);
  } else {
    set(d, "address", str, conf - 0.1);
  }
}

/* --------------------------- embedded-JSON layer -------------------------- */
/* Best-effort regex over JSON keys many listing pages embed in <script>.     */

function applyEmbedded(d: Draft, html: string) {
  const grab = (
    k: ExtractedKey,
    re: RegExp,
    conf: number,
    fmt: (s: string) => string,
    guard?: (n: number) => boolean,
  ) => {
    if (d.fields[k]) return;
    const m = html.match(re);
    if (!m) return;
    const formatted = fmt(m[1]);
    if (!formatted) return;
    if (guard && !guard(Number(formatted.replace(/[^0-9.]/g, "")))) return;
    set(d, k, formatted, conf);
  };

  grab("beds", /"bedrooms?"\s*:\s*"?(\d{1,2})"?/i, 0.65, intString);
  grab(
    "baths",
    /"bathrooms?(?:Total|Float|Display|Full)?"\s*:\s*"?(\d{1,2}(?:\.\d)?)"?/i,
    0.65,
    decimalString,
  );
  grab(
    "sqft",
    /"(?:livingArea(?:Value)?|finishedSqFt|squareFootage|sqft|livingAreaSqFt)"\s*:\s*"?(\d{3,6})"?/i,
    0.65,
    intString,
  );
  grab(
    "price",
    /"(?:listPrice|unformattedPrice|price)"\s*:\s*"?\$?(\d{4,9})"?/i,
    0.65,
    intString,
    (n) => n >= 1000 && n <= 200_000_000,
  );
  grab("yearBuilt", /"yearBuilt"\s*:\s*"?((?:18|19|20)\d{2})"?/i, 0.65, yearString);
  grab("address", /"streetAddress"\s*:\s*"([^"]{4,80})"/i, 0.65, clean);
  grab("city", /"(?:addressLocality|city)"\s*:\s*"([^"]{2,40})"/i, 0.6, clean);
  grab("state", /"(?:addressRegion|stateCode|state)"\s*:\s*"([A-Za-z]{2})"/i, 0.6, (s) =>
    s.toUpperCase(),
  );
  grab("zip", /"(?:postalCode|zipcode|zip)"\s*:\s*"?(\d{5})"?/i, 0.6, (s) => s);
  grab(
    "lotSize",
    /"lotSize(?:WithUnit)?[^"]*"\s*:\s*"([^"]{1,30})"/i,
    0.55,
    clean,
  );
}

/* ------------------------------ meta/OG layer ----------------------------- */

function getMeta(html: string, keys: string[]): string {
  const wanted = keys.map((k) => k.toLowerCase());
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i);
    if (!key || !wanted.includes(key[1].toLowerCase())) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (content && content[1]) return clean(content[1]);
  }
  return "";
}

function applyMeta(d: Draft, html: string) {
  const title = getMeta(html, ["og:title", "twitter:title"]);
  const desc = getMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  set(d, "description", desc.slice(0, 1500), 0.55);
  set(d, "name", title, 0.5);
  set(
    d,
    "price",
    intString(getMeta(html, ["product:price:amount", "og:price:amount"])),
    0.6,
  );
  // Last-resort free-text parse of the title + description.
  parseFreeText(d, `${title} . ${desc}`, 0.5);
}

const STREET_RE =
  "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Hwy|Highway|Pkwy|Parkway|Trl|Trail|Loop)";

function parseFreeText(d: Draft, text: string, conf: number) {
  if (!text.trim()) return;
  const beds = text.match(/(\d{1,2})\s*(?:bed|bd|br)\b/i);
  if (beds) set(d, "beds", intString(beds[1]), conf);
  const baths = text.match(/(\d{1,2}(?:\.\d)?)\s*(?:bath|ba)\b/i);
  if (baths) set(d, "baths", decimalString(baths[1]), conf);
  const sqft = text.match(/([\d,]{3,7})\s*(?:sq\.?\s*ft|sqft|square\s*f)/i);
  if (sqft) set(d, "sqft", intString(sqft[1]), conf);
  const price = text.match(/\$\s*([\d,]{4,9})/);
  if (price) set(d, "price", intString(price[1]), conf);

  const csz = text.match(
    /([A-Za-z][A-Za-z .'\-]{1,30}),\s*([A-Z]{2})\s*(\d{5})/,
  );
  if (csz) {
    set(d, "city", csz[1], conf);
    set(d, "state", csz[2].toUpperCase(), conf);
    set(d, "zip", csz[3], conf);
  }
  const street = text.match(
    new RegExp(`(\\d{1,6}\\s+[A-Za-z0-9.'\\- ]{2,40}\\s${STREET_RE}\\b\\.?)`, "i"),
  );
  if (street) set(d, "address", clean(street[1]), conf);
}

/* ----------------------------- public surface ----------------------------- */

/** A pluggable URL extraction strategy — future browser-automation providers
 *  implement this and register in URL_PROVIDERS as a fallback. */
export interface UrlProvider {
  id: string;
  label: string;
  /** Extract from already-fetched HTML. (A browser provider would instead do
   *  its own fetch/render; this signature covers the static-HTML case.) */
  extract(html: string, url: string, warnings: string[]): UrlExtractionResult;
}

export const staticHtmlProvider: UrlProvider = {
  id: "static-html",
  label: "Public HTML reader",
  extract(html, url, warnings) {
    return extractListing(html, url, warnings);
  },
};

/**
 * Registry of URL extraction providers, tried in order. Only the free static
 * reader is active. To add a headless-browser fallback later (Playwright/
 * Puppeteer), implement `UrlProvider` and append it here; the route can then
 * try the next provider when this one returns `limited`.
 */
export const URL_PROVIDERS: UrlProvider[] = [staticHtmlProvider];

/** Parse listing fields from fetched HTML. Pure — safe on client and server. */
export function extractListing(
  html: string,
  url: string,
  extraWarnings: string[] = [],
): UrlExtractionResult {
  const { id, label } = detectSource(url);
  const d: Draft = { fields: emptyExtractedFields(), conf: {} };

  if (html) {
    applyJsonLd(d, collectJsonLd(html)); // structured data first (highest trust)
    applyEmbedded(d, html); // embedded JSON keys
    applyMeta(d, html); // OpenGraph / meta / free text (lowest)
  }

  const found = URL_FIELD_KEYS.filter((k) => d.fields[k]);
  const missing = URL_FIELD_KEYS.filter((k) => !d.fields[k]);
  const keyFound = KEY_FIELDS.filter((k) => d.fields[k]).length;
  const confidence = Math.round((keyFound / KEY_FIELDS.length) * 100) / 100;

  const warnings = [...extraWarnings];
  if (found.length) warnings.push(BASIC_WARNING);

  return {
    url,
    sourceId: id,
    sourceLabel: label,
    confidence,
    extracted: d.fields,
    fieldConfidence: d.conf,
    fieldsFound: ["Source website", ...found.map((k) => FIELD_LABELS[k])],
    fieldsMissing: missing.map((k) => FIELD_LABELS[k]),
    warnings,
    limited: found.length === 0,
  };
}

/** A failed/blocked fetch result — still lets the user attach the link. */
export function failedUrlResult(
  url: string,
  warnings: string[],
): UrlExtractionResult {
  const { id, label } = detectSource(url);
  return {
    url,
    sourceId: id,
    sourceLabel: label,
    confidence: 0,
    extracted: emptyExtractedFields(),
    fieldConfidence: {},
    fieldsFound: ["Source website"],
    fieldsMissing: URL_FIELD_KEYS.map((k) => FIELD_LABELS[k]),
    warnings,
    limited: true,
  };
}

/* --------------------------- deal-state mappers --------------------------- */

/** Build a property draft from reviewed URL fields (tagged as a link import). */
export function dealStateFromUrl(
  fields: ExtractedFields,
  url: string,
  sourceLabel: string,
): DealState {
  return dealStateFromExtractedSource(fields, {
    sourceType: "link",
    sourceUrl: url,
    originLabel: `${sourceLabel} — ${url}`,
  });
}

/** Blank property with just the link attached (graceful fallback). */
export function blankDealStateWithLink(url: string): DealState {
  return linkDealState(url, "");
}
