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
  sensitivity,
  summarize,
  type ArvSource,
  type Comp,
  type CompAnalysis,
  type CostMode,
  type Inputs,
  type InvestmentGrade,
  type Level,
  type Property,
  type PurchaseType,
  type Recommendation,
  type Subject,
  type Verdict,
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

export type SourceType = "manual" | "link" | "pdf" | "csv";

/** Where a property sits in the acquisition pipeline. */
export type PipelineStatus =
  | "watching"
  | "analyzing"
  | "offer_submitted"
  | "under_contract"
  | "owned"
  | "archived";

export const PIPELINE_STATUSES: { value: PipelineStatus; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "analyzing", label: "Analyzing" },
  { value: "offer_submitted", label: "Offer Submitted" },
  { value: "under_contract", label: "Under Contract" },
  { value: "owned", label: "Owned" },
  { value: "archived", label: "Archived" },
];

export function statusLabel(s: PipelineStatus): string {
  return PIPELINE_STATUSES.find((x) => x.value === s)?.label ?? "Analyzing";
}

/** Everything the workspace edits for one property. */
export type DealState = {
  values: Values;
  purchaseType: PurchaseType;
  closingMode: CostMode;
  holdingMode: CostMode;
  subject: Subject;
  comps: Comp[];
  arvMode: ArvSource;
  property: Property;
  notes: string;
  // Acquisition pipeline stage.
  status: PipelineStatus;
  // Where this property came from (import metadata).
  sourceType: SourceType;
  sourceUrl?: string;
  sourceFileName?: string;
  sourceNotes?: string;
  importedAt?: number;
};

export type SavedDeal = DealState & {
  id: string;
  createdAt: number;
  savedAt: number;
};

/** Strip persistence metadata, leaving just the editable deal state. */
export function toDealState(d: SavedDeal): DealState {
  const { id: _id, createdAt: _c, savedAt: _s, ...rest } = d;
  return rest;
}

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
    notes: "",
    status: "analyzing",
    sourceType: "manual",
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
    notes: "",
    status: "analyzing",
    sourceType: "manual",
  };
}

/* ------------------------------ import drafts ----------------------------- */

/** A blank draft that records the listing link it came from. */
export function linkDealState(url: string, notes: string): DealState {
  return {
    ...emptyDealState(),
    sourceType: "link",
    sourceUrl: url.trim(),
    sourceNotes: notes.trim() || undefined,
    importedAt: Date.now(),
  };
}

/** A blank draft that records an uploaded document's filename. */
export function pdfDealState(fileName: string): DealState {
  return {
    ...emptyDealState(),
    sourceType: "pdf",
    sourceFileName: fileName,
    importedAt: Date.now(),
  };
}

export type CsvRow = {
  name: string;
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter(
    (r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ""),
  );
}

/** Map a listings CSV to preview rows, matching columns by fuzzy header name. */
export function csvToPreviewRows(text: string): CsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.includes(k)));
  const iAddr = find("address", "street");
  const iName = find("name", "title", "property");
  const iPrice = find("price", "list", "purchase", "asking");
  const iBeds = find("bed", "br");
  const iBaths = find("bath");
  const iSqft = find("sqft", "sq ft", "square", "size");

  const num = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  };

  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");
    const address = get(iAddr);
    const name = get(iName) || address;
    const price = num(get(iPrice));
    const beds = num(get(iBeds));
    const baths = num(get(iBaths));
    const sqft = num(get(iSqft));
    if (!address && !name && price == null && beds == null && sqft == null) {
      continue; // skip blank rows
    }
    out.push({ name, address, price, beds, baths, sqft });
  }
  return out;
}

/** Build a deal draft from one parsed CSV row. */
export function csvRowToDealState(row: CsvRow, fileName: string): DealState {
  const base = emptyDealState();
  return {
    ...base,
    values: { ...base.values, purchasePrice: row.price },
    subject: { sqft: row.sqft, beds: row.beds, baths: row.baths },
    property: {
      name: row.name,
      address: row.address,
      cityState: "",
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
    },
    sourceType: "csv",
    sourceFileName: fileName,
    importedAt: Date.now(),
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
    notes: typeof o.notes === "string" ? o.notes : "",
    status: PIPELINE_STATUSES.some((s) => s.value === o.status)
      ? (o.status as PipelineStatus)
      : "analyzing",
    sourceType: (["manual", "link", "pdf", "csv"] as const).includes(
      o.sourceType as SourceType,
    )
      ? (o.sourceType as SourceType)
      : "manual",
    sourceUrl: typeof o.sourceUrl === "string" ? o.sourceUrl : undefined,
    sourceFileName:
      typeof o.sourceFileName === "string" ? o.sourceFileName : undefined,
    sourceNotes: typeof o.sourceNotes === "string" ? o.sourceNotes : undefined,
    importedAt: numOrNull(o.importedAt) ?? undefined,
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
  equityCreated: number;
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
    equityCreated: r.equityCreated,
    dscr: r.dscr,
  };
}

export function dealTitle(deal: DealState): string {
  return (
    deal.property.name.trim() ||
    deal.property.address.trim() ||
    "Untitled property"
  );
}

/* --------------------------- portfolio summary ---------------------------- */

export type PortfolioSummary = {
  totalDeals: number;
  buyCount: number;
  cautionCount: number;
  passCount: number;
  completeCount: number;
  avgScore: number;
  totalMonthlyCashFlow: number;
  avgMonthlyCashFlow: number;
  totalEquityCreated: number;
  statusCounts: Record<PipelineStatus, number>;
};

/** Aggregate stats across saved properties for the dashboard overview. */
export function portfolioSummary(deals: DealState[]): PortfolioSummary {
  const metrics = deals.map(dealMetrics);
  const complete = metrics.filter((m) => m.hasDeal);
  const sumScore = complete.reduce((a, m) => a + m.score, 0);
  const totalCf = complete.reduce((a, m) => a + m.monthlyCashFlow, 0);

  const statusCounts = PIPELINE_STATUSES.reduce(
    (acc, s) => {
      acc[s.value] = 0;
      return acc;
    },
    {} as Record<PipelineStatus, number>,
  );
  for (const d of deals) statusCounts[d.status]++;

  return {
    totalDeals: deals.length,
    buyCount: metrics.filter((m) => m.hasDeal && m.recommendation === "Buy")
      .length,
    cautionCount: metrics.filter(
      (m) => m.hasDeal && m.recommendation === "Buy with Caution",
    ).length,
    passCount: metrics.filter((m) => m.hasDeal && m.recommendation === "Pass")
      .length,
    completeCount: complete.length,
    avgScore: complete.length ? Math.round(sumScore / complete.length) : 0,
    totalMonthlyCashFlow: totalCf,
    avgMonthlyCashFlow: complete.length ? totalCf / complete.length : 0,
    totalEquityCreated: complete.reduce((a, m) => a + m.equityCreated, 0),
    statusCounts,
  };
}

/* --------------------------- comparison metrics --------------------------- */

/** The full metric set used by the Compare page (includes sensitivity, which
 *  is heavier — so it's kept separate from the dashboard's dealMetrics). */
export type CompareMetrics = {
  hasDeal: boolean;
  recommendation: Recommendation;
  stars: number;
  score: number;
  grade: InvestmentGrade;
  risk: Level;
  purchasePrice: number;
  rehabCost: number;
  cashInvested: number;
  arvUsed: number;
  arvSource: ArvSource;
  monthlyRent: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  dscr: number;
  capRate: number;
  cashOnCash: number;
  capitalRecoveryPct: number;
  cashLeftInDeal: number;
  cashOutSurplus: number;
  equityCreated: number;
  breakEvenRent: number;
  rentForDSCR120: number;
  worstCaseVerdict: Verdict;
  worstCaseCashFlow: number;
};

export function compareMetrics(deal: DealState): CompareMetrics {
  const { inputs } = dealInputs(deal);
  const r = analyze(inputs);
  const s = summarize(inputs, r);
  const sens = sensitivity(inputs);
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
    risk: s.risk,
    purchasePrice: inputs.purchasePrice,
    rehabCost: inputs.rehabCosts,
    cashInvested: r.cashInvested,
    arvUsed: inputs.arv,
    arvSource: deal.arvMode,
    monthlyRent: inputs.monthlyRent,
    monthlyCashFlow: r.monthlyCashFlow,
    annualCashFlow: r.annualCashFlow,
    dscr: r.dscr,
    capRate: r.capRate,
    cashOnCash: r.cashOnCash,
    capitalRecoveryPct: r.brrrrPct,
    cashLeftInDeal: r.cashLeftInDeal,
    cashOutSurplus: r.cashOutSurplus,
    equityCreated: r.equityCreated,
    breakEvenRent: r.breakEvenRent,
    rentForDSCR120: r.rentForDSCR120,
    worstCaseVerdict: sens.worstCase.verdict,
    worstCaseCashFlow: sens.worstCase.monthlyCashFlow,
  };
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
    (deal.property.name.trim() || "Untitled property") + " (Copy)";
  return {
    ...sanitizeDealState(deal),
    property: { ...deal.property, name: copyName },
    comps: deal.comps.map((c) => ({ ...c, id: genId() })),
    id: genId(),
    createdAt: now,
    savedAt: now,
  };
}
