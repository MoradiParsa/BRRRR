/* -------------------------------------------------------------------------- */
/*  Universal Property Scanner — provider registry.                            */
/*                                                                            */
/*  The whole engine is provider-based: to add a new data source you implement */
/*  the right provider interface (types.ts) and register it here. Nothing      */
/*  downstream — the BRRRR engine, the scan engine, the Deal Queue, or the UI  */
/*  — needs to change.                                                         */
/*                                                                            */
/*  Priority ladder (lower = preferred / tried first, and wins on dedupe):     */
/*    10  Browser-Automation  search  (FUTURE PRIMARY — not built; no Playwright yet)
/*    20  Zillow              search  ✅ static (often blocked → graceful)      */
/*    21  Redfin              search  ✅ static                                 */
/*    22  Realtor.com         search  ✅ static                                 */
/*    30  MLS                 search  (FUTURE — no public API)                  */
/*    40  CSV                 file    ✅ wraps csvToPreviewRows (real, unblocked)*/
/*    41  PDF / document       file    ✅ wraps local extractor (text PDFs)      */
/*    50  AI enrichers         —       (FUTURE — reno scoring / rehab / ARV / rent;
/*                                      consume saved photoUrls; no model change)*/
/* -------------------------------------------------------------------------- */

import { zillowProvider } from "./zillow";
import { redfinProvider } from "./redfin";
import { realtorProvider } from "./realtor";
import { csvProvider } from "./csv";
import { pdfProvider } from "./pdf";
import { browserProvider } from "./browser";
import type {
  FileProvider,
  PropertyProvider,
  ProviderResult,
  SearchProvider,
} from "./types";

/* --------------------------- future provider slots ------------------------ */
/* Registered but unavailable so the architecture literally holds the slot;    */
/* `getActive*` filters them out until they are implemented + enabled.         */

const unavailableSearch = (
  id: string,
  label: string,
  priority: number,
): SearchProvider => ({
  id,
  label,
  kind: "search",
  priority,
  isAvailable: () => false,
  async search(): Promise<ProviderResult> {
    return { providerId: id, status: "unavailable", properties: [], warnings: [] };
  },
});

/** FUTURE: MLS feed / API. */
export const mlsSlot = unavailableSearch("mls", "MLS", 30);

/* ------------------------------- the registry ----------------------------- */

export const PROPERTY_PROVIDERS: PropertyProvider[] = [
  browserProvider,
  zillowProvider,
  redfinProvider,
  realtorProvider,
  mlsSlot,
  csvProvider,
  pdfProvider,
].sort((a, b) => a.priority - b.priority);

const STATIC_PORTAL_IDS = new Set(["zillow", "redfin", "realtor"]);

export function getActiveSearchProviders(): SearchProvider[] {
  const active = PROPERTY_PROVIDERS.filter(
    (p): p is SearchProvider => p.kind === "search" && p.isAvailable(),
  );
  // When the browser provider is enabled it is the single portal provider —
  // drop the static Zillow/Redfin/Realtor fetchers so we don't hit those sites
  // twice. They automatically return when SCANNER_BROWSER is unset.
  if (active.some((p) => p.id === "browser")) {
    return active.filter((p) => p.id === "browser" || !STATIC_PORTAL_IDS.has(p.id));
  }
  return active;
}

export function getActiveFileProviders(): FileProvider[] {
  return PROPERTY_PROVIDERS.filter(
    (p): p is FileProvider => p.kind === "file" && p.isAvailable(),
  );
}
