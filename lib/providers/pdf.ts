/* PDF / document file provider — wraps the existing local extractor
 * (lib/extraction.ts) so there is one extraction codebase. Runs in the browser.
 * Text-based PDFs are parsed locally (no AI/OCR); scanned PDFs and images
 * return `empty` (image OCR needs an AI/OCR service, which isn't enabled). */

import { extractProperty, type ExtractedFields } from "../extraction";
import { propertyKey } from "../deals";
import {
  freshTracking,
  scoreConfidence,
  type FileProvider,
  type ProviderResult,
  type ScannedProperty,
} from "./types";

const toInt = (s: string): number | null => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const toDec = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function extractedToScanned(
  f: ExtractedFields,
  confidence: number,
  now: number,
): ScannedProperty {
  const price = toInt(f.price);
  const beds = toInt(f.beds);
  const baths = toDec(f.baths);
  const sqft = toInt(f.sqft);
  const address = f.address.trim();
  return {
    propertyKey: propertyKey({ address, city: f.city, state: f.state, zip: f.zip }),
    source: "pdf",
    sourceLabel: "PDF / document",
    listingUrl: "",
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
    photoUrls: [],
    tracking: freshTracking(price, now),
    confidence,
    warnings: [],
  };
}

export const pdfProvider: FileProvider = {
  id: "pdf",
  label: "PDF / document",
  kind: "file",
  priority: 41,
  isAvailable: () => true,
  async ingestFile(file: File): Promise<ProviderResult> {
    const result = await extractProperty(file);
    if (result.limited) {
      return {
        providerId: "pdf",
        status: "empty",
        properties: [],
        warnings: result.warnings,
      };
    }
    const sp = extractedToScanned(result.extracted, result.confidence, Date.now());
    if (!sp.address && sp.price == null) {
      return {
        providerId: "pdf",
        status: "empty",
        properties: [],
        warnings: [
          "We read the document but couldn't find an address or price to scan.",
          ...result.warnings,
        ],
      };
    }
    return { providerId: "pdf", status: "ok", properties: [sp], warnings: result.warnings };
  },
};
