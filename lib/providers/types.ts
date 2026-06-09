/* -------------------------------------------------------------------------- */
/*  Universal Property Scanner — provider contract.                            */
/*                                                                            */
/*  EVERY provider — market search (Zillow/Redfin/Realtor/MLS), file (CSV/PDF),*/
/*  paste-URL, a future browser-automation provider, or a future AI enricher —*/
/*  returns the exact same normalized `ScannedProperty`. That single output    */
/*  contract is what lets new providers be added by registering them, without  */
/*  ever touching the BRRRR engine, the scan engine, the Deal Queue, or the UI.*/
/*                                                                            */
/*  Providers differ only in their INPUT, so they are tagged by `kind`:        */
/*    - "search": market query  → runs server-side (network + SSRF guard)      */
/*    - "file":   a local File   → runs client-side (reuses browser extractors)*/
/*    - "url":    a single URL   → runs server-side                            */
/* -------------------------------------------------------------------------- */

import type { PropertyTracking } from "../deals";

export type { PropertyTracking };

/* ----------------------------- normalized output -------------------------- */

/** The one normalized object every provider yields. */
export type ScannedProperty = {
  /** Stable identity (normalized listing URL, else normalized address). */
  propertyKey: string;
  /** Provider id, e.g. "zillow" | "redfin" | "realtor" | "csv" | "pdf". */
  source: string;
  /** Human label, e.g. "Zillow". */
  sourceLabel: string;
  /** Canonical listing URL ("" for file-based sources). */
  listingUrl: string;

  address: string;
  city: string;
  state: string;
  zip: string;

  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize: string;
  yearBuilt: string;
  description: string;

  /** Photo URLs captured now for future AI renovation/rehab/ARV modules. */
  photoUrls: string[];
  /** Price-history snapshot; reconciled across runs by the scan engine. */
  tracking: PropertyTracking;

  /** 0–1 extraction confidence over the key fields. */
  confidence: number;
  warnings: string[];
};

/* -------------------------------- scan input ------------------------------ */

export type ScanQuery = {
  market: string; // e.g. "Sherman, TX"
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  maxResults: number; // hard cap on listing pages fetched + rows returned
};

/* ------------------------------ provider result --------------------------- */

export type ProviderStatus =
  | "ok" // returned one or more properties
  | "blocked" // the site refused automated access (403/429/captcha)
  | "empty" // reachable but nothing parseable was found
  | "error" // network/parse failure
  | "unavailable"; // provider not built / not enabled yet

export type ProviderResult = {
  providerId: string;
  status: ProviderStatus;
  properties: ScannedProperty[];
  warnings: string[];
};

/** Per-provider status surfaced to the UI after a scan run. */
export type ProviderRunStatus = {
  providerId: string;
  label: string;
  status: ProviderStatus;
  count: number;
  warnings: string[];
};

/** The /api/property-scan response shape (search providers only). */
export type ScanResponse = {
  properties: ScannedProperty[];
  statuses: ProviderRunStatus[];
};

/**
 * Injected at run time so providers stay free of Node-only globals at import
 * time (keeps them tree-shakeable and unit-testable). The route supplies a
 * real, SSRF-guarded fetch; a future browser provider would supply its own.
 */
export type ScanContext = {
  fetchHtml(
    url: string,
  ): Promise<{ ok: boolean; status: number; html: string; contentType: string } | null>;
  maxResults: number;
  signal: AbortSignal;
};

/* ----------------------------- provider interface ------------------------- */

export type ProviderKind = "search" | "file" | "url";

export interface BaseProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Lower = tried/preferred first (and wins on dedupe). */
  priority: number;
  /** false for not-yet-built slots (browser automation, MLS, AI). */
  isAvailable(): boolean;
}

export interface SearchProvider extends BaseProvider {
  kind: "search";
  search(query: ScanQuery, ctx: ScanContext): Promise<ProviderResult>;
}

export interface FileProvider extends BaseProvider {
  kind: "file";
  /** Runs in the browser; reuses the existing CSV/PDF extractors. */
  ingestFile(file: File): Promise<ProviderResult>;
}

export interface UrlProvider extends BaseProvider {
  kind: "url";
  ingestUrl(url: string, ctx: ScanContext): Promise<ProviderResult>;
}

export type PropertyProvider = SearchProvider | FileProvider | UrlProvider;

/* -------------------------------- helpers --------------------------------- */

/** A fresh tracking snapshot at scan time (the engine reconciles history). */
export function freshTracking(
  price: number | null,
  now: number = Date.now(),
): PropertyTracking {
  return {
    firstSeen: now,
    lastSeen: now,
    lastScan: now,
    previousPrice: null,
    currentPrice: price,
    priceChange: null,
  };
}

const KEY_FIELDS = ["address", "price", "beds", "baths", "sqft"] as const;

/** 0–1 confidence over the key fields (shared by every provider). */
export function scoreConfidence(p: {
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
}): number {
  let found = 0;
  if (p.address) found++;
  if (p.price != null) found++;
  if (p.beds != null) found++;
  if (p.baths != null) found++;
  if (p.sqft != null) found++;
  return Math.round((found / KEY_FIELDS.length) * 100) / 100;
}
