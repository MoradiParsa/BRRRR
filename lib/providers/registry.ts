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

/** FUTURE PRIMARY: opens the page in a real browser, waits for render, extracts,
 *  closes, returns normalized properties. Register the real impl at priority 10. */
export const browserAutomationSlot = unavailableSearch(
  "browser",
  "Browser automation",
  10,
);

/** FUTURE: MLS feed / API. */
export const mlsSlot = unavailableSearch("mls", "MLS", 30);

/* ------------------------------- the registry ----------------------------- */

export const PROPERTY_PROVIDERS: PropertyProvider[] = [
  browserAutomationSlot,
  zillowProvider,
  redfinProvider,
  realtorProvider,
  mlsSlot,
  csvProvider,
  pdfProvider,
].sort((a, b) => a.priority - b.priority);

export function getActiveSearchProviders(): SearchProvider[] {
  return PROPERTY_PROVIDERS.filter(
    (p): p is SearchProvider => p.kind === "search" && p.isAvailable(),
  );
}

export function getActiveFileProviders(): FileProvider[] {
  return PROPERTY_PROVIDERS.filter(
    (p): p is FileProvider => p.kind === "file" && p.isAvailable(),
  );
}
