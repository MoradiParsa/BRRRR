/* -------------------------------------------------------------------------- */
/*  Buy Box templates + baseline analysis assumptions.                         */
/*                                                                            */
/*  A Buy Box is a saved set of filters + per-scan defaults that I can run in   */
/*  one click. The `assumptions` profile supplies the financing/operating      */
/*  inputs the BRRRR engine needs (beyond rehab/rent/ARV) so scanned metrics    */
/*  are realistic; it is editable per template and refined later in the         */
/*  Workspace. Stored in localStorage (no database).                           */
/* -------------------------------------------------------------------------- */

import { genId } from "./deals";
import { INVESTMENT_GRADES, type InvestmentGrade } from "./brrrr";

/** Financing + operating inputs applied to every scanned listing. */
export type AssumptionProfile = {
  downPaymentPct: number; // % of price
  purchaseRate: number; // annual %
  purchaseTermYears: number;
  closingPct: number; // % of price
  holdingPct: number; // % of price
  refinanceLTV: number; // %
  refiRate: number; // annual %
  refiTermYears: number;
  taxRatePct: number; // % of price / yr
  insuranceAnnual: number; // $ / yr
  managementPct: number; // % of rent
  vacancyPct: number; // % of rent
  maintenancePct: number; // % of rent
  capexPct: number; // % of rent
};

export const DEFAULT_ASSUMPTIONS: AssumptionProfile = {
  downPaymentPct: 20,
  purchaseRate: 9.5,
  purchaseTermYears: 30,
  closingPct: 3,
  holdingPct: 2,
  refinanceLTV: 75,
  refiRate: 7.25,
  refiTermYears: 30,
  taxRatePct: 1.5,
  insuranceAnnual: 1200,
  managementPct: 8,
  vacancyPct: 5,
  maintenancePct: 5,
  capexPct: 5,
};

export type BuyBox = {
  id: string;
  name: string;
  market: string;
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  minGrade: InvestmentGrade; // "Pass" = no grade gate
  minCashFlow: number | null;
  maxCashLeft: number | null;
  defaultRehab: number | null;
  defaultRent: number | null;
  arvMultiplier: number | null;
  maxResults: number;
  assumptions: AssumptionProfile;
};

export const MAX_SCAN_RESULTS = 60;

export function defaultBuyBox(): BuyBox {
  return {
    id: genId(),
    name: "",
    market: "",
    maxPrice: null,
    minBeds: null,
    minBaths: null,
    minGrade: "Pass",
    minCashFlow: null,
    maxCashLeft: null,
    defaultRehab: null,
    defaultRent: null,
    arvMultiplier: 1.3,
    maxResults: 25,
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  };
}

/** Seeded example template (matches the "Sherman BRRRR" spec). */
export function shermanSeed(): BuyBox {
  return {
    ...defaultBuyBox(),
    id: genId(),
    name: "Sherman BRRRR",
    market: "Sherman, TX",
    maxPrice: 250000,
    minBeds: 3,
    minBaths: 2,
    minGrade: "A-",
    minCashFlow: 300,
    maxCashLeft: 15000,
    defaultRehab: 40000,
    defaultRent: 2300,
    arvMultiplier: 1.35,
    maxResults: 25,
  };
}

/* ------------------------------ persistence ------------------------------- */

const STORE_KEY = "brrrr-buyboxes-v1";

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

function sanitizeAssumptions(x: unknown): AssumptionProfile {
  const o = (x ?? {}) as Record<string, unknown>;
  const pick = (k: keyof AssumptionProfile) =>
    numOrNull(o[k]) ?? DEFAULT_ASSUMPTIONS[k];
  return {
    downPaymentPct: pick("downPaymentPct"),
    purchaseRate: pick("purchaseRate"),
    purchaseTermYears: pick("purchaseTermYears"),
    closingPct: pick("closingPct"),
    holdingPct: pick("holdingPct"),
    refinanceLTV: pick("refinanceLTV"),
    refiRate: pick("refiRate"),
    refiTermYears: pick("refiTermYears"),
    taxRatePct: pick("taxRatePct"),
    insuranceAnnual: pick("insuranceAnnual"),
    managementPct: pick("managementPct"),
    vacancyPct: pick("vacancyPct"),
    maintenancePct: pick("maintenancePct"),
    capexPct: pick("capexPct"),
  };
}

export function sanitizeBuyBox(x: unknown): BuyBox {
  const o = (x ?? {}) as Record<string, unknown>;
  const base = defaultBuyBox();
  const grade = INVESTMENT_GRADES.includes(o.minGrade as InvestmentGrade)
    ? (o.minGrade as InvestmentGrade)
    : "Pass";
  const maxResults = numOrNull(o.maxResults);
  return {
    id: typeof o.id === "string" ? o.id : base.id,
    name: typeof o.name === "string" ? o.name : "",
    market: typeof o.market === "string" ? o.market : "",
    maxPrice: numOrNull(o.maxPrice),
    minBeds: numOrNull(o.minBeds),
    minBaths: numOrNull(o.minBaths),
    minGrade: grade,
    minCashFlow: numOrNull(o.minCashFlow),
    maxCashLeft: numOrNull(o.maxCashLeft),
    defaultRehab: numOrNull(o.defaultRehab),
    defaultRent: numOrNull(o.defaultRent),
    arvMultiplier: numOrNull(o.arvMultiplier) ?? 1.3,
    maxResults: maxResults ? Math.max(1, Math.min(MAX_SCAN_RESULTS, maxResults)) : 25,
    assumptions: sanitizeAssumptions(o.assumptions),
  };
}

export function loadBuyBoxes(): BuyBox[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(sanitizeBuyBox);
    }
  } catch {
    /* ignore corrupt storage */
  }
  // First run: seed the example template so there's something to run.
  const seeded = [shermanSeed()];
  saveBuyBoxes(seeded);
  return seeded;
}

export function saveBuyBoxes(boxes: BuyBox[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(boxes));
  } catch {
    /* ignore quota errors */
  }
}
