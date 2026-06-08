/* -------------------------------------------------------------------------- */
/*  BRRRR Analyzer — calculation & analysis engine                            */
/* -------------------------------------------------------------------------- */

export type PurchaseType = "cash" | "financed";

/** Cost fields can be entered as a fixed dollar amount or a % of purchase price. */
export type CostMode = "dollar" | "percent";

export type Inputs = {
  // Phase 1 — Purchase
  purchasePrice: number;
  purchaseType: PurchaseType;
  downPayment: number; // $ (financed only)
  purchaseInterestRate: number; // annual %
  purchaseLoanTerm: number; // years
  closingCosts: number; // $
  holdingCosts: number; // $
  rehabCosts: number; // $

  // Phase 2 — Refinance
  arv: number; // $
  refinanceLTV: number; // %
  newInterestRate: number; // annual %
  newLoanTerm: number; // years

  // Phase 3 — Rental
  monthlyRent: number; // $
  taxes: number; // $ annual
  insurance: number; // $ annual
  management: number; // % of rent
  vacancy: number; // % of rent
  maintenance: number; // % of rent
  hoa: number; // $ monthly
  capexReserve: number; // % of rent
  utilities: number; // $ monthly (optional, landlord-paid)
};

export const defaultInputs: Inputs = {
  purchasePrice: 112000,
  purchaseType: "financed",
  downPayment: 28000,
  purchaseInterestRate: 9.5,
  purchaseLoanTerm: 30,
  closingCosts: 4000,
  holdingCosts: 3000,
  rehabCosts: 35000,

  arv: 210000,
  refinanceLTV: 72,
  newInterestRate: 7.25,
  newLoanTerm: 30,

  monthlyRent: 2050,
  taxes: 2200,
  insurance: 1100,
  management: 8,
  vacancy: 5,
  maintenance: 5,
  hoa: 0,
  capexReserve: 5,
  utilities: 0,
};

/* ------------------------------- math helpers ----------------------------- */

function amortizedPayment(
  principal: number,
  annualRatePct: number,
  years: number,
): number {
  const n = years * 12;
  if (n <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/* --------------------------------- results -------------------------------- */

export type Results = {
  financed: boolean;

  // Purchase
  purchaseLoanAmount: number;
  purchaseMonthlyPayment: number;
  totalProjectCost: number;
  cashInvested: number;

  // Refinance
  refinanceAmount: number; // refinance proceeds = ARV × LTV
  originalLoanPayoff: number; // purchase loan paid off at refinance
  netCashAvailable: number; // proceeds − payoff (can be negative)
  capitalRecovered: number; // portion of invested cash returned (≤ cashInvested)
  cashLeftInDeal: number; // invested cash still tied up (≥ 0)
  cashOutSurplus: number; // cash pulled out beyond what was invested (≥ 0)
  newMonthlyPayment: number;

  // Operating
  operatingExpenses: number;
  monthlyNOI: number;
  annualNOI: number;
  monthlyCashFlow: number;
  annualCashFlow: number;

  // Returns & ratios
  dscr: number;
  capRate: number;
  cashOnCash: number;
  equityCreated: number;
  equityAfterRefi: number;
  brrrrPct: number;
  totalROI: number;

  // Rent thresholds
  breakEvenRent: number;
  rentFor0: number;
  rentFor200: number;
  rentFor500: number;
  rentForDSCR120: number;

  maxOffer70: number;
};

export function analyze(i: Inputs): Results {
  const financed = i.purchaseType === "financed";

  const purchaseLoanAmount = financed
    ? Math.max(i.purchasePrice - i.downPayment, 0)
    : 0;
  const purchaseMonthlyPayment = amortizedPayment(
    purchaseLoanAmount,
    i.purchaseInterestRate,
    i.purchaseLoanTerm,
  );

  const totalProjectCost =
    i.purchasePrice + i.rehabCosts + i.closingCosts + i.holdingCosts;

  // Out-of-pocket cash before the refinance
  const cashInvested =
    (financed ? i.downPayment : i.purchasePrice) +
    i.rehabCosts +
    i.closingCosts +
    i.holdingCosts;

  // Refinance — the cash-out pays off any purchase loan first, then returns
  // the rest to you. We break the result into clear, never-negative pieces.
  const refinanceAmount = i.arv * (i.refinanceLTV / 100); // proceeds
  const originalLoanPayoff = purchaseLoanAmount;
  const netCashAvailable = refinanceAmount - originalLoanPayoff;
  const capitalRecovered = Math.min(Math.max(netCashAvailable, 0), cashInvested);
  const cashLeftInDeal = Math.max(cashInvested - netCashAvailable, 0);
  const cashOutSurplus = Math.max(netCashAvailable - cashInvested, 0);
  const newMonthlyPayment = amortizedPayment(
    refinanceAmount,
    i.newInterestRate,
    i.newLoanTerm,
  );

  // Operating expenses (everything except the new mortgage)
  const variablePct =
    (i.management + i.vacancy + i.maintenance + i.capexReserve) / 100;
  const fixedMonthly = i.taxes / 12 + i.insurance / 12 + i.hoa + i.utilities;
  const variableMonthly = variablePct * i.monthlyRent;
  const operatingExpenses = fixedMonthly + variableMonthly;

  const monthlyNOI = i.monthlyRent - operatingExpenses;
  const annualNOI = monthlyNOI * 12;
  const monthlyCashFlow = monthlyNOI - newMonthlyPayment;
  const annualCashFlow = monthlyCashFlow * 12;

  const dscr = newMonthlyPayment > 0 ? monthlyNOI / newMonthlyPayment : Infinity;
  const capRate = i.arv > 0 ? (annualNOI / i.arv) * 100 : 0;
  const cashOnCash =
    cashLeftInDeal > 0 ? (annualCashFlow / cashLeftInDeal) * 100 : Infinity;

  const equityCreated = i.arv - totalProjectCost;
  const equityAfterRefi = i.arv - refinanceAmount;
  // BRRRR % can exceed 100 when you pull out more than you put in.
  const brrrrPct =
    cashInvested > 0
      ? (Math.max(netCashAvailable, 0) / cashInvested) * 100
      : Infinity;
  const totalROI =
    cashInvested > 0
      ? ((annualCashFlow + equityCreated) / cashInvested) * 100
      : Infinity;

  // Required rent solves: rent*(1 - variablePct) - fixed - payment = target
  const denom = 1 - variablePct;
  const rentForCashFlow = (target: number) =>
    denom > 0 ? (fixedMonthly + newMonthlyPayment + target) / denom : Infinity;
  const rentForDSCR120 =
    denom > 0 ? (fixedMonthly + 1.2 * newMonthlyPayment) / denom : Infinity;

  return {
    financed,
    purchaseLoanAmount,
    purchaseMonthlyPayment,
    totalProjectCost,
    cashInvested,
    refinanceAmount,
    originalLoanPayoff,
    netCashAvailable,
    capitalRecovered,
    cashLeftInDeal,
    cashOutSurplus,
    newMonthlyPayment,
    operatingExpenses,
    monthlyNOI,
    annualNOI,
    monthlyCashFlow,
    annualCashFlow,
    dscr,
    capRate,
    cashOnCash,
    equityCreated,
    equityAfterRefi,
    brrrrPct,
    totalROI,
    breakEvenRent: rentForCashFlow(0),
    rentFor0: rentForCashFlow(0),
    rentFor200: rentForCashFlow(200),
    rentFor500: rentForCashFlow(500),
    rentForDSCR120,
    maxOffer70: i.arv * 0.7 - i.rehabCosts,
  };
}

/* ------------------------------- deal summary ----------------------------- */

export type Recommendation = "Buy" | "Buy with Caution" | "Pass";
export type Level = "Low" | "Medium" | "High";

export type Finding = { title: string; detail: string };

export type Summary = {
  score: number; // 0–100
  stars: number; // 0–5 (half-step)
  recommendation: Recommendation;
  recommendationReason: string;
  risk: Level;
  confidence: Level;
  strengths: Finding[];
  weaknesses: Finding[];
};

function band(value: number, steps: [number, number][]): number {
  for (const [threshold, s] of steps) {
    if (value >= threshold) return s;
  }
  return 0;
}

export function summarize(i: Inputs, r: Results): Summary {
  // ---- component sub-scores (0–1) ----
  const cfScore = band(r.monthlyCashFlow, [
    [500, 1],
    [300, 0.85],
    [200, 0.7],
    [100, 0.5],
    [0, 0.3],
  ]);

  const dscrScore = !isFinite(r.dscr)
    ? 1
    : band(r.dscr, [
        [1.5, 1],
        [1.35, 0.85],
        [1.25, 0.7],
        [1.15, 0.55],
        [1.05, 0.4],
        [1.0, 0.3],
      ]);

  const cocScore = !isFinite(r.cashOnCash)
    ? 1
    : band(r.cashOnCash, [
        [15, 1],
        [12, 0.85],
        [10, 0.7],
        [8, 0.55],
        [5, 0.4],
        [0.0001, 0.25],
      ]);

  const brrrrScore = !isFinite(r.brrrrPct)
    ? 1
    : band(r.brrrrPct, [
        [100, 1],
        [85, 0.8],
        [70, 0.6],
        [50, 0.4],
        [30, 0.2],
      ]) || 0.1;

  const capScore = band(r.capRate, [
    [8, 1],
    [7, 0.85],
    [6, 0.7],
    [5, 0.5],
    [4, 0.3],
  ]) || 0.15;

  let score =
    (cfScore * 0.3 +
      dscrScore * 0.2 +
      cocScore * 0.2 +
      brrrrScore * 0.15 +
      capScore * 0.15) *
    100;

  // Hard penalties for fundamentally broken deals
  if (r.monthlyCashFlow < 0) score = Math.min(score, 38);
  if (isFinite(r.dscr) && r.dscr < 1) score = Math.min(score, 35);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const stars = Math.max(
    0.5,
    Math.min(5, Math.round((score / 20) * 2) / 2),
  );

  // ---- recommendation ----
  let recommendation: Recommendation;
  let recommendationReason: string;
  if (r.monthlyCashFlow < 0 || (isFinite(r.dscr) && r.dscr < 1)) {
    recommendation = "Pass";
    recommendationReason =
      "The property doesn't cover its own debt and expenses — it bleeds cash every month.";
  } else if (score >= 70 && r.monthlyCashFlow >= 100 && r.dscr >= 1.15) {
    recommendation = "Buy";
    recommendationReason =
      "Strong cash flow, solid debt coverage, and efficient use of capital make this a compelling BRRRR.";
  } else if (score >= 50) {
    recommendation = "Buy with Caution";
    recommendationReason =
      "The fundamentals work, but one or more metrics are thin — verify your assumptions before committing.";
  } else {
    recommendation = "Pass";
    recommendationReason =
      "Returns are too weak to justify the risk and capital tied up in this deal.";
  }

  // ---- risk ----
  let risk: Level;
  const lots = r.cashInvested > 0 && r.cashLeftInDeal > 0.5 * r.cashInvested;
  if (r.monthlyCashFlow < 100 || r.dscr < 1.1 || lots) {
    risk = "High";
  } else if (
    r.dscr >= 1.35 &&
    r.monthlyCashFlow >= 250 &&
    (r.cashInvested <= 0 || r.cashLeftInDeal <= 0.2 * r.cashInvested)
  ) {
    risk = "Low";
  } else {
    risk = "Medium";
  }

  // ---- confidence: how far the score sits from a decision boundary ----
  const minDist = Math.min(Math.abs(score - 50), Math.abs(score - 70));
  const confidence: Level =
    minDist >= 12 ? "High" : minDist >= 6 ? "Medium" : "Low";

  // ---- strengths / weaknesses ----
  const usd0 = (n: number) =>
    isFinite(n)
      ? n.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })
      : "—";

  type Cand = Finding & { priority: number; on: boolean };

  const strengthCands: Cand[] = [
    {
      on: isFinite(r.brrrrPct) && r.brrrrPct >= 100,
      priority: 10,
      title: "Full capital recovery",
      detail:
        r.cashOutSurplus > 0
          ? `You pull out all your invested cash plus a ${usd0(r.cashOutSurplus)} surplus — a textbook BRRRR with nothing left in the deal.`
          : `The refinance returns essentially all of your invested cash — a textbook BRRRR with little to nothing left in the deal.`,
    },
    {
      on: r.monthlyCashFlow >= 300,
      priority: 9,
      title: "Strong monthly cash flow",
      detail: `Generates ${usd0(r.monthlyCashFlow)}/mo after all expenses and the new mortgage.`,
    },
    {
      on: r.monthlyCashFlow >= 100 && r.monthlyCashFlow < 300,
      priority: 6,
      title: "Positive cash flow",
      detail: `Produces ${usd0(r.monthlyCashFlow)}/mo of surplus income.`,
    },
    {
      on: isFinite(r.dscr) && r.dscr >= 1.25,
      priority: 8,
      title: "Healthy debt coverage",
      detail: `DSCR of ${r.dscr.toFixed(2)} clears the 1.20 bar most lenders require.`,
    },
    {
      on: isFinite(r.cashOnCash) ? r.cashOnCash >= 12 : true,
      priority: 8,
      title: "Excellent cash-on-cash return",
      detail: isFinite(r.cashOnCash)
        ? `Earns ${r.cashOnCash.toFixed(1)}% annually on the cash left in the deal.`
        : "You recover all of your invested cash, making returns effectively infinite.",
    },
    {
      on: r.capRate >= 7,
      priority: 7,
      title: "Strong cap rate",
      detail: `${r.capRate.toFixed(1)}% cap rate signals healthy income relative to value.`,
    },
    {
      on: r.equityCreated >= 0.18 * i.arv && r.equityCreated > 0,
      priority: 7,
      title: "Significant forced equity",
      detail: `Creates ${usd0(r.equityCreated)} of equity — ${Math.round((r.equityCreated / i.arv) * 100)}% of the after-repair value.`,
    },
    {
      on: i.purchasePrice > 0 && i.purchasePrice <= r.maxOffer70,
      priority: 5,
      title: "Bought below the 70% rule",
      detail: `Purchase price sits at or under the ${usd0(r.maxOffer70)} ceiling (70% of ARV minus rehab).`,
    },
    {
      on: i.monthlyRent >= r.breakEvenRent * 1.15 && isFinite(r.breakEvenRent),
      priority: 4,
      title: "Comfortable rent cushion",
      detail: `Rent is well above the ${usd0(r.breakEvenRent)} break-even, leaving room if the market softens.`,
    },
  ];

  const weaknessCands: Cand[] = [
    {
      on: r.monthlyCashFlow < 0,
      priority: 10,
      title: "Negative cash flow",
      detail: `Loses ${usd0(Math.abs(r.monthlyCashFlow))}/mo — the property can't sustain itself.`,
    },
    {
      on: r.monthlyCashFlow >= 0 && r.monthlyCashFlow < 100,
      priority: 8,
      title: "Thin cash flow",
      detail: `Only ${usd0(r.monthlyCashFlow)}/mo of margin — one repair or vacancy wipes it out.`,
    },
    {
      on: isFinite(r.dscr) && r.dscr < 1,
      priority: 10,
      title: "Income below debt service",
      detail: `DSCR of ${r.dscr.toFixed(2)} is under 1.0 — lenders will likely decline the refinance.`,
    },
    {
      on: isFinite(r.dscr) && r.dscr >= 1 && r.dscr < 1.2,
      priority: 7,
      title: "Tight debt coverage",
      detail: `DSCR of ${r.dscr.toFixed(2)} is below the 1.20 most lenders want.`,
    },
    {
      on: r.capRate < 5,
      priority: 6,
      title: "Low cap rate",
      detail: `${r.capRate.toFixed(1)}% cap rate means weak income relative to the property's value.`,
    },
    {
      on:
        r.cashInvested > 0 &&
        r.cashLeftInDeal > 0.3 * r.cashInvested &&
        r.cashLeftInDeal > 0,
      priority: 7,
      title: "Significant cash trapped",
      detail: `${usd0(r.cashLeftInDeal)} stays locked in the deal after refinancing — capital you can't redeploy.`,
    },
    {
      on: isFinite(r.brrrrPct) && r.brrrrPct < 70,
      priority: 6,
      title: "Weak capital recovery",
      detail: `Refinance returns only ${Math.round(r.brrrrPct)}% of your cash — far from a full BRRRR.`,
    },
    {
      on: i.purchasePrice > r.maxOffer70 && r.maxOffer70 > 0,
      priority: 5,
      title: "Above the 70% rule",
      detail: `Purchase price exceeds the ${usd0(r.maxOffer70)} ceiling — you may be overpaying.`,
    },
    {
      on:
        isFinite(r.cashOnCash) &&
        r.cashOnCash >= 0 &&
        r.cashOnCash < 6,
      priority: 5,
      title: "Low cash-on-cash return",
      detail: `Just ${r.cashOnCash.toFixed(1)}% on the cash left in the deal — below most investors' targets.`,
    },
    {
      on:
        isFinite(r.breakEvenRent) &&
        i.monthlyRent < r.breakEvenRent * 1.05 &&
        i.monthlyRent >= r.breakEvenRent,
      priority: 4,
      title: "Slim rent cushion",
      detail: `Rent is barely above the ${usd0(r.breakEvenRent)} break-even point.`,
    },
    {
      on: i.refinanceLTV > 78,
      priority: 4,
      title: "Aggressive refinance leverage",
      detail: `Pulling ${i.refinanceLTV}% LTV is high — it boosts cash-out but raises payment and risk.`,
    },
  ];

  const pick = (cands: Cand[]) =>
    cands
      .filter((c) => c.on)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map(({ title, detail }) => ({ title, detail }));

  return {
    score,
    stars,
    recommendation,
    recommendationReason,
    risk,
    confidence,
    strengths: pick(strengthCands),
    weaknesses: pick(weaknessCands),
  };
}

/* ----------------------------- sensitivity -------------------------------- */

export type Verdict = "Still Works" | "Tight" | "Fails";

/** Grade a single (possibly stressed) scenario. */
export function verdictFor(r: Results): Verdict {
  if (r.monthlyCashFlow < 0 || (isFinite(r.dscr) && r.dscr < 1)) return "Fails";
  if (r.monthlyCashFlow < 150 || (isFinite(r.dscr) && r.dscr < 1.2))
    return "Tight";
  return "Still Works";
}

export type StressRow = {
  label: string;
  monthlyCashFlow: number;
  dscr: number;
  cashLeftInDeal: number;
  cashOutSurplus: number;
  verdict: Verdict;
};

export type StressGroup = {
  title: string;
  rows: StressRow[];
};

export type Sensitivity = {
  groups: StressGroup[];
  worstCase: StressRow;
  passCount: number;
  tightCount: number;
  failCount: number;
  total: number;
  resilient: boolean;
  headline: string;
  summary: string;
};

function stressRow(label: string, inp: Inputs): StressRow {
  const r = analyze(inp);
  return {
    label,
    monthlyCashFlow: r.monthlyCashFlow,
    dscr: r.dscr,
    cashLeftInDeal: r.cashLeftInDeal,
    cashOutSurplus: r.cashOutSurplus,
    verdict: verdictFor(r),
  };
}

export function sensitivity(base: Inputs): Sensitivity {
  const rentDrop = (p: number) =>
    stressRow(`Rent −${p}%`, {
      ...base,
      monthlyRent: base.monthlyRent * (1 - p / 100),
    });
  const rateUp = (p: number) =>
    stressRow(`Rate +${p}%`, {
      ...base,
      newInterestRate: base.newInterestRate + p,
    });
  const rehabUp = (p: number) =>
    stressRow(`Rehab +${p}%`, {
      ...base,
      rehabCosts: base.rehabCosts * (1 + p / 100),
    });
  const arvDrop = (p: number) =>
    stressRow(`ARV −${p}%`, { ...base, arv: base.arv * (1 - p / 100) });

  const groups: StressGroup[] = [
    { title: "Rent drops", rows: [rentDrop(5), rentDrop(10), rentDrop(15)] },
    {
      title: "Interest rate rises",
      rows: [rateUp(0.5), rateUp(1), rateUp(2)],
    },
    {
      title: "Rehab overruns",
      rows: [rehabUp(10), rehabUp(20), rehabUp(30)],
    },
    { title: "ARV drops", rows: [arvDrop(5), arvDrop(10), arvDrop(15)] },
  ];

  const worstCase = stressRow("Combined worst case", {
    ...base,
    monthlyRent: base.monthlyRent * 0.9,
    newInterestRate: base.newInterestRate + 1,
    rehabCosts: base.rehabCosts * 1.2,
    arv: base.arv * 0.9,
  });

  const allRows = groups.flatMap((g) => g.rows);
  const total = allRows.length;
  const passCount = allRows.filter((r) => r.verdict === "Still Works").length;
  const tightCount = allRows.filter((r) => r.verdict === "Tight").length;
  const failCount = allRows.filter((r) => r.verdict === "Fails").length;

  const resilient =
    worstCase.verdict !== "Fails" &&
    failCount <= 2 &&
    passCount >= Math.ceil(total * 0.5);

  const headline = resilient
    ? "This deal is resilient"
    : "This deal is fragile";

  const survives =
    worstCase.verdict === "Fails"
      ? "and it goes negative under the combined worst case"
      : worstCase.verdict === "Tight"
        ? "and it still scrapes by under the combined worst case"
        : "and it holds up even under the combined worst case";

  const summary = resilient
    ? `${passCount} of ${total} stress tests still cash flow comfortably ${survives}. The numbers can absorb a fair amount of bad news.`
    : `Only ${passCount} of ${total} stress tests pass cleanly${failCount > 0 ? ` and ${failCount} fail outright` : ""} ${survives}. Small swings in the assumptions could push this into the red.`;

  return {
    groups,
    worstCase,
    passCount,
    tightCount,
    failCount,
    total,
    resilient,
    headline,
    summary,
  };
}

/* ------------------------- assumption warnings ---------------------------- */

export type Warning = { title: string; detail: string };

export const CONSERVATIVE_TIP =
  "These assumptions may be optimistic. Consider using management 8%, maintenance 5%, and CapEx 5% for a more conservative analysis.";

/** Flag optimistic inputs. These never fail the deal — they just caution. */
export function assumptionWarnings(i: Inputs, r: Results): Warning[] {
  const w: Warning[] = [];

  if (i.management === 0) {
    w.push({
      title: "No property management cost",
      detail:
        "Even self-managing has a real cost in time; most analyses budget around 8% of rent.",
    });
  }
  if (i.maintenance < 5) {
    w.push({
      title: "Low maintenance reserve",
      detail: `Maintenance is set to ${i.maintenance}% of rent — older properties often need 5% or more.`,
    });
  }
  if (i.capexReserve === 0) {
    w.push({
      title: "No CapEx reserve",
      detail:
        "Big-ticket items (roof, HVAC, water heater) will eventually hit cash flow; budgeting ~5% smooths the shock.",
    });
  }
  if (i.purchasePrice > 0 && i.monthlyRent > 0) {
    const ratio = (i.monthlyRent / i.purchasePrice) * 100;
    if (ratio > 2) {
      w.push({
        title: "Rent looks high for the price",
        detail: `Monthly rent is ${ratio.toFixed(1)}% of the purchase price — well above the 1% rule benchmark, so double-check it's achievable.`,
      });
    }
  }

  // Does the cash flow only look good because reserves/management are light?
  const conservative = analyze({
    ...i,
    management: Math.max(i.management, 8),
    maintenance: Math.max(i.maintenance, 5),
    capexReserve: Math.max(i.capexReserve, 5),
  });
  const usingLight = i.management < 8 || i.maintenance < 5 || i.capexReserve < 5;
  const drop = r.monthlyCashFlow - conservative.monthlyCashFlow;
  if (usingLight && r.monthlyCashFlow > 0 && drop >= 50) {
    w.push({
      title: "Cash flow leans on light assumptions",
      detail: `With management 8%, maintenance 5%, and CapEx 5%, monthly cash flow drops to ${fmtUSD(conservative.monthlyCashFlow)} (from ${fmtUSD(r.monthlyCashFlow)}).`,
    });
  }

  return w;
}

/* ----------------------- comparable sales / ARV --------------------------- */

export type RenoQuality = "Basic" | "Similar" | "Superior";

export type Comp = {
  id: string;
  address: string;
  salePrice: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distance: number | null; // miles from subject
  daysSinceSale: number | null;
  reno: RenoQuality;
  included: boolean; // excluded comps stay visible but don't affect calcs
  notes: string;
};

export type Subject = {
  sqft: number | null;
  beds: number | null;
  baths: number | null;
};

/** Descriptive metadata for the property being analyzed (no calculations). */
export type Property = {
  name: string;
  address: string;
  cityState: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

export type CompResult = {
  valid: boolean; // included AND has price + sqft → used in calc
  hasData: boolean; // has price + sqft (regardless of inclusion)
  pricePerSqft: number; // raw sale price / sqft
  similarity: number; // 0–100
  weight: number; // 0–1 (valid comps sum to 1)
  impliedARV: number; // reno-adjusted ppsf × subject sqft
};

export type CompAnalysis = {
  rows: CompResult[]; // aligned with the input comps
  validCount: number; // comps actually used in the estimate
  includedCount: number; // comps toggled "included"
  excludedCount: number; // comps toggled "excluded"
  weightedPpsf: number; // reno-adjusted, weighted
  conservativeARV: number;
  averageARV: number;
  aggressiveARV: number;
  recommendedARV: number;
  recommendedBasis: "Average" | "Conservative" | "None";
  recommendedReason: string;
  confidence: Level;
};

/** Subject is typically renovated to rental standard, so a Basic comp slightly
 *  understates value and a Superior comp slightly overstates it. */
function renoFactor(q: RenoQuality): number {
  return q === "Basic" ? 1.05 : q === "Superior" ? 0.95 : 1.0;
}

export const MAX_COMPS = 8;

export function analyzeComps(subject: Subject, comps: Comp[]): CompAnalysis {
  const sSqft = subject.sqft ?? 0;

  const rows: CompResult[] = comps.map((c) => {
    const hasData = (c.salePrice ?? 0) > 0 && (c.sqft ?? 0) > 0;
    const valid = hasData && c.included;
    const pricePerSqft = hasData
      ? (c.salePrice as number) / (c.sqft as number)
      : 0;
    return {
      valid,
      hasData,
      pricePerSqft,
      similarity: 0,
      weight: 0,
      impliedARV: 0,
    };
  });

  const valids = comps
    .map((c, idx) => ({ c, idx }))
    .filter(({ idx }) => rows[idx].valid);

  // Similarity: start at 100 and subtract penalties for every difference.
  for (const { c, idx } of valids) {
    let penalty = 0;
    if (sSqft > 0 && c.sqft != null) {
      penalty += Math.min(30, (Math.abs(c.sqft - sSqft) / sSqft) * 60);
    }
    if (subject.beds != null && c.beds != null) {
      penalty += Math.min(15, Math.abs(c.beds - subject.beds) * 8);
    }
    if (subject.baths != null && c.baths != null) {
      penalty += Math.min(15, Math.abs(c.baths - subject.baths) * 8);
    }
    if (c.distance != null) penalty += Math.min(20, c.distance * 8);
    if (c.daysSinceSale != null) {
      penalty += Math.min(15, (c.daysSinceSale / 30) * 2);
    }
    penalty += c.reno === "Similar" ? 0 : 6;
    rows[idx].similarity = Math.max(5, Math.round(100 - penalty));
  }

  const simSum = valids.reduce((a, { idx }) => a + rows[idx].similarity, 0);

  const impliedList: number[] = [];
  let weightedPpsf = 0;
  for (const { c, idx } of valids) {
    rows[idx].weight =
      simSum > 0 ? rows[idx].similarity / simSum : 1 / valids.length;
    const adjPpsf = rows[idx].pricePerSqft * renoFactor(c.reno);
    rows[idx].impliedARV = adjPpsf * sSqft;
    weightedPpsf += rows[idx].weight * adjPpsf;
    impliedList.push(rows[idx].impliedARV);
  }

  const averageARV = weightedPpsf * sSqft;
  const conservativeARV = impliedList.length ? Math.min(...impliedList) : 0;
  const aggressiveARV = impliedList.length ? Math.max(...impliedList) : 0;

  // Confidence: more comps, tighter spread, and higher similarity = higher.
  const n = valids.length;
  const mean = impliedList.length
    ? impliedList.reduce((a, b) => a + b, 0) / impliedList.length
    : 0;
  const variance = impliedList.length
    ? impliedList.reduce((a, b) => a + (b - mean) ** 2, 0) / impliedList.length
    : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const avgSim = n > 0 ? simSum / n : 0;

  let confidence: Level;
  if (n === 0 || sSqft <= 0) confidence = "Low";
  else if (n >= 4 && cv <= 0.1 && avgSim >= 65) confidence = "High";
  else if (n < 3 || cv > 0.2 || avgSim < 45) confidence = "Low";
  else confidence = "Medium";

  const includedCount = comps.filter((c) => c.included).length;
  const excludedCount = comps.length - includedCount;

  // Recommend an ARV and explain why.
  let recommendedARV = 0;
  let recommendedBasis: "Average" | "Conservative" | "None" = "None";
  let recommendedReason = "Add the subject square footage and at least one included comp to get a recommendation.";
  if (n > 0 && sSqft > 0) {
    if (confidence === "Low") {
      recommendedARV = conservativeARV;
      recommendedBasis = "Conservative";
      recommendedReason = `Confidence is low (${n} comp${n === 1 ? "" : "s"}, with a wide spread or weak similarity), so the conservative estimate is recommended to avoid overvaluing.`;
    } else {
      recommendedARV = averageARV;
      recommendedBasis = "Average";
      recommendedReason = `${confidence} confidence across ${n} consistent comp${n === 1 ? "" : "s"}, so the similarity-weighted average is the most reliable estimate.`;
    }
  }

  return {
    rows,
    validCount: n,
    includedCount,
    excludedCount,
    weightedPpsf,
    conservativeARV,
    averageARV,
    aggressiveARV,
    recommendedARV,
    recommendedBasis,
    recommendedReason,
    confidence,
  };
}

export type ArvComparison = {
  pctDiff: number; // signed (manual − comp) / comp × 100
  dollarDiff: number; // signed manual − comp
  tone: "good" | "warn";
  message: string;
};

/** Compare a manually entered ARV against the comp-derived ARV. */
export function compareArv(
  manualArv: number,
  compArv: number,
): ArvComparison | null {
  if (manualArv <= 0 || compArv <= 0) return null;
  const dollarDiff = manualArv - compArv;
  const pctDiff = (dollarDiff / compArv) * 100;
  const abs = Math.abs(pctDiff);
  if (abs <= 5) {
    return {
      pctDiff,
      dollarDiff,
      tone: "good",
      message: "Manual ARV appears well supported.",
    };
  }
  if (abs <= 10) {
    return {
      pctDiff,
      dollarDiff,
      tone: "warn",
      message: "Manual ARV is slightly different than comparable sales.",
    };
  }
  return {
    pctDiff,
    dollarDiff,
    tone: "warn",
    message:
      dollarDiff > 0
        ? "Manual ARV may be optimistic."
        : "Manual ARV may be conservative.",
  };
}

/** Which ARV value feeds every downstream refinance calculation. */
export type ArvSource =
  | "manual"
  | "comp"
  | "conservative"
  | "average"
  | "aggressive";

/** Resolve the ARV that the selected source implies. Combined sources fall
 *  back gracefully when one input is missing. */
export function arvForSource(
  source: ArvSource,
  manualArv: number,
  compArv: number,
): number {
  const haveComp = compArv > 0;
  const haveManual = manualArv > 0;
  switch (source) {
    case "manual":
      return manualArv;
    case "comp":
      return haveComp ? compArv : manualArv;
    case "conservative":
      return haveComp && haveManual
        ? Math.min(manualArv, compArv)
        : haveComp
          ? compArv
          : manualArv;
    case "average":
      return haveComp && haveManual
        ? (manualArv + compArv) / 2
        : haveComp
          ? compArv
          : manualArv;
    case "aggressive":
      return haveComp && haveManual
        ? Math.max(manualArv, compArv)
        : haveComp
          ? compArv
          : manualArv;
  }
}

/* --------------------------------- format --------------------------------- */

export const fmtUSD = (n: number, digits = 0) =>
  isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "—";

export const fmtPct = (n: number, digits = 1) =>
  isFinite(n) ? `${n.toFixed(digits)}%` : "∞";

export const fmtNum = (n: number, digits = 2) =>
  isFinite(n) ? n.toFixed(digits) : "∞";
