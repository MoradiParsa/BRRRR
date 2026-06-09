/* CSV file provider — wraps the existing csvToPreviewRows parser (lib/deals.ts)
 * so there is one CSV codebase. Runs in the browser (reads a local File). This
 * is a real, unblocked data path today (MLS/Zillow/Redfin CSV exports). */

import { csvToPreviewRows, propertyKey, type CsvRow } from "../deals";
import {
  freshTracking,
  scoreConfidence,
  type FileProvider,
  type ProviderResult,
  type ScannedProperty,
} from "./types";

function rowToScanned(row: CsvRow, now: number): ScannedProperty {
  const address = row.address.trim();
  return {
    propertyKey: propertyKey({ address }),
    source: "csv",
    sourceLabel: "CSV import",
    listingUrl: "",
    address,
    city: "",
    state: "",
    zip: "",
    price: row.price,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    lotSize: "",
    yearBuilt: "",
    description: "",
    photoUrls: [],
    tracking: freshTracking(row.price, now),
    confidence: scoreConfidence({
      address,
      price: row.price,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
    }),
    warnings: [],
  };
}

export const csvProvider: FileProvider = {
  id: "csv",
  label: "CSV import",
  kind: "file",
  priority: 40,
  isAvailable: () => true,
  async ingestFile(file: File): Promise<ProviderResult> {
    let text = "";
    try {
      text = await file.text();
    } catch {
      return {
        providerId: "csv",
        status: "error",
        properties: [],
        warnings: ["Could not read that file."],
      };
    }
    let rows: CsvRow[] = [];
    try {
      rows = csvToPreviewRows(text);
    } catch {
      return {
        providerId: "csv",
        status: "error",
        properties: [],
        warnings: ["Could not parse that file as CSV."],
      };
    }
    if (rows.length === 0) {
      return {
        providerId: "csv",
        status: "empty",
        properties: [],
        warnings: [
          "No rows found. Add a header row with columns like address, price, beds, baths, sqft.",
        ],
      };
    }
    const now = Date.now();
    return {
      providerId: "csv",
      status: "ok",
      properties: rows.map((r) => rowToScanned(r, now)),
      warnings: [],
    };
  },
};
