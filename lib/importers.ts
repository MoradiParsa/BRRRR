/* -------------------------------------------------------------------------- */
/*  Modular import architecture.                                              */
/*                                                                            */
/*  The Property model (DealState) never changes when new import sources are  */
/*  added. Every source — manual entry, CSV, a future Zillow/Redfin/MLS API,  */
/*  PDF OCR, or AI photo extraction — produces a list of partial drafts that  */
/*  are merged onto a blank property. To add a source later you implement     */
/*  `PropertyExtractor` and register it in IMPORT_SOURCES; nothing downstream  */
/*  (workspace, pipeline, dashboard, compare) needs to know it exists.        */
/* -------------------------------------------------------------------------- */

import { emptyDealState, type DealState } from "./deals";

export type ImportKind = "manual" | "csv" | "link" | "pdf" | "api";

export type ImportStatus = "working" | "coming-soon";

export type ImportSource = {
  id: string;
  label: string;
  description: string;
  kind: ImportKind;
  status: ImportStatus;
};

/** Raw, source-agnostic input handed to an extractor. */
export type ExtractInput = {
  url?: string;
  file?: File;
  text?: string;
};

/** A normalized result: zero or more partial properties + any warnings. */
export type ExtractResult = {
  drafts: Partial<DealState>[];
  warnings: string[];
};

/**
 * The contract every future import source implements. Today only manual / CSV
 * are wired; MLS/Zillow/Redfin/OCR/AI extractors slot in here later without
 * touching the Property model or the rest of the app.
 */
export interface PropertyExtractor {
  readonly source: ImportSource;
  isAvailable(): boolean;
  extract(input: ExtractInput): Promise<ExtractResult>;
}

/** Registry of the import sources the Add Property modal advertises. */
export const IMPORT_SOURCES: ImportSource[] = [
  {
    id: "manual",
    label: "Create Blank Property",
    description: "Start a new Acquisition Workspace from scratch.",
    kind: "manual",
    status: "working",
  },
  {
    id: "csv",
    label: "Import CSV",
    description: "Import multiple listings from a spreadsheet.",
    kind: "csv",
    status: "working",
  },
  {
    id: "link",
    label: "Paste Listing URL",
    description: "Save a Zillow, Redfin, Realtor, or MLS link to a property.",
    kind: "link",
    status: "coming-soon",
  },
  {
    id: "pdf",
    label: "Upload PDF / Flyer",
    description: "Attach an MLS flyer or offering memorandum.",
    kind: "pdf",
    status: "coming-soon",
  },
];

/** Apply extracted partial fields onto a blank property (model stays stable). */
export function applyDraft(partial: Partial<DealState>): DealState {
  return { ...emptyDealState(), ...partial };
}
