/* -------------------------------------------------------------------------- */
/*  Universal Property Scanner — scan engine (pure).                           */
/*                                                                            */
/*  Turns normalized ScannedProperty objects into analysis-ready DealStates    */
/*  (applying the Buy Box assumptions), scores them with the EXISTING BRRRR     */
/*  engine via `dealMetrics`, applies the Buy Box gates, and ranks them. No     */
/*  BRRRR math is duplicated here — `dealMetrics` is the only source of truth.  */
/* -------------------------------------------------------------------------- */

import {
  dealMetrics,
  emptyDealState,
  type DealMetrics,
  type DealState,
} from "./deals";
import { gradeRank } from "./brrrr";
import type { ScannedProperty } from "./providers/types";
import type { BuyBox } from "./buyBox";

/* ----------------------------- listing → deal ----------------------------- */

function composeCityState(city: string, state: string, zip: string): string {
  const tail = [state.trim(), zip.trim()].filter(Boolean).join(" ");
  const c = city.trim();
  if (c && tail) return `${c}, ${tail}`;
  return c || tail;
}

/** Build an analysis-ready DealState from a scanned listing + a Buy Box. */
export function scannedToDealState(p: ScannedProperty, bb: BuyBox): DealState {
  const base = emptyDealState();
  const a = bb.assumptions;
  const price = p.price;
  const hasPrice = typeof price === "number" && price > 0;
  const arvMult = bb.arvMultiplier ?? 1.3;

  const sourceType: DealState["sourceType"] = p.listingUrl
    ? "link"
    : p.source === "csv"
      ? "csv"
      : p.source === "pdf"
        ? "pdf"
        : "manual";

  const noteLines: string[] = [];
  if (p.description.trim()) noteLines.push(p.description.trim());
  noteLines.push(
    p.listingUrl
      ? `Imported from ${p.sourceLabel} — ${p.listingUrl}`
      : `Imported from ${p.sourceLabel}`,
  );

  return {
    ...base,
    values: {
      ...base.values,
      purchasePrice: hasPrice ? price : null,
      downPayment: hasPrice ? Math.round((a.downPaymentPct / 100) * price) : null,
      purchaseInterestRate: a.purchaseRate,
      purchaseLoanTerm: a.purchaseTermYears,
      closingCosts: a.closingPct, // percent mode (see closingMode below)
      holdingCosts: a.holdingPct, // percent mode
      rehabCosts: bb.defaultRehab,
      arv: hasPrice ? Math.round(price * arvMult) : null,
      refinanceLTV: a.refinanceLTV,
      newInterestRate: a.refiRate,
      newLoanTerm: a.refiTermYears,
      monthlyRent: bb.defaultRent,
      taxes: hasPrice ? Math.round((a.taxRatePct / 100) * price) : null,
      insurance: a.insuranceAnnual,
      management: a.managementPct,
      vacancy: a.vacancyPct,
      maintenance: a.maintenancePct,
      hoa: 0,
      capexReserve: a.capexPct,
      utilities: 0,
    },
    purchaseType: "financed",
    closingMode: "percent",
    holdingMode: "percent",
    arvMode: "manual",
    subject: { sqft: p.sqft, beds: p.beds, baths: p.baths },
    property: {
      name: p.address.trim(),
      address: p.address.trim(),
      cityState: composeCityState(p.city, p.state, p.zip),
      beds: p.beds,
      baths: p.baths,
      sqft: p.sqft,
    },
    notes: noteLines.join("\n\n"),
    status: "analyzing",
    sourceType,
    sourceUrl: p.listingUrl || undefined,
    photoUrls: p.photoUrls,
    tracking: p.tracking,
    importedAt: Date.now(),
  };
}

/* -------------------------------- ranking --------------------------------- */

const dscrSortable = (m: DealMetrics) => (isFinite(m.dscr) ? m.dscr : 1e9);

/** Best → worst: engine score, then cash flow → DSCR → capital recovery → cash left. */
export function compareOpportunity(a: DealMetrics, b: DealMetrics): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.monthlyCashFlow !== a.monthlyCashFlow)
    return b.monthlyCashFlow - a.monthlyCashFlow;
  const da = dscrSortable(a);
  const db = dscrSortable(b);
  if (db !== da) return db - da;
  if (b.capitalRecoveryPct !== a.capitalRecoveryPct)
    return b.capitalRecoveryPct - a.capitalRecoveryPct;
  return a.cashLeftInDeal - b.cashLeftInDeal;
}

/* --------------------------------- gates ---------------------------------- */

export type ScanRow = {
  property: ScannedProperty;
  deal: DealState;
  metrics: DealMetrics;
  passes: boolean;
  failedGates: string[];
  unverified: boolean; // a gated field was missing, so that gate was skipped
};

function evaluateGates(
  p: ScannedProperty,
  metrics: DealMetrics,
  bb: BuyBox,
): { failedGates: string[]; unverified: boolean } {
  const failed: string[] = [];
  let unverified = false;

  if (bb.maxPrice != null) {
    if (p.price == null) unverified = true;
    else if (p.price > bb.maxPrice) failed.push("Max price");
  }
  if (bb.minBeds != null) {
    if (p.beds == null) unverified = true;
    else if (p.beds < bb.minBeds) failed.push("Min beds");
  }
  if (bb.minBaths != null) {
    if (p.baths == null) unverified = true;
    else if (p.baths < bb.minBaths) failed.push("Min baths");
  }
  if (bb.minGrade !== "Pass" && gradeRank(metrics.grade) > gradeRank(bb.minGrade)) {
    failed.push("Min grade");
  }
  if (bb.minCashFlow != null && metrics.monthlyCashFlow < bb.minCashFlow) {
    failed.push("Min cash flow");
  }
  if (bb.maxCashLeft != null && metrics.cashLeftInDeal > bb.maxCashLeft) {
    failed.push("Max cash left");
  }
  return { failedGates: failed, unverified };
}

export type ScanAnalysis = {
  rows: ScanRow[]; // passing rows, ranked best → worst
  scanned: number;
  passed: number;
  hidden: number;
  /** How many filtered-out listings failed each gate (a listing can fail more
   *  than one), for the Scanner debug panel. */
  gateReasons: { gate: string; count: number }[];
};

/** Build deals, score them via the BRRRR engine, gate, and rank. */
export function analyzeProperties(
  properties: ScannedProperty[],
  bb: BuyBox,
): ScanAnalysis {
  const all: ScanRow[] = properties.map((p) => {
    const deal = scannedToDealState(p, bb);
    const metrics = dealMetrics(deal);
    const { failedGates, unverified } = evaluateGates(p, metrics, bb);
    return {
      property: p,
      deal,
      metrics,
      passes: failedGates.length === 0,
      failedGates,
      unverified,
    };
  });
  const rows = all
    .filter((r) => r.passes)
    .sort((a, b) => compareOpportunity(a.metrics, b.metrics));

  const tally = new Map<string, number>();
  for (const r of all) {
    if (r.passes) continue;
    for (const g of r.failedGates) tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  const gateReasons = Array.from(tally.entries())
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count);

  return {
    rows,
    scanned: all.length,
    passed: rows.length,
    hidden: all.length - rows.length,
    gateReasons,
  };
}
