/* -------------------------------------------------------------------------- */
/*  Saved-deals store — multiple deals in browser localStorage (no database).  */
/* -------------------------------------------------------------------------- */

import {
  analyze,
  analyzeComps,
  arvForSource,
  defaultInputs,
  investmentGrade,
  MAX_COMPS,
  summarize,
  type ArvSource,
  type Comp,
  type CompAnalysis,
  type CostMode,
  type Inputs,
  type InvestmentGrade,
  type Property,
  type PurchaseType,
  type Recommendation,
  type Subject,
} from "./brrrr";

/* ------------------------------- deal state ------------------------------- */

export type NumericKey = keyof Omit<Inputs, "purchaseType">;

export const NUMERIC_KEYS: NumericKey[] = [
  "purchasePrice",
  "downPayment",
  "purchaseInterestRate",
  "purchaseLoanTerm",
  "closingCosts",
  "holdingCosts",
  "rehabCosts",
  "arv",
  "refinanceLTV",
  "newInterestRate",
  "newLoanTerm",
  "monthlyRent",
  "taxes",
  "insurance",
  "management",
  "vacancy",
  "maintenance",
  "hoa",
  "capexReserve",
  "utilities",
];

export type Values = Record<NumericKey, number | null>;

/** Everything the analyzer edits for one property. */
export type DealState = {
  values: Values;
  purchaseType: PurchaseType;
  closingMode: CostMode;
  holdingMode: CostMode;
  subject: Subject;
  comps: Comp[];
  arvMode: ArvSource;
  property: Property;
};

export type SavedDeal = DealState & {
  id: string;
  createdAt: number;
  savedAt: number;
};

const ARV_SOURCES: ArvSource[] = [
  "manual",
  "comp",
  "conservative",
  "average",
  "aggressive",
];

/* ------------------------------- constants -------------------------------- */

export const EMPTY_VALUES = Object.fromEntries(
  NUMERIC_KEYS.map((k) => [k, null]),
) as Values;

export const EXAMPLE_VALUES = Object.fromEntries(
  NUMERIC_KEYS.map((k) => [k, defaultInputs[k] as number]),
) as Values;

export const EMPTY_SUBJECT: Subject = { sqft: null, beds: null, baths: null };
export const EXAMPLE_SUBJECT: Subject = { sqft: 1400, beds: 3, baths: 2 };

export const EMPTY_PROPERTY: Property = {
  name: "",
  address: "",
  cityState: "",
  beds: null,
  baths: null,
  sqft: null,
};
export const EXAMPLE_PROPERTY: Property = {
  name: "Maple Street Rental",
  address: "742 Maple St",
  cityState: "Springfield, IL",
  beds: 3,
  baths: 2,
  sqft: 1400,
};

export const EXAMPLE_COMPS: Comp[] = [
  { id: "ex1", address: "123 Oak St", salePrice: 215000, sqft: 1450, beds: 3, baths: 2, distance: 0.4, daysSinceSale: 35, reno: "Similar", included: true, notes: "" },
  { id: "ex2", address: "456 Maple Ave", salePrice: 199000, sqft: 1350, beds: 3, baths: 2, distance: 0.7, daysSinceSale: 60, reno: "Similar", included: true, notes: "" },
  { id: "ex3", address: "789 Pine Rd", salePrice: 228000, sqft: 1500, beds: 4, baths: 2, distance: 1.1, daysSinceSale: 90, reno: "Superior", included: true, notes: "Larger, higher-end finishes" },
  { id: "ex4", address: "321 Elm St", salePrice: 192000, sqft: 1300, beds: 3, baths: 1.5, distance: 0.9, daysSinceSale: 120, reno: "Basic", included: true, notes: "" },
  { id: "ex5", address: "654 Birch Ln", salePrice: 221000, sqft: 1480, beds: 3, baths: 2.5, distance: 1.5, daysSinceSale: 150, reno: "Similar", included: true, notes: "" },
];

export function emptyDealState(): DealState {
  return {
    values: { ...EMPTY_VALUES },
    purchaseType: defaultInputs.purchaseType,
    closingMode: "dollar",
    holdingMode: "dollar",
    subject: { ...EMPTY_SUBJECT },
    comps: [],
    arvMode: "manual",
    property: { ...EMPTY_PROPERTY },
  };
}

export function exampleDealState(): DealState {
  return {
    values: { ...EXAMPLE_VALUES },
    purchaseType: defaultInputs.purchaseType,
    closingMode: "dollar",
    holdingMode: "dollar",
    subject: { ...EXAMPLE_SUBJECT },
    comps: EXAMPLE_COMPS.map((c) => ({ ...c })),
    arvMode: "manual",
    property: { ...EXAMPLE_PROPERTY },
  };
}

/* --------------------------------- ids ------------------------------------ */

export function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

export function newComp(): Comp {
  return {
    id: genId(),
    address: "",
    salePrice: null,
    sqft: null,
    beds: null,
    baths: null,
    distance: null,
    daysSinceSale: null,
    reno: "Similar",
    included: true,
    notes: "",
  };
}

/* ------------------------------ sanitization ------------------------------ */

const numOrNull = (v: unknown) =>
  typeof v === "number" && isFinite(v) ? v : null;

function sanitizeComp(x: unknown): Comp | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const reno: Comp["reno"] =
    o.reno === "Basic" || o.reno === "Superior" ? o.reno : "Similar";
  return {
    id: typeof o.id === "string" ? o.id : genId(),
    address: typeof o.address === "string" ? o.address : "",
    salePrice: numOrNull(o.salePrice),
    sqft: numOrNull(o.sqft),
    beds: numOrNull(o.beds),
    baths: numOrNull(o.baths),
    distance: numOrNull(o.distance),
    daysSinceSale: numOrNull(o.daysSinceSale),
    reno,
    included: o.included !== false,
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

function sanitizeProperty(x: unknown): Property {
  if (!x || typeof x !== "object") return { ...EMPTY_PROPERTY };
  const o = x as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    name: str(o.name),
    address: str(o.address),
    cityState: str(o.cityState),
    beds: numOrNull(o.beds),
    baths: numOrNull(o.baths),
    sqft: numOrNull(o.sqft),
  };
}

export function sanitizeDealState(x: unknown): DealState {
  const o = (x ?? {}) as Record<string, unknown>;
  const values = { ...EMPTY_VALUES };
  const rawValues = o.values as Record<string, unknown> | undefined;
  if (rawValues && typeof rawValues === "object") {
    for (const k of NUMERIC_KEYS) values[k] = numOrNull(rawValues[k]);
  }
  const rawComps = Array.isArray(o.comps) ? o.comps : [];
  return {
    values,
    purchaseType: o.purchaseType === "cash" ? "cash" : "financed",
    closingMode: o.closingMode === "percent" ? "percent" : "dollar",
    holdingMode: o.holdingMode === "percent" ? "percent" : "dollar",
    subject: {
      sqft: numOrNull((o.subject as Record<string, unknown>)?.sqft),
      beds: numOrNull((o.subject as Record<string, unknown>)?.beds),
      baths: numOrNull((o.subject as Record<string, unknown>)?.baths),
    },
    comps: rawComps
      .map(sanitizeComp)
      .filter((c): c is Comp => c !== null)
      .slice(0, MAX_COMPS),
    arvMode: ARV_SOURCES.includes(o.arvMode as ArvSource)
      ? (o.arvMode as ArvSource)
      : "manual",
    property: sanitizeProperty(o.property),
  };
}

function sanitizeSavedDeal(x: unknown): SavedDeal {
  const o = (x ?? {}) as Record<string, unknown>;
  const now = Date.now();
  return {
    ...sanitizeDealState(o),
    id: typeof o.id === "string" ? o.id : genId(),
    createdAt: numOrNull(o.createdAt) ?? now,
    savedAt: numOrNull(o.savedAt) ?? now,
  };
}

/* ----------------------------- effective inputs --------------------------- */

function effectiveCost(
  value: number | null,
  mode: CostMode,
  purchasePrice: number,
): number {
  const v = value ?? 0;
  return mode === "percent" ? (v / 100) * purchasePrice : v;
}

/** Build the numeric Inputs the engine consumes from a deal's editable state. */
export function resolveInputs(
  values: Values,
  purchaseType: PurchaseType,
  closingMode: CostMode,
  holdingMode: CostMode,
  effectiveArv: number,
): Inputs {
  const out: Record<string, unknown> = { purchaseType };
  for (const k of NUMERIC_KEYS) out[k] = values[k] ?? 0;
  const price = values.purchasePrice ?? 0;
  out.closingCosts = effectiveCost(values.closingCosts, closingMode, price);
  out.holdingCosts = effectiveCost(values.holdingCosts, holdingMode, price);
  out.arv = effectiveArv;
  return out as Inputs;
}

export function dealInputs(deal: DealState): {
  inputs: Inputs;
  compAnalysis: CompAnalysis;
  manualArv: number;
  compArv: number;
  effectiveArv: number;
} {
  const compAnalysis = analyzeComps(deal.subject, deal.comps);
  const manualArv = deal.values.arv ?? 0;
  const compArv = compAnalysis.averageARV;
  const effectiveArv = arvForSource(deal.arvMode, manualArv, compArv);
  const inputs = resolveInputs(
    deal.values,
    deal.purchaseType,
    deal.closingMode,
    deal.holdingMode,
    effectiveArv,
  );
  return { inputs, compAnalysis, manualArv, compArv, effectiveArv };
}

/* ------------------------------- deal metrics ----------------------------- */

export type DealMetrics = {
  hasDeal: boolean;
  recommendation: Recommendation;
  stars: number;
  score: number;
  grade: InvestmentGrade;
  purchasePrice: number;
  arv: number;
  monthlyRent: number;
  monthlyCashFlow: number;
  capitalRecoveryPct: number;
  cashLeftInDeal: number;
  cashOutSurplus: number;
  dscr: number;
};

/** Derive dashboard-facing metrics for a deal (no stored derived data). */
export function dealMetrics(deal: DealState): DealMetrics {
  const { inputs } = dealInputs(deal);
  const r = analyze(inputs);
  const s = summarize(inputs, r);
  const hasDeal =
    (deal.values.purchasePrice ?? 0) > 0 ||
    (deal.values.arv ?? 0) > 0 ||
    (deal.values.monthlyRent ?? 0) > 0;
  return {
    hasDeal,
    recommendation: s.recommendation,
    stars: s.stars,
    score: s.score,
    grade: investmentGrade(s.score, s.recommendation),
    purchasePrice: inputs.purchasePrice,
    arv: inputs.arv,
    monthlyRent: inputs.monthlyRent,
    monthlyCashFlow: r.monthlyCashFlow,
    capitalRecoveryPct: r.brrrrPct,
    cashLeftInDeal: r.cashLeftInDeal,
    cashOutSurplus: r.cashOutSurplus,
    dscr: r.dscr,
  };
}

export function dealTitle(deal: DealState): string {
  return (
    deal.property.name.trim() ||
    deal.property.address.trim() ||
    "Untitled deal"
  );
}

/* ------------------------------- persistence ------------------------------ */

const STORE_KEY = "brrrr-deals-v1";
const LEGACY_KEY = "brrrr-deal-v1";

export function loadDeals(): SavedDeal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : parsed?.deals;
      if (Array.isArray(arr)) return arr.map(sanitizeSavedDeal);
    }
    // One-time migration of the old single-deal key.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const p = JSON.parse(legacy);
      if (p && p.values) {
        const deal = sanitizeSavedDeal({
          ...p,
          id: genId(),
          createdAt: numOrNull(p.savedAt) ?? Date.now(),
          savedAt: numOrNull(p.savedAt) ?? Date.now(),
        });
        const deals = [deal];
        saveDeals(deals);
        return deals;
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return [];
}

export function saveDeals(deals: SavedDeal[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(deals));
  } catch {
    /* ignore quota errors */
  }
}

export function makeSavedDeal(state: DealState): SavedDeal {
  const now = Date.now();
  return { ...state, id: genId(), createdAt: now, savedAt: now };
}

export function duplicateDeal(deal: SavedDeal): SavedDeal {
  const now = Date.now();
  const copyName =
    (deal.property.name.trim() || "Untitled deal") + " (Copy)";
  return {
    ...sanitizeDealState(deal),
    property: { ...deal.property, name: copyName },
    comps: deal.comps.map((c) => ({ ...c, id: genId() })),
    id: genId(),
    createdAt: now,
    savedAt: now,
  };
}
