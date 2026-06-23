/* ======================================================================= *
 *  BRRRR AI — Local.  Single-file, dependency-free real-estate analyzer.   *
 *                                                                          *
 *  Runs from file:// with no server, no network, no build at runtime.      *
 *  Data lives in localStorage. The BRRRR math is ported verbatim from the  *
 *  original lib/brrrr.ts so grades and numbers match the prior app.        *
 * ======================================================================= */
(function () {
  "use strict";

  /* ===================================================================== *
   *  1. BRRRR ENGINE  (ported from lib/brrrr.ts — single source of truth)  *
   * ===================================================================== */

  function amortizedPayment(principal, annualRatePct, years) {
    const n = years * 12;
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r <= 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function analyze(i) {
    const financed = i.purchaseType === "financed";
    const purchaseLoanAmount = financed ? Math.max(i.purchasePrice - i.downPayment, 0) : 0;
    const purchaseMonthlyPayment = amortizedPayment(purchaseLoanAmount, i.purchaseInterestRate, i.purchaseLoanTerm);
    const totalProjectCost = i.purchasePrice + i.rehabCosts + i.closingCosts + i.holdingCosts;
    const cashInvested = (financed ? i.downPayment : i.purchasePrice) + i.rehabCosts + i.closingCosts + i.holdingCosts;

    const refinanceAmount = i.arv * (i.refinanceLTV / 100);
    const originalLoanPayoff = purchaseLoanAmount;
    const netCashAvailable = refinanceAmount - originalLoanPayoff;
    const capitalRecovered = Math.min(Math.max(netCashAvailable, 0), cashInvested);
    const cashLeftInDeal = Math.max(cashInvested - netCashAvailable, 0);
    const cashOutSurplus = Math.max(netCashAvailable - cashInvested, 0);
    const newMonthlyPayment = amortizedPayment(refinanceAmount, i.newInterestRate, i.newLoanTerm);

    const variablePct = (i.management + i.vacancy + i.maintenance + i.capexReserve) / 100;
    const fixedMonthly = i.taxes / 12 + i.insurance / 12 + i.hoa + i.utilities;
    const variableMonthly = variablePct * i.monthlyRent;
    const operatingExpenses = fixedMonthly + variableMonthly;

    const monthlyNOI = i.monthlyRent - operatingExpenses;
    const annualNOI = monthlyNOI * 12;
    const monthlyCashFlow = monthlyNOI - newMonthlyPayment;
    const annualCashFlow = monthlyCashFlow * 12;

    const dscr = newMonthlyPayment > 0 ? monthlyNOI / newMonthlyPayment : Infinity;
    const capRate = i.arv > 0 ? (annualNOI / i.arv) * 100 : 0;
    const cashOnCash = cashLeftInDeal > 0 ? (annualCashFlow / cashLeftInDeal) * 100 : Infinity;

    const equityCreated = i.arv - totalProjectCost;
    const equityAfterRefi = i.arv - refinanceAmount;
    const brrrrPct = cashInvested > 0 ? (Math.max(netCashAvailable, 0) / cashInvested) * 100 : Infinity;
    const totalROI = cashInvested > 0 ? ((annualCashFlow + equityCreated) / cashInvested) * 100 : Infinity;

    const denom = 1 - variablePct;
    const rentForCashFlow = (target) => (denom > 0 ? (fixedMonthly + newMonthlyPayment + target) / denom : Infinity);
    const rentForDSCR120 = denom > 0 ? (fixedMonthly + 1.2 * newMonthlyPayment) / denom : Infinity;

    return {
      financed, purchaseLoanAmount, purchaseMonthlyPayment, totalProjectCost, cashInvested,
      refinanceAmount, originalLoanPayoff, netCashAvailable, capitalRecovered, cashLeftInDeal,
      cashOutSurplus, newMonthlyPayment, operatingExpenses, monthlyNOI, annualNOI,
      monthlyCashFlow, annualCashFlow, dscr, capRate, cashOnCash, equityCreated, equityAfterRefi,
      brrrrPct, totalROI,
      breakEvenRent: rentForCashFlow(0), rentFor0: rentForCashFlow(0),
      rentFor200: rentForCashFlow(200), rentFor500: rentForCashFlow(500),
      rentForDSCR120, maxOffer70: i.arv * 0.7 - i.rehabCosts,
    };
  }

  function band(value, steps) {
    for (const [t, s] of steps) if (value >= t) return s;
    return 0;
  }

  function summarize(i, r) {
    const cfScore = band(r.monthlyCashFlow, [[500, 1], [300, 0.85], [200, 0.7], [100, 0.5], [0, 0.3]]);
    const dscrScore = !isFinite(r.dscr) ? 1 : band(r.dscr, [[1.5, 1], [1.35, 0.85], [1.25, 0.7], [1.15, 0.55], [1.05, 0.4], [1.0, 0.3]]);
    const cocScore = !isFinite(r.cashOnCash) ? 1 : band(r.cashOnCash, [[15, 1], [12, 0.85], [10, 0.7], [8, 0.55], [5, 0.4], [0.0001, 0.25]]);
    const brrrrScore = !isFinite(r.brrrrPct) ? 1 : band(r.brrrrPct, [[100, 1], [85, 0.8], [70, 0.6], [50, 0.4], [30, 0.2]]) || 0.1;
    const capScore = band(r.capRate, [[8, 1], [7, 0.85], [6, 0.7], [5, 0.5], [4, 0.3]]) || 0.15;

    let score = (cfScore * 0.3 + dscrScore * 0.2 + cocScore * 0.2 + brrrrScore * 0.15 + capScore * 0.15) * 100;
    if (r.monthlyCashFlow < 0) score = Math.min(score, 38);
    if (isFinite(r.dscr) && r.dscr < 1) score = Math.min(score, 35);
    score = Math.max(0, Math.min(100, Math.round(score)));

    const stars = Math.max(0.5, Math.min(5, Math.round((score / 20) * 2) / 2));

    let recommendation, recommendationReason;
    if (r.monthlyCashFlow < 0 || (isFinite(r.dscr) && r.dscr < 1)) {
      recommendation = "Pass";
      recommendationReason = "The property doesn't cover its own debt and expenses — it bleeds cash every month.";
    } else if (score >= 70 && r.monthlyCashFlow >= 100 && r.dscr >= 1.15) {
      recommendation = "Buy";
      recommendationReason = "Strong cash flow, solid debt coverage, and efficient use of capital make this a compelling BRRRR.";
    } else if (score >= 50) {
      recommendation = "Buy with Caution";
      recommendationReason = "The fundamentals work, but one or more metrics are thin — verify your assumptions before committing.";
    } else {
      recommendation = "Pass";
      recommendationReason = "Returns are too weak to justify the risk and capital tied up in this deal.";
    }

    let risk;
    const lots = r.cashInvested > 0 && r.cashLeftInDeal > 0.5 * r.cashInvested;
    if (r.monthlyCashFlow < 100 || r.dscr < 1.1 || lots) risk = "High";
    else if (r.dscr >= 1.35 && r.monthlyCashFlow >= 250 && (r.cashInvested <= 0 || r.cashLeftInDeal <= 0.2 * r.cashInvested)) risk = "Low";
    else risk = "Medium";

    const minDist = Math.min(Math.abs(score - 50), Math.abs(score - 70));
    const confidence = minDist >= 12 ? "High" : minDist >= 6 ? "Medium" : "Low";

    const usd0 = (n) => (isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—");

    const strengthCands = [
      { on: isFinite(r.brrrrPct) && r.brrrrPct >= 100, priority: 10, title: "Full capital recovery", detail: r.cashOutSurplus > 0 ? `You pull out all your invested cash plus a ${usd0(r.cashOutSurplus)} surplus — a textbook BRRRR with nothing left in the deal.` : "The refinance returns essentially all of your invested cash — a textbook BRRRR with little to nothing left in the deal." },
      { on: r.monthlyCashFlow >= 300, priority: 9, title: "Strong monthly cash flow", detail: `Generates ${usd0(r.monthlyCashFlow)}/mo after all expenses and the new mortgage.` },
      { on: r.monthlyCashFlow >= 100 && r.monthlyCashFlow < 300, priority: 6, title: "Positive cash flow", detail: `Produces ${usd0(r.monthlyCashFlow)}/mo of surplus income.` },
      { on: isFinite(r.dscr) && r.dscr >= 1.25, priority: 8, title: "Healthy debt coverage", detail: `DSCR of ${r.dscr.toFixed(2)} clears the 1.20 bar most lenders require.` },
      { on: isFinite(r.cashOnCash) ? r.cashOnCash >= 12 : true, priority: 8, title: "Excellent cash-on-cash return", detail: isFinite(r.cashOnCash) ? `Earns ${r.cashOnCash.toFixed(1)}% annually on the cash left in the deal.` : "You recover all of your invested cash, making returns effectively infinite." },
      { on: r.capRate >= 7, priority: 7, title: "Strong cap rate", detail: `${r.capRate.toFixed(1)}% cap rate signals healthy income relative to value.` },
      { on: r.equityCreated >= 0.18 * i.arv && r.equityCreated > 0, priority: 7, title: "Significant forced equity", detail: `Creates ${usd0(r.equityCreated)} of equity — ${Math.round((r.equityCreated / i.arv) * 100)}% of the after-repair value.` },
      { on: i.purchasePrice > 0 && i.purchasePrice <= r.maxOffer70, priority: 5, title: "Bought below the 70% rule", detail: `Purchase price sits at or under the ${usd0(r.maxOffer70)} ceiling (70% of ARV minus rehab).` },
      { on: i.monthlyRent >= r.breakEvenRent * 1.15 && isFinite(r.breakEvenRent), priority: 4, title: "Comfortable rent cushion", detail: `Rent is well above the ${usd0(r.breakEvenRent)} break-even, leaving room if the market softens.` },
    ];
    const weaknessCands = [
      { on: r.monthlyCashFlow < 0, priority: 10, title: "Negative cash flow", detail: `Loses ${usd0(Math.abs(r.monthlyCashFlow))}/mo — the property can't sustain itself.` },
      { on: r.monthlyCashFlow >= 0 && r.monthlyCashFlow < 100, priority: 8, title: "Thin cash flow", detail: `Only ${usd0(r.monthlyCashFlow)}/mo of margin — one repair or vacancy wipes it out.` },
      { on: isFinite(r.dscr) && r.dscr < 1, priority: 10, title: "Income below debt service", detail: `DSCR of ${r.dscr.toFixed(2)} is under 1.0 — lenders will likely decline the refinance.` },
      { on: isFinite(r.dscr) && r.dscr >= 1 && r.dscr < 1.2, priority: 7, title: "Tight debt coverage", detail: `DSCR of ${r.dscr.toFixed(2)} is below the 1.20 most lenders want.` },
      { on: r.capRate < 5, priority: 6, title: "Low cap rate", detail: `${r.capRate.toFixed(1)}% cap rate means weak income relative to the property's value.` },
      { on: r.cashInvested > 0 && r.cashLeftInDeal > 0.3 * r.cashInvested && r.cashLeftInDeal > 0, priority: 7, title: "Significant cash trapped", detail: `${usd0(r.cashLeftInDeal)} stays locked in the deal after refinancing — capital you can't redeploy.` },
      { on: isFinite(r.brrrrPct) && r.brrrrPct < 70, priority: 6, title: "Weak capital recovery", detail: `Refinance returns only ${Math.round(r.brrrrPct)}% of your cash — far from a full BRRRR.` },
      { on: i.purchasePrice > r.maxOffer70 && r.maxOffer70 > 0, priority: 5, title: "Above the 70% rule", detail: `Purchase price exceeds the ${usd0(r.maxOffer70)} ceiling — you may be overpaying.` },
      { on: isFinite(r.cashOnCash) && r.cashOnCash >= 0 && r.cashOnCash < 6, priority: 5, title: "Low cash-on-cash return", detail: `Just ${r.cashOnCash.toFixed(1)}% on the cash left in the deal — below most investors' targets.` },
      { on: isFinite(r.breakEvenRent) && i.monthlyRent < r.breakEvenRent * 1.05 && i.monthlyRent >= r.breakEvenRent, priority: 4, title: "Slim rent cushion", detail: `Rent is barely above the ${usd0(r.breakEvenRent)} break-even point.` },
      { on: i.refinanceLTV > 78, priority: 4, title: "Aggressive refinance leverage", detail: `Pulling ${i.refinanceLTV}% LTV is high — it boosts cash-out but raises payment and risk.` },
    ];
    const pick = (cands) => cands.filter((c) => c.on).sort((a, b) => b.priority - a.priority).slice(0, 5).map(({ title, detail }) => ({ title, detail }));

    return { score, stars, recommendation, recommendationReason, risk, confidence, strengths: pick(strengthCands), weaknesses: pick(weaknessCands) };
  }

  function verdictFor(r) {
    if (r.monthlyCashFlow < 0 || (isFinite(r.dscr) && r.dscr < 1)) return "Fails";
    if (r.monthlyCashFlow < 150 || (isFinite(r.dscr) && r.dscr < 1.2)) return "Tight";
    return "Still Works";
  }

  function stressRow(label, inp) {
    const r = analyze(inp);
    return { label, monthlyCashFlow: r.monthlyCashFlow, dscr: r.dscr, cashLeftInDeal: r.cashLeftInDeal, cashOutSurplus: r.cashOutSurplus, verdict: verdictFor(r) };
  }

  function sensitivity(base) {
    const rentDrop = (p) => stressRow(`Rent −${p}%`, Object.assign({}, base, { monthlyRent: base.monthlyRent * (1 - p / 100) }));
    const rateUp = (p) => stressRow(`Rate +${p}%`, Object.assign({}, base, { newInterestRate: base.newInterestRate + p }));
    const rehabUp = (p) => stressRow(`Rehab +${p}%`, Object.assign({}, base, { rehabCosts: base.rehabCosts * (1 + p / 100) }));
    const arvDrop = (p) => stressRow(`ARV −${p}%`, Object.assign({}, base, { arv: base.arv * (1 - p / 100) }));

    const groups = [
      { title: "Rent drops", rows: [rentDrop(5), rentDrop(10), rentDrop(15)] },
      { title: "Interest rate rises", rows: [rateUp(0.5), rateUp(1), rateUp(2)] },
      { title: "Rehab overruns", rows: [rehabUp(10), rehabUp(20), rehabUp(30)] },
      { title: "ARV drops", rows: [arvDrop(5), arvDrop(10), arvDrop(15)] },
    ];
    const worstCase = stressRow("Combined worst case", Object.assign({}, base, {
      monthlyRent: base.monthlyRent * 0.9, newInterestRate: base.newInterestRate + 1, rehabCosts: base.rehabCosts * 1.2, arv: base.arv * 0.9,
    }));

    const allRows = groups.flatMap((g) => g.rows);
    const total = allRows.length;
    const passCount = allRows.filter((r) => r.verdict === "Still Works").length;
    const tightCount = allRows.filter((r) => r.verdict === "Tight").length;
    const failCount = allRows.filter((r) => r.verdict === "Fails").length;
    const resilient = worstCase.verdict !== "Fails" && failCount <= 2 && passCount >= Math.ceil(total * 0.5);
    const headline = resilient ? "This deal is resilient" : "This deal is fragile";
    const survives = worstCase.verdict === "Fails" ? "and it goes negative under the combined worst case" : worstCase.verdict === "Tight" ? "and it still scrapes by under the combined worst case" : "and it holds up even under the combined worst case";
    const summary = resilient
      ? `${passCount} of ${total} stress tests still cash flow comfortably ${survives}. The numbers can absorb a fair amount of bad news.`
      : `Only ${passCount} of ${total} stress tests pass cleanly${failCount > 0 ? ` and ${failCount} fail outright` : ""} ${survives}. Small swings in the assumptions could push this into the red.`;
    return { groups, worstCase, passCount, tightCount, failCount, total, resilient, headline, summary };
  }

  /* ----------------------------- comps / ARV ---------------------------- */
  function renoFactor(q) { return q === "Basic" ? 1.05 : q === "Superior" ? 0.95 : 1.0; }

  function analyzeComps(subject, comps) {
    const sSqft = subject.sqft || 0;
    const rows = comps.map((c) => {
      const hasData = (c.salePrice || 0) > 0 && (c.sqft || 0) > 0;
      const valid = hasData && c.included;
      const pricePerSqft = hasData ? c.salePrice / c.sqft : 0;
      return { valid, hasData, pricePerSqft, similarity: 0, weight: 0, impliedARV: 0 };
    });
    const valids = comps.map((c, idx) => ({ c, idx })).filter(({ idx }) => rows[idx].valid);

    for (const { c, idx } of valids) {
      let penalty = 0;
      if (sSqft > 0 && c.sqft != null) penalty += Math.min(30, (Math.abs(c.sqft - sSqft) / sSqft) * 60);
      if (subject.beds != null && c.beds != null) penalty += Math.min(15, Math.abs(c.beds - subject.beds) * 8);
      if (subject.baths != null && c.baths != null) penalty += Math.min(15, Math.abs(c.baths - subject.baths) * 8);
      if (c.distance != null) penalty += Math.min(20, c.distance * 8);
      if (c.daysSinceSale != null) penalty += Math.min(15, (c.daysSinceSale / 30) * 2);
      penalty += c.reno === "Similar" ? 0 : 6;
      rows[idx].similarity = Math.max(5, Math.round(100 - penalty));
    }
    const simSum = valids.reduce((a, { idx }) => a + rows[idx].similarity, 0);
    const impliedList = [];
    let weightedPpsf = 0;
    for (const { c, idx } of valids) {
      rows[idx].weight = simSum > 0 ? rows[idx].similarity / simSum : 1 / valids.length;
      const adjPpsf = rows[idx].pricePerSqft * renoFactor(c.reno);
      rows[idx].impliedARV = adjPpsf * sSqft;
      weightedPpsf += rows[idx].weight * adjPpsf;
      impliedList.push(rows[idx].impliedARV);
    }
    const averageARV = weightedPpsf * sSqft;
    const conservativeARV = impliedList.length ? Math.min.apply(null, impliedList) : 0;
    const aggressiveARV = impliedList.length ? Math.max.apply(null, impliedList) : 0;

    const n = valids.length;
    const mean = impliedList.length ? impliedList.reduce((a, b) => a + b, 0) / impliedList.length : 0;
    const variance = impliedList.length ? impliedList.reduce((a, b) => a + (b - mean) ** 2, 0) / impliedList.length : 0;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const avgSim = n > 0 ? simSum / n : 0;
    let confidence;
    if (n === 0 || sSqft <= 0) confidence = "Low";
    else if (n >= 4 && cv <= 0.1 && avgSim >= 65) confidence = "High";
    else if (n < 3 || cv > 0.2 || avgSim < 45) confidence = "Low";
    else confidence = "Medium";

    return { rows, validCount: n, weightedPpsf, conservativeARV, averageARV, aggressiveARV, confidence };
  }

  function arvForSource(source, manualArv, range) {
    switch (source) {
      case "manual": return manualArv;
      case "conservative": return range.conservative || manualArv;
      case "expected": return range.expected || manualArv;
      case "aggressive": return range.aggressive || manualArv;
      default: return manualArv;
    }
  }

  const INVESTMENT_GRADES = ["A+", "A", "A-", "B+", "B", "C", "Pass"];
  function investmentGrade(score, rec) {
    if (rec === "Pass") return "Pass";
    if (score >= 90) return "A+";
    if (score >= 83) return "A";
    if (score >= 76) return "A-";
    if (score >= 68) return "B+";
    if (score >= 60) return "B";
    if (score >= 50) return "C";
    return "Pass";
  }
  function gradeRank(g) { const i = INVESTMENT_GRADES.indexOf(g); return i === -1 ? INVESTMENT_GRADES.length : i; }

  /* ------------------------------- format ------------------------------- */
  const fmtUSD = (n, digits) => (isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits || 0, minimumFractionDigits: digits || 0 }) : "—");
  const fmtPct = (n, digits) => (isFinite(n) ? `${n.toFixed(digits == null ? 1 : digits)}%` : "∞");
  const fmtNum = (n, digits) => (isFinite(n) ? n.toFixed(digits == null ? 2 : digits) : "∞");
  const fmtInt = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));

  /* ===================================================================== *
   *  2. DATA MODEL + DEFAULTS                                              *
   * ===================================================================== */

  const STORE_KEY = "brrrr-local-v1";

  const DEFAULT_ASSUMPTIONS = {
    downPaymentPct: 20, purchaseRate: 9.5, purchaseTermYears: 30, closingPct: 3, holdingPct: 2,
    refinanceLTV: 75, refiRate: 7.25, refiTermYears: 30, taxRatePct: 1.5, insuranceAnnual: 1200,
    managementPct: 8, vacancyPct: 5, maintenancePct: 5, capexPct: 5, arvMultiplier: 1.3,
  };

  const PIPELINE_STAGES = [
    { value: "watching", label: "Watching" },
    { value: "analyzing", label: "Analyzing" },
    { value: "offer_submitted", label: "Offer Submitted" },
    { value: "under_contract", label: "Under Contract" },
    { value: "owned", label: "Owned" },
    { value: "archived", label: "Archived" },
  ];
  const QUEUE_STATUSES = ["new", "watch", "analyze", "ignore"];

  function defaultBrrrr(price, a) {
    a = a || DEFAULT_ASSUMPTIONS;
    const p = price || 0;
    return {
      purchasePrice: p || null,
      purchaseType: "financed",
      downPayment: p ? Math.round((a.downPaymentPct / 100) * p) : null,
      purchaseInterestRate: a.purchaseRate,
      purchaseLoanTerm: a.purchaseTermYears,
      closingCosts: p ? Math.round((a.closingPct / 100) * p) : null,
      holdingCosts: p ? Math.round((a.holdingPct / 100) * p) : null,
      rehabCosts: null,
      arv: p ? Math.round(p * a.arvMultiplier) : null,
      refinanceLTV: a.refinanceLTV,
      newInterestRate: a.refiRate,
      newLoanTerm: a.refiTermYears,
      monthlyRent: null,
      taxes: p ? Math.round((a.taxRatePct / 100) * p) : null,
      insurance: a.insuranceAnnual,
      management: a.managementPct,
      vacancy: a.vacancyPct,
      maintenance: a.maintenancePct,
      hoa: 0,
      capexReserve: a.capexPct,
      utilities: 0,
    };
  }

  function genId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyProperty() {
    const now = Date.now();
    return {
      id: genId(), createdAt: now, updatedAt: now,
      name: "", address: "", city: "", state: "", zip: "",
      beds: null, baths: null, sqft: null, lotSize: null, yearBuilt: null,
      lat: null, lng: null,
      listingLink: "", photosLink: "",
      notes: "", description: "", renovationNotes: "",
      listingStatus: "", soldPrice: null, soldDate: "",
      queueStatus: "new", inPipeline: false, pipelineStage: "watching",
      arvMode: "manual",
      brrrr: defaultBrrrr(0),
      comps: [],
    };
  }

  /* ------------------------------ resolve inputs ------------------------ */
  // Build the engine Inputs from a property, substituting the chosen ARV source.
  function resolveInputs(p) {
    const b = p.brrrr;
    const range = computeArvRange(p);
    const manualArv = num(b.arv) || 0;
    const arv = arvForSource(p.arvMode, manualArv, range);
    const n = (v) => num(v) || 0;
    return {
      purchasePrice: n(b.purchasePrice), purchaseType: b.purchaseType === "cash" ? "cash" : "financed",
      downPayment: n(b.downPayment), purchaseInterestRate: n(b.purchaseInterestRate), purchaseLoanTerm: n(b.purchaseLoanTerm),
      closingCosts: n(b.closingCosts), holdingCosts: n(b.holdingCosts), rehabCosts: n(b.rehabCosts),
      arv, refinanceLTV: n(b.refinanceLTV), newInterestRate: n(b.newInterestRate), newLoanTerm: n(b.newLoanTerm),
      monthlyRent: n(b.monthlyRent), taxes: n(b.taxes), insurance: n(b.insurance),
      management: n(b.management), vacancy: n(b.vacancy), maintenance: n(b.maintenance),
      hoa: n(b.hoa), capexReserve: n(b.capexReserve), utilities: n(b.utilities),
    };
  }

  function metricsFor(p) {
    const inputs = resolveInputs(p);
    const r = analyze(inputs);
    const s = summarize(inputs, r);
    const hasDeal = (num(p.brrrr.purchasePrice) || 0) > 0 || inputs.arv > 0 || (num(p.brrrr.monthlyRent) || 0) > 0;
    return {
      inputs, r, s, hasDeal,
      grade: investmentGrade(s.score, s.recommendation),
      score: s.score, recommendation: s.recommendation, stars: s.stars, risk: s.risk,
      monthlyCashFlow: r.monthlyCashFlow, dscr: r.dscr, capRate: r.capRate, cashOnCash: r.cashOnCash,
      capitalRecoveryPct: r.brrrrPct, cashLeftInDeal: r.cashLeftInDeal, cashOutSurplus: r.cashOutSurplus,
      equityCreated: r.equityCreated, arv: inputs.arv,
    };
  }

  function propTitle(p) { return (p.name || "").trim() || (p.address || "").trim() || "Untitled property"; }
  function cityStateZip(p) { return [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
  function listValue(p) { return num(p.soldPrice) || num(p.brrrr.purchasePrice) || null; }

  /* ===================================================================== *
   *  3. RENOVATION DETECTION  (local rule-based, no AI)                    *
   * ===================================================================== */

  const RENO_RULES = {
    recent: ["fully renovated", "fully remodeled", "newly renovated", "renovated", "remodeled", "updated throughout", "new kitchen", "new bathrooms", "new bathroom", "new flooring", "new roof", "new hvac", "new a/c", "turnkey", "turn key", "move-in ready", "move in ready"],
    updated: ["recently updated", "updated", "new paint", "freshly painted", "new appliances", "new carpet", "new windows", "well maintained"],
    light: ["light updates", "some updates", "cosmetic updates", "minor updates", "needs cosmetic", "freshen up", "tlc"],
    needs: ["needs tlc", "fixer-upper", "fixer upper", "fixer", "investor special", "as-is", "as is", "original condition", "original", "dated", "outdated", "needs work", "handyman special", "handyman", "value-add", "value add", "needs renovation", "needs updating", "bring your", "tear down", "gut"],
  };

  function detectRenovation(p) {
    const text = [p.notes, p.description, p.renovationNotes].filter(Boolean).join(" \n ").toLowerCase();
    if (!text.trim()) return { condition: "Unknown", confidence: "Low", matched: [] };
    const hits = { recent: [], updated: [], light: [], needs: [] };
    for (const cat of Object.keys(RENO_RULES)) {
      for (const kw of RENO_RULES[cat]) {
        if (text.indexOf(kw) !== -1 && hits[cat].indexOf(kw) === -1) hits[cat].push(kw);
      }
    }
    const nRecent = hits.recent.length, nUpdated = hits.updated.length, nLight = hits.light.length, nNeeds = hits.needs.length;
    const total = nRecent + nUpdated + nLight + nNeeds;
    let condition = "Unknown";
    if (total === 0) return { condition, confidence: "Low", matched: [] };

    // Conservative when signals conflict: a "needs work" phrase outweighs polish.
    if (nNeeds > 0 && nNeeds >= nRecent) condition = "Needs Renovation";
    else if (nRecent >= 2) condition = "Recently Renovated";
    else if (nRecent === 1 && nNeeds === 0) condition = "Recently Renovated";
    else if (nUpdated >= 1) condition = "Updated";
    else if (nLight >= 1) condition = "Light Updates";
    else condition = "Updated";

    const matched = [].concat(hits.needs, hits.recent, hits.updated, hits.light).slice(0, 6);
    const confidence = total >= 3 ? "High" : total === 2 ? "Medium" : "Low";
    return { condition, confidence, matched };
  }

  // Map a property's detected condition to the comp engine's reno quality.
  function renoQuality(p) {
    const c = detectRenovation(p).condition;
    if (c === "Recently Renovated") return "Superior";
    if (c === "Needs Renovation") return "Basic";
    return "Similar";
  }

  /* ===================================================================== *
   *  4. COMP SUGGESTIONS + ARV RANGE  (local data only)                    *
   * ===================================================================== */

  function haversineMiles(a, b) {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const la1 = toRad(a.lat), la2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function soldDaysAgo(p) {
    if (!p.soldDate) return null;
    const t = Date.parse(p.soldDate);
    if (isNaN(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 86400000));
  }

  // Score every other property as a candidate comp for `subject`.
  function scoreCandidate(subject, p) {
    const value = listValue(p);
    const sqft = num(p.sqft);
    const ppsf = value && sqft ? value / sqft : null;
    if (ppsf == null) return null; // unusable without price + sqft
    const dist = haversineMiles(subject, p);
    const why = [];
    let score = 100;

    if (subject.zip && p.zip && normKey(subject.zip) === normKey(p.zip)) why.push("Same ZIP");
    else if (subject.city && p.city && normKey(subject.city) === normKey(p.city)) { score -= 4; why.push("Same city"); }
    else score -= 18;

    if (dist != null) { score -= Math.min(25, dist * 8); why.push(dist.toFixed(1) + " mi"); }

    if (num(subject.beds) != null && num(p.beds) != null) {
      score -= Math.min(15, Math.abs(p.beds - subject.beds) * 8);
      if (p.beds === subject.beds) why.push("Same beds");
    }
    if (num(subject.baths) != null && num(p.baths) != null) score -= Math.min(12, Math.abs(p.baths - subject.baths) * 8);
    if (num(subject.sqft) > 0 && sqft) {
      const diff = Math.abs(sqft - subject.sqft) / subject.sqft;
      score -= Math.min(25, diff * 60);
      if (diff <= 0.1) why.push("Similar sqft");
    }
    const sq = renoQuality(subject), pq = renoQuality(p);
    if (sq === pq) why.push("Similar condition"); else score -= 4;

    if (num(p.soldPrice) > 0) { score += 6; why.push("Sold price"); }
    const days = soldDaysAgo(p);
    if (days != null) { score -= Math.min(12, (days / 30) * 2); if (days <= 120) why.push("Recent sale"); }

    const reno = renoQuality(p);
    const impliedARV = num(subject.sqft) > 0 ? ppsf * renoFactor(reno) * subject.sqft : value;
    return { p, value, sqft, ppsf, dist, days, reno, score: Math.max(5, Math.round(score)), why, impliedARV };
  }

  // Return up to three comps: a lower / similar / higher value bracket.
  function suggestComps(subject, all) {
    const pool = all
      .filter((p) => p.id !== subject.id)
      .map((p) => scoreCandidate(subject, p))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (pool.length === 0) return { lower: null, similar: null, higher: null, pool: [] };

    const similar = pool[0];
    const rest = pool.slice(1);
    const below = rest.filter((c) => c.impliedARV < similar.impliedARV).sort((a, b) => b.score - a.score);
    const above = rest.filter((c) => c.impliedARV > similar.impliedARV).sort((a, b) => b.score - a.score);

    let lower = below[0] || null;
    let higher = above[0] || null;
    // If the best match sits at an extreme, backfill from whichever side has data.
    if (!lower && above[1]) lower = above[1];
    if (!higher && below[1]) higher = below[1];
    if (lower) lower.bracket = "lower";
    if (higher) higher.bracket = "higher";
    similar.bracket = "similar";
    return { lower, similar, higher, pool };
  }

  // ARV range derived from the subject's *kept* comps (or auto-suggested).
  function computeArvRange(p) {
    const sqft = num(p.sqft);
    const kept = (p.comps || []).filter((c) => c.included !== false);
    let comps = kept;
    if (comps.length === 0) {
      const all = STATE ? STATE.properties : [];
      const sug = suggestComps(p, all);
      comps = [sug.lower, sug.similar, sug.higher].filter(Boolean).map((c) => compFromCandidate(c));
    }
    if (!sqft || comps.length === 0) return { conservative: 0, expected: 0, aggressive: 0, confidence: "Low", ppsfLow: 0, ppsfHigh: 0, count: 0 };

    const implied = comps
      .filter((c) => num(c.salePrice) > 0 && num(c.sqft) > 0)
      .map((c) => (c.salePrice / c.sqft) * renoFactor(c.reno || "Similar"));
    if (implied.length === 0) return { conservative: 0, expected: 0, aggressive: 0, confidence: "Low", ppsfLow: 0, ppsfHigh: 0, count: 0 };

    const arvs = implied.map((ppsf) => ppsf * sqft);
    const conservative = Math.min.apply(null, arvs);
    const aggressive = Math.max.apply(null, arvs);
    const expected = arvs.reduce((a, b) => a + b, 0) / arvs.length;
    const mean = expected;
    const cv = mean > 0 ? Math.sqrt(arvs.reduce((a, b) => a + (b - mean) ** 2, 0) / arvs.length) / mean : 1;
    let confidence = "Medium";
    if (implied.length >= 3 && cv <= 0.1) confidence = "High";
    else if (implied.length < 2 || cv > 0.2) confidence = "Low";
    return {
      conservative, expected, aggressive, confidence,
      ppsfLow: Math.min.apply(null, implied), ppsfHigh: Math.max.apply(null, implied), count: implied.length,
    };
  }

  // Convert a scored candidate into a stored comp record on a subject property.
  function compFromCandidate(c) {
    return {
      id: genId(), refId: c.p.id, address: propTitle(c.p) + (cityStateZip(c.p) ? ", " + cityStateZip(c.p) : ""),
      salePrice: c.value, sqft: c.sqft, beds: num(c.p.beds), baths: num(c.p.baths),
      distance: c.dist, daysSinceSale: c.days, reno: c.reno, included: true,
      link: c.p.listingLink || "", soldDate: c.p.soldDate || "", why: c.why.join(" · "),
    };
  }

  /* ===================================================================== *
   *  5. CSV IMPORT  (fuzzy column matching)                                *
   * ===================================================================== */

  function parseCsv(text) {
    const rows = [];
    let cur = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += c;
    }
    if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
    return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ""));
  }

  // Ordered most-specific first so e.g. "sold price" beats "price".
  const COLUMN_ALIASES = [
    ["soldPrice", ["sold price", "sale price", "closed price", "sold for", "final price"]],
    ["soldDate", ["sold date", "sale date", "close date", "closed date", "date sold"]],
    ["renovationNotes", ["renovation notes", "reno notes", "renovation", "condition", "rehab notes"]],
    ["listingLink", ["listing link", "listing url", "listing", "link", "url", "source link", "source", "redfin url", "zillow url"]],
    ["photosLink", ["photos link", "photo link", "image link", "image url", "photos", "photo", "images", "image"]],
    ["yearBuilt", ["year built", "yearbuilt", "yr built", "built", "year"]],
    ["lotSize", ["lot size", "lotsize", "lot sqft", "lot area", "lot", "acres", "acreage"]],
    ["rehabEstimate", ["rehab estimate", "rehab cost", "renovation cost", "repair cost", "repairs", "rehab"]],
    ["arv", ["after repair value", "arv", "after repair", "resale value", "resale"]],
    ["latitude", ["latitude", "lat"]],
    ["longitude", ["longitude", "lng", "long", "lon"]],
    ["propertyName", ["property name", "name", "title", "label"]],
    ["address", ["street address", "address", "street", "addr", "property address"]],
    ["city", ["city", "town"]],
    ["state", ["state", "province", "st"]],
    ["zip", ["zip code", "zipcode", "zip", "postal code", "postal"]],
    ["price", ["list price", "listing price", "asking price", "purchase price", "price", "asking", "list"]],
    ["beds", ["bedrooms", "beds", "bedroom", "bed", "br"]],
    ["baths", ["bathrooms", "baths", "bathroom", "bath", "ba"]],
    ["sqft", ["square feet", "square footage", "sq ft", "sqft", "living area", "gla", "size"]],
    ["taxes", ["property taxes", "annual tax", "property tax", "taxes", "tax"]],
    ["insurance", ["annual insurance", "hazard insurance", "insurance"]],
    ["rent", ["monthly rent", "market rent", "estimated rent", "rent estimate", "rent", "rental"]],
    ["notes", ["notes", "note", "comments", "comment", "remarks"]],
    ["description", ["public remarks", "description", "details", "marketing", "desc"]],
    ["status", ["listing status", "sale status", "status"]],
    ["property", ["property"]],
  ];

  const normHeader = (h) => h.toLowerCase().trim().replace(/[_\-]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  function matchColumns(header) {
    const norm = header.map(normHeader);
    const used = new Set();
    const map = {};
    // pass 1: exact alias match (specific fields first)
    for (const [field, aliases] of COLUMN_ALIASES) {
      if (map[field] != null) continue;
      for (let i = 0; i < norm.length; i++) {
        if (used.has(i)) continue;
        if (aliases.indexOf(norm[i]) !== -1) { map[field] = i; used.add(i); break; }
      }
    }
    // pass 2: substring match (header contains alias or vice-versa)
    for (const [field, aliases] of COLUMN_ALIASES) {
      if (map[field] != null) continue;
      for (let i = 0; i < norm.length; i++) {
        if (used.has(i)) continue;
        if (aliases.some((a) => norm[i].indexOf(a) !== -1 || a.indexOf(norm[i]) !== -1)) { map[field] = i; used.add(i); break; }
      }
    }
    return map;
  }

  function csvToProperties(text, assumptions) {
    const rows = parseCsv(text);
    if (rows.length < 2) return { properties: [], matched: {}, headers: [] };
    const headers = rows[0].map((h) => h.trim());
    const map = matchColumns(headers);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const get = (field) => { const i = map[field]; return i != null && i < cells.length ? cells[i].trim() : ""; };
      const address = get("address");
      const name = get("propertyName") || get("property") || address;
      const price = num(get("price"));
      if (!address && !name && price == null && num(get("beds")) == null) continue;

      const p = emptyProperty();
      p.name = name;
      p.address = address;
      p.city = get("city");
      p.state = get("state");
      p.zip = get("zip");
      p.beds = num(get("beds"));
      p.baths = num(get("baths"));
      p.sqft = num(get("sqft"));
      p.lotSize = num(get("lotSize"));
      p.yearBuilt = num(get("yearBuilt"));
      p.lat = num(get("latitude"));
      p.lng = num(get("longitude"));
      p.listingLink = get("listingLink");
      p.photosLink = get("photosLink");
      p.notes = get("notes");
      p.description = get("description");
      p.renovationNotes = get("renovationNotes");
      p.listingStatus = get("status");
      p.soldPrice = num(get("soldPrice"));
      p.soldDate = get("soldDate");

      const b = defaultBrrrr(price || 0, assumptions);
      const taxes = num(get("taxes"));
      const insurance = num(get("insurance"));
      const rent = num(get("rent"));
      const rehab = num(get("rehabEstimate"));
      const arv = num(get("arv"));
      if (taxes != null) b.taxes = taxes;
      if (insurance != null) b.insurance = insurance;
      if (rent != null) b.monthlyRent = rent;
      if (rehab != null) b.rehabCosts = rehab;
      if (arv != null) b.arv = arv;
      p.brrrr = b;
      out.push(p);
    }
    const matched = {};
    for (const [field, idx] of Object.entries(map)) matched[field] = headers[idx];
    return { properties: out, matched, headers };
  }

  /* ===================================================================== *
   *  6. STORE  (localStorage + JSON backup)                                *
   * ===================================================================== */

  let STATE = null;

  function defaultState() {
    return { version: 1, properties: [], assumptions: Object.assign({}, DEFAULT_ASSUMPTIONS), compareIds: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return sanitizeState(parsed);
      }
    } catch (e) { /* ignore */ }
    return defaultState();
  }

  function sanitizeState(x) {
    const s = defaultState();
    if (x && typeof x === "object") {
      if (x.assumptions && typeof x.assumptions === "object") s.assumptions = Object.assign({}, DEFAULT_ASSUMPTIONS, x.assumptions);
      if (Array.isArray(x.properties)) s.properties = x.properties.map(sanitizeProperty);
      if (Array.isArray(x.compareIds)) s.compareIds = x.compareIds.filter((id) => typeof id === "string");
    }
    return s;
  }

  function sanitizeProperty(x) {
    const p = emptyProperty();
    if (!x || typeof x !== "object") return p;
    const str = (v) => (typeof v === "string" ? v : "");
    p.id = str(x.id) || p.id;
    p.createdAt = num(x.createdAt) || p.createdAt;
    p.updatedAt = num(x.updatedAt) || p.updatedAt;
    p.name = str(x.name); p.address = str(x.address); p.city = str(x.city); p.state = str(x.state); p.zip = str(x.zip);
    p.beds = num(x.beds); p.baths = num(x.baths); p.sqft = num(x.sqft); p.lotSize = num(x.lotSize); p.yearBuilt = num(x.yearBuilt);
    p.lat = num(x.lat); p.lng = num(x.lng);
    p.listingLink = str(x.listingLink); p.photosLink = str(x.photosLink);
    p.notes = str(x.notes); p.description = str(x.description); p.renovationNotes = str(x.renovationNotes);
    p.listingStatus = str(x.listingStatus); p.soldPrice = num(x.soldPrice); p.soldDate = str(x.soldDate);
    p.queueStatus = QUEUE_STATUSES.indexOf(x.queueStatus) !== -1 ? x.queueStatus : "new";
    p.inPipeline = !!x.inPipeline;
    p.pipelineStage = PIPELINE_STAGES.some((s) => s.value === x.pipelineStage) ? x.pipelineStage : "watching";
    p.arvMode = ["manual", "conservative", "expected", "aggressive"].indexOf(x.arvMode) !== -1 ? x.arvMode : "manual";
    p.brrrr = Object.assign(defaultBrrrr(0), x.brrrr && typeof x.brrrr === "object" ? x.brrrr : {});
    if (p.brrrr.purchaseType !== "cash") p.brrrr.purchaseType = "financed";
    p.comps = Array.isArray(x.comps) ? x.comps.map(sanitizeComp).filter(Boolean) : [];
    return p;
  }

  function sanitizeComp(x) {
    if (!x || typeof x !== "object") return null;
    return {
      id: typeof x.id === "string" ? x.id : genId(), refId: typeof x.refId === "string" ? x.refId : null,
      address: typeof x.address === "string" ? x.address : "",
      salePrice: num(x.salePrice), sqft: num(x.sqft), beds: num(x.beds), baths: num(x.baths),
      distance: num(x.distance), daysSinceSale: num(x.daysSinceSale),
      reno: ["Basic", "Similar", "Superior"].indexOf(x.reno) !== -1 ? x.reno : "Similar",
      included: x.included !== false, link: typeof x.link === "string" ? x.link : "",
      soldDate: typeof x.soldDate === "string" ? x.soldDate : "", why: typeof x.why === "string" ? x.why : "",
    };
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }
    catch (e) { toast("Could not save — storage may be full."); }
  }

  function getProperty(id) { return STATE.properties.find((p) => p.id === id) || null; }
  function touch(p) { p.updatedAt = Date.now(); }

  /* ===================================================================== *
   *  7. UTILITIES                                                          *
   * ===================================================================== */

  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const cleaned = String(v).replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  }
  const normKey = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function attr(s) { return esc(s); }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function getPath(obj, path) {
    const parts = path.split(".");
    let o = obj;
    for (const part of parts) { if (o == null) return null; o = o[part]; }
    return o;
  }

  const NUMERIC_FIELDS = new Set([
    "beds", "baths", "sqft", "lotSize", "yearBuilt", "lat", "lng", "soldPrice",
    "brrrr.purchasePrice", "brrrr.downPayment", "brrrr.purchaseInterestRate", "brrrr.purchaseLoanTerm",
    "brrrr.closingCosts", "brrrr.holdingCosts", "brrrr.rehabCosts", "brrrr.arv", "brrrr.refinanceLTV",
    "brrrr.newInterestRate", "brrrr.newLoanTerm", "brrrr.monthlyRent", "brrrr.taxes", "brrrr.insurance",
    "brrrr.management", "brrrr.vacancy", "brrrr.maintenance", "brrrr.hoa", "brrrr.capexReserve", "brrrr.utilities",
  ]);

  let toastTimer = null;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function gradeClass(g) { return g === "Pass" ? "bad" : g.charAt(0) === "A" ? "good" : "warn"; }
  function cfClass(v) { return v >= 100 ? "good" : v < 0 ? "bad" : "warn"; }
  function stars(n) { const full = Math.floor(n); const half = n - full >= 0.5; return "★".repeat(full) + (half ? "½" : ""); }
  function renoBadgeClass(c) { return c === "Recently Renovated" ? "good" : c === "Needs Renovation" ? "bad" : c === "Unknown" ? "" : "warn"; }

  /* ===================================================================== *
   *  8. ROUTER + SHELL                                                     *
   * ===================================================================== */

  const ROUTES = {
    dashboard: { label: "Dashboard", ico: "▦", render: renderDashboard },
    properties: { label: "Properties", ico: "▤", render: renderProperties },
    map: { label: "Map", ico: "◉", render: renderMap },
    queue: { label: "Deal Queue", ico: "≣", render: renderQueue },
    pipeline: { label: "Pipeline", ico: "⇶", render: renderPipeline },
    compare: { label: "Compare", ico: "⇄", render: renderCompare },
    settings: { label: "Settings", ico: "⚙", render: renderSettings },
  };

  function parseHash() {
    const h = (location.hash || "#/dashboard").replace(/^#\/?/, "");
    const parts = h.split("/");
    return { route: parts[0] || "dashboard", id: parts[1] || null };
  }

  function navigate(path) { location.hash = "#/" + path; }

  function render() {
    const { route, id } = parseHash();
    const root = document.getElementById("root");
    const main = renderShell(route);
    root.innerHTML = main;
    const view = document.getElementById("view");
    if (route === "property") renderWorkspace(view, id);
    else if (ROUTES[route]) ROUTES[route].render(view);
    else renderDashboard(view);
    bindShell();
  }

  function renderShell(route) {
    const queueCount = STATE.properties.filter((p) => p.queueStatus !== "ignore" && !p.inPipeline).length;
    const navItems = Object.keys(ROUTES).map((key) => {
      const r = ROUTES[key];
      const active = key === route || (route === "property" && key === "properties") ? " active" : "";
      const badge = key === "queue" && queueCount ? `<span class="badge">${queueCount}</span>` : "";
      return `<button class="nav-item${active}" data-nav="${key}"><span class="nav-ico">${r.ico}</span><span class="nav-label">${r.label}</span>${badge}</button>`;
    }).join("");
    return `
      <div class="app">
        <aside class="sidebar">
          <div class="brand">BRRRR AI<small>Local · offline</small></div>
          ${navItems}
          <div style="margin-top:18px;padding:0 8px">
            <button class="btn primary sm" data-nav="properties" style="width:100%" data-add="1">+ Add property</button>
          </div>
        </aside>
        <main class="main" id="view"></main>
      </div>`;
  }

  function bindShell() {
    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.dataset.add) { addPropertyAndOpen(); return; }
        navigate(b.dataset.nav);
      });
    });
  }

  function addPropertyAndOpen() {
    const p = emptyProperty();
    STATE.properties.unshift(p);
    saveState();
    navigate("property/" + p.id);
  }

  /* ===================================================================== *
   *  9. VIEW: DASHBOARD                                                    *
   * ===================================================================== */

  function renderDashboard(view) {
    const props = STATE.properties;
    const withDeal = props.map((p) => ({ p, m: metricsFor(p) })).filter((x) => x.m.hasDeal);
    const buy = withDeal.filter((x) => x.m.recommendation === "Buy").length;
    const caution = withDeal.filter((x) => x.m.recommendation === "Buy with Caution").length;
    const pass = withDeal.filter((x) => x.m.recommendation === "Pass").length;
    const totalCf = withDeal.reduce((a, x) => a + (isFinite(x.m.monthlyCashFlow) ? x.m.monthlyCashFlow : 0), 0);
    const avgScore = withDeal.length ? Math.round(withDeal.reduce((a, x) => a + x.m.score, 0) / withDeal.length) : 0;
    const totalEquity = withDeal.reduce((a, x) => a + (isFinite(x.m.equityCreated) ? x.m.equityCreated : 0), 0);

    const top = withDeal.slice().sort((a, b) => b.m.score - a.m.score).slice(0, 6);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Dashboard</h1><p>${props.length} properties · ${withDeal.length} analyzed</p></div>
        <div class="page-actions">
          <button class="btn" data-go="properties">Import CSV</button>
          <button class="btn primary" data-add="1">+ Add property</button>
        </div>
      </div>
      ${props.length === 0 ? emptyDashboard() : `
      <div class="grid cols-4">
        ${stat("Properties", props.length, "")}
        ${stat("Avg deal score", avgScore || "—", buy + " buy · " + caution + " caution · " + pass + " pass")}
        ${stat("Total monthly cash flow", fmtUSD(totalCf), "", cfClass(totalCf))}
        ${stat("Forced equity (sum)", fmtUSD(totalEquity), "", totalEquity >= 0 ? "good" : "bad")}
      </div>
      <div class="card mt-lg">
        <h3>Top opportunities</h3>
        ${top.length === 0 ? `<p class="faint">Add purchase price, rent and ARV to a property to see it ranked here.</p>` : `
        <table>
          <thead><tr><th>Property</th><th>Grade</th><th class="num">Cash flow/mo</th><th class="num">DSCR</th><th class="num">ARV</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${top.map(({ p, m }) => `
              <tr class="prop-row" data-open="${p.id}">
                <td><div class="prop-name">${esc(propTitle(p))}</div><div class="prop-sub">${esc(cityStateZip(p) || "—")}</div></td>
                <td><span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span></td>
                <td class="num ${cfClass(m.monthlyCashFlow)}">${fmtUSD(m.monthlyCashFlow)}</td>
                <td class="num">${fmtNum(m.dscr)}</td>
                <td class="num">${fmtUSD(m.arv)}</td>
                <td class="num">${m.score}</td>
              </tr>`).join("")}
          </tbody>
        </table>`}
      </div>`}
    `;
    bindCommon(view);
  }

  function emptyDashboard() {
    return `<div class="empty">
      <div style="font-size:32px;margin-bottom:8px">🏚️ → 💰</div>
      <h3 style="margin:0 0 6px">No properties yet</h3>
      <p>Add one manually or import a CSV to get started. Everything stays on this device.</p>
      <div class="flex" style="justify-content:center;margin-top:14px">
        <button class="btn primary" data-add="1">+ Add property</button>
        <button class="btn" data-go="properties">Import CSV</button>
      </div>
    </div>`;
  }

  function stat(k, v, sub, cls) {
    return `<div class="stat"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }

  /* ===================================================================== *
   *  10. VIEW: PROPERTIES (list + CSV import)                              *
   * ===================================================================== */

  function renderProperties(view) {
    const props = STATE.properties;
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Properties</h1><p>${props.length} saved · stored locally</p></div>
        <div class="page-actions">
          <button class="btn primary" data-add="1">+ Add property</button>
        </div>
      </div>
      <div class="card" id="csv-card">
        <h3>Import CSV <span class="muted">— optional columns, fuzzy header matching</span></h3>
        <div class="dropzone" id="dropzone">
          <p style="margin:0 0 8px">Drop a CSV file here, or</p>
          <input type="file" id="csv-file" accept=".csv,text/csv" style="width:auto;display:inline-block" />
          <div class="hint mt">Recognized columns: name, address, city, state, zip, price, beds, baths, sqft, lot size, year built, taxes, insurance, rent, rehab, ARV, latitude, longitude, listing link, photos, notes, description, status, sold price, sold date, renovation notes.</div>
        </div>
        <div id="csv-preview"></div>
      </div>
      <div class="card">
        <h3>All properties</h3>
        ${props.length === 0 ? `<p class="faint">Nothing yet. Add a property or import a CSV above.</p>` : `
        <table>
          <thead><tr><th>Property</th><th>Reno</th><th>Grade</th><th class="num">Price</th><th class="num">Cash flow</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${props.map((p) => {
              const m = metricsFor(p); const reno = detectRenovation(p);
              return `<tr class="prop-row" data-open="${p.id}">
                <td><div class="prop-name">${esc(propTitle(p))}</div><div class="prop-sub">${esc(cityStateZip(p) || "—")}</div></td>
                <td><span class="badge ${renoBadgeClass(reno.condition)}">${reno.condition}</span></td>
                <td>${m.hasDeal ? `<span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span>` : `<span class="faint">—</span>`}</td>
                <td class="num">${fmtUSD(num(p.brrrr.purchasePrice))}</td>
                <td class="num ${m.hasDeal ? cfClass(m.monthlyCashFlow) : ""}">${m.hasDeal ? fmtUSD(m.monthlyCashFlow) : "—"}</td>
                <td><span class="pill">${p.inPipeline ? pipelineLabel(p.pipelineStage) : queueLabel(p.queueStatus)}</span></td>
                <td class="right"><button class="btn sm danger" data-del="${p.id}">Delete</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}
      </div>
    `;
    bindCommon(view);
    bindCsv(view);
    view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.del;
      if (confirm("Delete this property? This cannot be undone.")) {
        STATE.properties = STATE.properties.filter((p) => p.id !== id);
        STATE.compareIds = STATE.compareIds.filter((x) => x !== id);
        saveState(); render();
      }
    }));
  }

  let pendingImport = null;

  function bindCsv(view) {
    const fileInput = view.querySelector("#csv-file");
    const dz = view.querySelector("#dropzone");
    const handleText = (text, fname) => {
      const res = csvToProperties(text, STATE.assumptions);
      pendingImport = res.properties;
      renderCsvPreview(view, res, fname);
    };
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => handleText(String(reader.result), f.name);
      reader.readAsText(f);
    });
    if (dz) {
      ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => handleText(String(reader.result), f.name);
        reader.readAsText(f);
      });
    }
  }

  function renderCsvPreview(view, res, fname) {
    const wrap = view.querySelector("#csv-preview");
    if (res.properties.length === 0) { wrap.innerHTML = `<p class="bad mt">No rows recognized in ${esc(fname || "file")}. Check that the first row is a header.</p>`; return; }
    const matchedList = Object.keys(res.matched).map((f) => `<span class="pill">${f} ← ${esc(res.matched[f])}</span>`).join(" ");
    const sample = res.properties.slice(0, 5);
    wrap.innerHTML = `
      <div class="divider"></div>
      <div class="flex between wrap">
        <strong>${res.properties.length} properties parsed</strong>
        <div class="flex">
          <button class="btn" id="csv-cancel">Cancel</button>
          <button class="btn primary" id="csv-confirm">Import ${res.properties.length}</button>
        </div>
      </div>
      <div class="hint mt">Matched columns: ${matchedList || "none"}</div>
      <table class="mt">
        <thead><tr><th>Name</th><th>Location</th><th class="num">Price</th><th class="num">Beds/Baths</th><th class="num">Sqft</th><th>Lat/Lng</th></tr></thead>
        <tbody>
          ${sample.map((p) => `<tr>
            <td>${esc(propTitle(p))}</td><td>${esc(cityStateZip(p) || "—")}</td>
            <td class="num">${fmtUSD(num(p.brrrr.purchasePrice))}</td>
            <td class="num">${p.beds == null ? "—" : p.beds}/${p.baths == null ? "—" : p.baths}</td>
            <td class="num">${fmtInt(p.sqft)}</td>
            <td>${p.lat != null && p.lng != null ? "✓" : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${res.properties.length > 5 ? `<p class="hint">…and ${res.properties.length - 5} more.</p>` : ""}
    `;
    wrap.querySelector("#csv-cancel").addEventListener("click", () => { pendingImport = null; wrap.innerHTML = ""; view.querySelector("#csv-file").value = ""; });
    wrap.querySelector("#csv-confirm").addEventListener("click", () => {
      if (!pendingImport) return;
      const incoming = pendingImport;
      const existing = STATE.properties;
      let added = 0, updated = 0;
      for (const np of incoming) {
        const key = importKey(np);
        const match = existing.find((e) => importKey(e) === key);
        if (match) { mergeProperty(match, np); updated++; }
        else { existing.unshift(np); added++; }
      }
      pendingImport = null; saveState();
      toast(`Imported ${added} new, updated ${updated}.`);
      render();
    });
  }

  function importKey(p) {
    const link = (p.listingLink || "").trim().toLowerCase().replace(/[#?].*$/, "").replace(/\/+$/, "");
    if (link) return link;
    return [p.address, p.city, p.state, p.zip].map((s) => normKey(s)).filter(Boolean).join(" ");
  }

  // Fill only fields the incoming row provides; keep manual edits otherwise.
  function mergeProperty(dst, src) {
    const fields = ["name", "address", "city", "state", "zip", "listingLink", "photosLink", "notes", "description", "renovationNotes", "listingStatus", "soldDate"];
    for (const f of fields) if (src[f]) dst[f] = src[f];
    ["beds", "baths", "sqft", "lotSize", "yearBuilt", "lat", "lng", "soldPrice"].forEach((f) => { if (src[f] != null) dst[f] = src[f]; });
    ["purchasePrice", "taxes", "insurance", "monthlyRent", "rehabCosts", "arv"].forEach((f) => { if (src.brrrr[f] != null) dst.brrrr[f] = src.brrrr[f]; });
    touch(dst);
  }

  /* ===================================================================== *
   *  11. VIEW: PROPERTY WORKSPACE                                          *
   * ===================================================================== */

  function renderWorkspace(view, id) {
    const p = getProperty(id);
    if (!p) { view.innerHTML = `<div class="empty">Property not found. <a href="#/properties">Back to list</a></div>`; return; }

    view.innerHTML = `
      <div class="page-head">
        <div>
          <button class="btn ghost sm" data-go="properties">← Properties</button>
          <h1 style="margin-top:8px" id="ws-title">${esc(propTitle(p))}</h1>
          <p id="ws-sub">${esc(cityStateZip(p) || "Add an address below")}</p>
        </div>
        <div class="page-actions" id="ws-head-actions"></div>
      </div>
      <div class="ws-grid">
        <div class="ws-form">${workspaceForm(p)}</div>
        <div class="ws-results" id="ws-results">${workspaceResults(p)}</div>
      </div>
    `;
    bindCommon(view);
    bindWorkspace(view, p);
    renderHeadActions(p);
  }

  function renderHeadActions(p) {
    const el = document.getElementById("ws-head-actions");
    if (!el) return;
    const inCompare = STATE.compareIds.indexOf(p.id) !== -1;
    el.innerHTML = `
      ${p.inPipeline
        ? `<span class="badge good">In pipeline · ${pipelineLabel(p.pipelineStage)}</span>`
        : `<button class="btn" data-pipeline="1">→ Add to pipeline</button>`}
      <button class="btn ${inCompare ? "primary" : ""}" data-compare="1">${inCompare ? "✓ Comparing" : "+ Compare"}</button>
    `;
    el.querySelector("[data-pipeline]") && el.querySelector("[data-pipeline]").addEventListener("click", () => {
      p.inPipeline = true; p.pipelineStage = "analyzing"; touch(p); saveState(); renderHeadActions(p); toast("Added to pipeline.");
    });
    el.querySelector("[data-compare]").addEventListener("click", () => {
      const i = STATE.compareIds.indexOf(p.id);
      if (i === -1) STATE.compareIds.push(p.id); else STATE.compareIds.splice(i, 1);
      saveState(); renderHeadActions(p);
    });
  }

  function field(label, path, val, opts) {
    opts = opts || {};
    const v = val == null ? "" : val;
    const type = opts.type || (NUMERIC_FIELDS.has(path) ? "number" : "text");
    const ph = opts.ph ? ` placeholder="${attr(opts.ph)}"` : "";
    const step = opts.step ? ` step="${opts.step}"` : "";
    return `<div class="field"><label>${label}</label><input type="${type}"${step} data-field="${path}" value="${attr(v)}"${ph} /></div>`;
  }

  function workspaceForm(p) {
    const b = p.brrrr;
    const reno = detectRenovation(p);
    return `
      <div class="card">
        <h3>Property</h3>
        <div class="field-row">
          ${field("Name", "name", p.name)}
          ${field("Listing status", "listingStatus", p.listingStatus, { ph: "Active / Pending / Sold" })}
        </div>
        ${field("Address", "address", p.address)}
        <div class="field-row three">
          ${field("City", "city", p.city)}
          ${field("State", "state", p.state)}
          ${field("ZIP", "zip", p.zip)}
        </div>
        <div class="field-row three">
          ${field("Beds", "beds", p.beds)}
          ${field("Baths", "baths", p.baths, { step: "0.5" })}
          ${field("Sqft", "sqft", p.sqft)}
        </div>
        <div class="field-row three">
          ${field("Lot size", "lotSize", p.lotSize)}
          ${field("Year built", "yearBuilt", p.yearBuilt)}
          ${field("List price", "brrrr.purchasePrice", b.purchasePrice)}
        </div>
        <div class="field-row three">
          ${field("Latitude", "lat", p.lat, { step: "any" })}
          ${field("Longitude", "lng", p.lng, { step: "any" })}
          <div class="field"><label>Map pin</label><div class="hint" style="padding-top:8px">${p.lat != null && p.lng != null ? "✓ Will appear on map" : "Add lat/lng for a pin"}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>Links & condition</h3>
        ${field("Listing link", "listingLink", p.listingLink, { ph: "https://…" })}
        ${field("Photos / images link", "photosLink", p.photosLink, { ph: "https://… (optional)" })}
        <div class="field"><label>Description</label><textarea data-field="description" placeholder="Public remarks / marketing copy…">${esc(p.description)}</textarea></div>
        <div class="field"><label>Renovation notes</label><textarea data-field="renovationNotes" placeholder="Condition, recent work, what it needs…">${esc(p.renovationNotes)}</textarea></div>
        <div class="field"><label>Notes</label><textarea data-field="notes">${esc(p.notes)}</textarea></div>
        <div class="flex" id="reno-line">
          <span class="comp-tag">Detected condition</span>
          <span class="badge ${renoBadgeClass(reno.condition)}">${reno.condition}</span>
          <span class="pill">confidence: ${reno.confidence}</span>
          ${reno.matched.length ? `<span class="hint">matched: ${esc(reno.matched.join(", "))}</span>` : ""}
        </div>
      </div>

      <div class="section-title">Phase 1 — Purchase</div>
      <div class="card">
        <div class="field">
          <label>Purchase type</label>
          <div class="mode-toggle" data-toggle="brrrr.purchaseType">
            <button data-val="financed" class="${b.purchaseType === "financed" ? "active" : ""}">Financed</button>
            <button data-val="cash" class="${b.purchaseType === "cash" ? "active" : ""}">Cash</button>
          </div>
        </div>
        <div class="field-row">
          ${field("Down payment ($)", "brrrr.downPayment", b.downPayment)}
          ${field("Rehab costs ($)", "brrrr.rehabCosts", b.rehabCosts)}
        </div>
        <div class="field-row three">
          ${field("Purchase rate %", "brrrr.purchaseInterestRate", b.purchaseInterestRate, { step: "0.01" })}
          ${field("Term (yrs)", "brrrr.purchaseLoanTerm", b.purchaseLoanTerm)}
          ${field("Closing ($)", "brrrr.closingCosts", b.closingCosts)}
        </div>
        ${field("Holding costs ($)", "brrrr.holdingCosts", b.holdingCosts)}
      </div>

      <div class="section-title">Phase 2 — Refinance & ARV</div>
      <div class="card" id="arv-card">${arvSection(p)}</div>

      <div class="section-title">Phase 3 — Rental</div>
      <div class="card">
        <div class="field-row">
          ${field("Monthly rent ($)", "brrrr.monthlyRent", b.monthlyRent)}
          ${field("Annual taxes ($)", "brrrr.taxes", b.taxes)}
        </div>
        <div class="field-row">
          ${field("Annual insurance ($)", "brrrr.insurance", b.insurance)}
          ${field("HOA ($/mo)", "brrrr.hoa", b.hoa)}
        </div>
        <div class="field-row three">
          ${field("Mgmt %", "brrrr.management", b.management, { step: "0.1" })}
          ${field("Vacancy %", "brrrr.vacancy", b.vacancy, { step: "0.1" })}
          ${field("Maint %", "brrrr.maintenance", b.maintenance, { step: "0.1" })}
        </div>
        <div class="field-row">
          ${field("CapEx %", "brrrr.capexReserve", b.capexReserve, { step: "0.1" })}
          ${field("Utilities ($/mo)", "brrrr.utilities", b.utilities)}
        </div>
      </div>

      <div class="section-title">Sold (for use as a comp)</div>
      <div class="card">
        <div class="field-row">
          ${field("Sold price ($)", "soldPrice", p.soldPrice)}
          ${field("Sold date", "soldDate", p.soldDate, { type: "date" })}
        </div>
        <div class="hint">Properties with a sold price + sqft become available as comps for your other deals.</div>
      </div>
    `;
  }

  function arvSection(p) {
    const b = p.brrrr;
    const range = computeArvRange(p);
    const opt = (val, label, arv) => `<button class="btn sm ${p.arvMode === val ? "primary" : ""}" data-arvmode="${val}" ${arv ? "" : "disabled"}>${label}${arv ? ` · ${fmtUSD(arv)}` : ""}</button>`;
    return `
      <div class="field-row three">
        ${field("Manual ARV ($)", "brrrr.arv", b.arv)}
        ${field("Refi LTV %", "brrrr.refinanceLTV", b.refinanceLTV, { step: "0.1" })}
        ${field("Refi rate %", "brrrr.newInterestRate", b.newInterestRate, { step: "0.01" })}
      </div>
      ${field("Refi term (yrs)", "brrrr.newLoanTerm", b.newLoanTerm)}
      <div class="divider"></div>
      <label>ARV source feeding the calculator</label>
      <div class="flex wrap" data-arvmodes>
        ${opt("manual", "Manual", num(b.arv))}
        ${opt("conservative", "Conservative", range.conservative)}
        ${opt("expected", "Expected", range.expected)}
        ${opt("aggressive", "Aggressive", range.aggressive)}
      </div>
      ${range.count > 0 ? `<div class="hint mt">Comp range from ${range.count} comp${range.count === 1 ? "" : "s"} · confidence ${range.confidence} · $${fmtInt(range.ppsfLow)}–$${fmtInt(range.ppsfHigh)}/sqft</div>` : `<div class="hint mt">Add comps below (or sold properties to your database) to unlock comp-based ARV.</div>`}
    `;
  }

  function workspaceResults(p) {
    const m = metricsFor(p);
    const r = m.r;
    return `
      <div class="card">
        <div class="flex between">
          <h3 style="margin:0">Analysis</h3>
          ${m.hasDeal ? `<span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span>` : ""}
        </div>
        ${!m.hasDeal ? `<p class="faint mt">Enter a price, rent, or ARV to analyze.</p>` : `
        <div class="flex between mt">
          <div><div class="stars">${stars(m.stars)}</div><div class="hint">${m.recommendation} · risk ${m.risk}</div></div>
          <div class="right"><div class="v ${cfClass(m.monthlyCashFlow)}" style="font-size:20px">${fmtUSD(m.monthlyCashFlow)}/mo</div><div class="hint">cash flow</div></div>
        </div>
        <div class="grid cols-2 mt">
          ${miniStat("DSCR", fmtNum(m.dscr))}
          ${miniStat("Cap rate", fmtPct(m.capRate))}
          ${miniStat("Cash-on-cash", fmtPct(m.cashOnCash))}
          ${miniStat("Capital recovered", fmtPct(m.capitalRecoveryPct))}
        </div>
        <div class="mt">
          <div class="kv"><span class="k">ARV used (${p.arvMode})</span><span class="v">${fmtUSD(m.arv)}</span></div>
          <div class="kv"><span class="k">Cash invested</span><span class="v">${fmtUSD(r.cashInvested)}</span></div>
          <div class="kv"><span class="k">Cash left in deal</span><span class="v">${fmtUSD(r.cashLeftInDeal)}</span></div>
          <div class="kv"><span class="k">Cash out surplus</span><span class="v">${fmtUSD(r.cashOutSurplus)}</span></div>
          <div class="kv"><span class="k">New mortgage</span><span class="v">${fmtUSD(r.newMonthlyPayment)}/mo</span></div>
          <div class="kv"><span class="k">Forced equity</span><span class="v">${fmtUSD(r.equityCreated)}</span></div>
          <div class="kv"><span class="k">Break-even rent</span><span class="v">${fmtUSD(r.breakEvenRent)}</span></div>
        </div>`}
      </div>
      ${m.hasDeal ? findingsCard(m.s) : ""}
      ${m.hasDeal ? compsCard(p) : ""}
      ${m.hasDeal ? sensitivityCard(m.inputs) : ""}
    `;
  }

  function miniStat(k, v) { return `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:16px">${v}</div></div>`; }

  function findingsCard(s) {
    const list = (items, cls, dot) => items.length ? items.map((f) => `<div class="finding"><span class="dot ${cls}">${dot}</span><div><div class="t">${esc(f.title)}</div><div class="d">${esc(f.detail)}</div></div></div>`).join("") : `<p class="faint">None.</p>`;
    return `<div class="card">
      <h3>Why <span class="muted">${esc(s.recommendationReason)}</span></h3>
      <div class="comp-tag">Strengths</div>${list(s.strengths, "good", "▲")}
      <div class="comp-tag mt">Watch-outs</div>${list(s.weaknesses, "bad", "▼")}
    </div>`;
  }

  function sensitivityCard(inputs) {
    const sens = sensitivity(inputs);
    const v = (verdict) => verdict === "Still Works" ? "good" : verdict === "Tight" ? "warn" : "bad";
    return `<div class="card">
      <h3>Sensitivity <span class="muted">— ${sens.headline}</span></h3>
      <p class="hint">${esc(sens.summary)}</p>
      <div class="grid cols-2 mt">
        ${sens.groups.map((g) => `<div>
          <div class="comp-tag">${g.title}</div>
          ${g.rows.map((row) => `<div class="kv"><span class="k">${row.label}</span><span class="v"><span class="badge ${v(row.verdict)}">${fmtUSD(row.monthlyCashFlow)}</span></span></div>`).join("")}
        </div>`).join("")}
      </div>
      <div class="divider"></div>
      <div class="kv"><span class="k">Combined worst case</span><span class="v"><span class="badge ${v(sens.worstCase.verdict)}">${fmtUSD(sens.worstCase.monthlyCashFlow)}/mo · ${sens.worstCase.verdict}</span></span></div>
    </div>`;
  }

  function compsCard(p) {
    const sug = suggestComps(p, STATE.properties);
    const kept = p.comps || [];
    const sqft = num(p.sqft);
    const range = computeArvRange(p);

    const suggestionCard = (c) => {
      if (!c) return "";
      const alreadyKept = kept.some((k) => k.refId === c.p.id);
      return `<div class="comp-card ${c.bracket}">
        <div class="flex between"><span class="comp-tag">${c.bracket} comp</span><span class="pill">match ${c.score}</span></div>
        <div class="prop-name mt">${esc(propTitle(c.p))}</div>
        <div class="prop-sub">${esc(cityStateZip(c.p) || "—")}</div>
        <div class="grid cols-2 mt">
          ${miniStat("Sold/list", fmtUSD(c.value))}
          ${miniStat("$/sqft", "$" + fmtInt(c.ppsf))}
        </div>
        <div class="hint mt">${fmtInt(c.sqft)} sqft · ${c.p.beds == null ? "—" : c.p.beds}bd/${c.p.baths == null ? "—" : c.p.baths}ba · ${c.reno}${c.dist != null ? " · " + c.dist.toFixed(1) + " mi" : ""}${c.p.soldDate ? " · sold " + esc(c.p.soldDate) : ""}</div>
        ${sqft ? `<div class="hint">Implies ARV ≈ ${fmtUSD(c.impliedARV)}</div>` : ""}
        <div class="comp-why">Why: ${esc(c.why.join(" · ") || "best available match")}</div>
        <div class="flex mt">
          <button class="btn sm ${alreadyKept ? "" : "primary"}" data-keepcomp="${c.p.id}" ${alreadyKept ? "disabled" : ""}>${alreadyKept ? "Kept" : "Keep comp"}</button>
          ${c.p.listingLink ? `<a class="btn sm" href="${attr(c.p.listingLink)}" target="_blank" rel="noopener">Listing ↗</a>` : ""}
          <a class="btn sm" href="#/property/${c.p.id}">Open ↗</a>
        </div>
      </div>`;
    };

    const keptRow = (c) => `<div class="comp-card">
      <div class="flex between">
        <div><div class="prop-name">${esc(c.address || "Comp")}</div>
        <div class="hint">${fmtUSD(c.salePrice)} · ${fmtInt(c.sqft)} sqft · $${fmtInt(num(c.salePrice) && num(c.sqft) ? c.salePrice / c.sqft : null)}/sqft · ${c.reno}${c.distance != null ? " · " + c.distance.toFixed(1) + " mi" : ""}${c.soldDate ? " · " + esc(c.soldDate) : ""}</div>
        ${c.why ? `<div class="comp-why">Why: ${esc(c.why)}</div>` : ""}</div>
        <div class="flex">
          ${c.link ? `<a class="btn sm" href="${attr(c.link)}" target="_blank" rel="noopener">↗</a>` : ""}
          <button class="btn sm" data-togglecomp="${c.id}">${c.included !== false ? "Exclude" : "Include"}</button>
          <button class="btn sm danger" data-removecomp="${c.id}">Remove</button>
        </div>
      </div>
    </div>`;

    return `<div class="card" id="comps-card">
      <h3>ARV & comps <span class="muted">— from your local database</span></h3>
      ${!sqft ? `<p class="warn">Add the subject's square footage to compute comp-based ARV.</p>` : ""}
      ${range.count > 0 ? `<div class="grid cols-3 mb">
        ${stat("Conservative", fmtUSD(range.conservative), "lower comp")}
        ${stat("Expected", fmtUSD(range.expected), "confidence " + range.confidence)}
        ${stat("Aggressive", fmtUSD(range.aggressive), "higher comp")}
      </div>` : ""}
      <div class="comp-tag">Suggested comps</div>
      ${sug.pool.length === 0 ? `<p class="faint">No usable comps in your database yet. Add other properties with a sold/list price and sqft.</p>` : `
      <div class="grid cols-3 mt">${[sug.lower, sug.similar, sug.higher].map(suggestionCard).join("")}</div>`}
      ${kept.length ? `<div class="comp-tag mt-lg">Kept comps (${kept.length})</div><div class="grid mt">${kept.map(keptRow).join("")}</div>` : ""}
    </div>`;
  }

  function bindWorkspace(view, p) {
    const recompute = () => {
      const results = document.getElementById("ws-results");
      if (results) results.innerHTML = workspaceResults(p);
      bindResults(view, p);
      const title = document.getElementById("ws-title");
      const sub = document.getElementById("ws-sub");
      if (title) title.textContent = propTitle(p);
      if (sub) sub.textContent = cityStateZip(p) || "Add an address below";
    };

    view.querySelectorAll("[data-field]").forEach((input) => {
      const path = input.dataset.field;
      input.addEventListener("input", () => {
        let val = input.value;
        if (NUMERIC_FIELDS.has(path) && input.type === "number") val = input.value === "" ? null : num(input.value);
        setPath(p, path, val);
        touch(p); saveState();
        // Re-detect reno inline + refresh results.
        if (path === "notes" || path === "description" || path === "renovationNotes") refreshRenoLine(p);
        recompute();
      });
    });

    view.querySelectorAll("[data-toggle]").forEach((tg) => {
      tg.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
        setPath(p, tg.dataset.toggle, btn.dataset.val);
        tg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        touch(p); saveState(); recompute();
      }));
    });

    bindResults(view, p);
  }

  function refreshRenoLine(p) {
    const line = document.getElementById("reno-line");
    if (!line) return;
    const reno = detectRenovation(p);
    line.innerHTML = `<span class="comp-tag">Detected condition</span>
      <span class="badge ${renoBadgeClass(reno.condition)}">${reno.condition}</span>
      <span class="pill">confidence: ${reno.confidence}</span>
      ${reno.matched.length ? `<span class="hint">matched: ${esc(reno.matched.join(", "))}</span>` : ""}`;
  }

  // (Re)bind handlers that live inside the results column (ARV modes, comps).
  function bindResults(view, p) {
    document.querySelectorAll("[data-arvmode]").forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      p.arvMode = b.dataset.arvmode; touch(p); saveState();
      const results = document.getElementById("ws-results");
      if (results) results.innerHTML = workspaceResults(p);
      // also refresh the ARV source buttons in the form
      const arvCard = document.getElementById("arv-card");
      if (arvCard) { arvCard.innerHTML = arvSection(p); bindArvCard(view, p); }
      bindResults(view, p);
    }));
    document.querySelectorAll("[data-keepcomp]").forEach((b) => b.addEventListener("click", () => {
      const refId = b.dataset.keepcomp;
      const cand = scoreCandidate(p, getProperty(refId));
      if (cand) { p.comps.push(compFromCandidate(cand)); touch(p); saveState(); rerenderComps(view, p); }
    }));
    document.querySelectorAll("[data-togglecomp]").forEach((b) => b.addEventListener("click", () => {
      const c = p.comps.find((x) => x.id === b.dataset.togglecomp);
      if (c) { c.included = c.included === false; touch(p); saveState(); rerenderComps(view, p); }
    }));
    document.querySelectorAll("[data-removecomp]").forEach((b) => b.addEventListener("click", () => {
      p.comps = p.comps.filter((x) => x.id !== b.dataset.removecomp); touch(p); saveState(); rerenderComps(view, p);
    }));
  }

  function rerenderComps(view, p) {
    const results = document.getElementById("ws-results");
    if (results) results.innerHTML = workspaceResults(p);
    const arvCard = document.getElementById("arv-card");
    if (arvCard) { arvCard.innerHTML = arvSection(p); bindArvCard(view, p); }
    bindResults(view, p);
  }

  function bindArvCard(view, p) {
    const arvInput = document.querySelector('[data-field="brrrr.arv"]');
    if (arvInput) arvInput.addEventListener("input", () => {
      setPath(p, "brrrr.arv", arvInput.value === "" ? null : num(arvInput.value));
      touch(p); saveState();
      const results = document.getElementById("ws-results");
      if (results) results.innerHTML = workspaceResults(p);
      bindResults(view, p);
    });
    document.querySelectorAll('[data-field^="brrrr.refinanceLTV"],[data-field^="brrrr.newInterestRate"],[data-field^="brrrr.newLoanTerm"]').forEach((input) => {
      input.addEventListener("input", () => {
        const path = input.dataset.field;
        setPath(p, path, input.value === "" ? null : num(input.value));
        touch(p); saveState();
        const results = document.getElementById("ws-results");
        if (results) results.innerHTML = workspaceResults(p);
        bindResults(view, p);
      });
    });
  }

  /* ===================================================================== *
   *  12. VIEW: MAP  (offline coordinate plot)                              *
   * ===================================================================== */

  function renderMap(view) {
    const props = STATE.properties;
    const pinned = props.filter((p) => p.lat != null && p.lng != null);
    const missing = props.length - pinned.length;

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Map</h1><p>${pinned.length} of ${props.length} properties have coordinates</p></div>
        <div class="page-actions"><button class="btn" data-go="properties">Add coordinates</button></div>
      </div>
      ${pinned.length === 0 ? `<div class="empty">
        <h3 style="margin:0 0 6px">No mapped properties</h3>
        <p>This offline map plots properties by latitude/longitude. Add <strong>latitude</strong> and <strong>longitude</strong> columns in your CSV, or enter them on a property, to see pins.</p>
        ${missing ? `<p class="hint">${missing} propert${missing === 1 ? "y is" : "ies are"} missing coordinates.</p>` : ""}
      </div>` : mapSvg(pinned) + `
        <div class="hint mt">${missing ? missing + " propert" + (missing === 1 ? "y" : "ies") + " without coordinates not shown. " : ""}Pins are placed by relative lat/lng on a scaled grid (no internet required). Click a pin to open the property.</div>`}
    `;
    bindCommon(view);
    if (pinned.length) bindMap(view, pinned);
  }

  function mapSvg(pinned) {
    const W = 920, H = 520, pad = 48;
    const lats = pinned.map((p) => p.lat), lngs = pinned.map((p) => p.lng);
    let minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    let minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    // pad degenerate ranges (single point or a line)
    if (maxLat - minLat < 1e-4) { minLat -= 0.01; maxLat += 0.01; }
    if (maxLng - minLng < 1e-4) { minLng -= 0.01; maxLng += 0.01; }
    const x = (lng) => pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad);
    const y = (lat) => H - pad - ((lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);

    const pins = pinned.map((p, i) => {
      const m = metricsFor(p);
      const color = m.hasDeal ? (m.grade === "Pass" ? "#f87171" : m.grade.charAt(0) === "A" ? "#34d399" : "#fbbf24") : "#6b7888";
      const cx = x(p.lng), cy = y(p.lat);
      return `<g class="map-pin" data-pin="${i}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">
        <circle r="8" fill="${color}" stroke="#0f1115" stroke-width="2"></circle>
        <circle r="3" fill="#0f1115"></circle>
      </g>`;
    }).join("");

    return `<div class="map-wrap">
      <svg class="map-svg" viewBox="0 0 ${W} ${H}" id="map-svg">${pins}</svg>
      <div class="map-legend">
        <span><span class="legend-dot" style="background:#34d399"></span>Grade A</span>
        <span><span class="legend-dot" style="background:#fbbf24"></span>Grade B/C</span>
        <span><span class="legend-dot" style="background:#f87171"></span>Pass</span>
        <span><span class="legend-dot" style="background:#6b7888"></span>Not analyzed</span>
      </div>
    </div>`;
  }

  function bindMap(view, pinned) {
    const svg = view.querySelector("#map-svg");
    let tip = null;
    const remove = () => { if (tip) { tip.remove(); tip = null; } };
    svg.querySelectorAll("[data-pin]").forEach((g) => {
      const p = pinned[+g.dataset.pin];
      const m = metricsFor(p);
      g.addEventListener("mousemove", (e) => {
        if (!tip) { tip = document.createElement("div"); tip.className = "map-tooltip"; document.body.appendChild(tip); }
        tip.innerHTML = `<div class="t">${esc(propTitle(p))}</div>
          <div class="muted">${esc(p.address || "")}</div>
          <div class="muted">${esc(cityStateZip(p) || "")}</div>
          <div style="margin-top:5px">${fmtUSD(num(p.brrrr.purchasePrice))} · ${p.beds == null ? "—" : p.beds}bd/${p.baths == null ? "—" : p.baths}ba · ${fmtInt(p.sqft)} sqft</div>
          <div>${m.hasDeal ? `Grade ${m.grade} · ${fmtUSD(m.monthlyCashFlow)}/mo` : "Not analyzed"}</div>
          <div class="hint" style="margin-top:5px">Click to open →</div>`;
        tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 280) + "px";
        tip.style.top = (e.clientY + 14) + "px";
      });
      g.addEventListener("mouseleave", remove);
      g.addEventListener("click", () => { remove(); navigate("property/" + p.id); });
    });
  }

  /* ===================================================================== *
   *  13. VIEW: DEAL QUEUE                                                  *
   * ===================================================================== */

  function queueLabel(s) { return { new: "New", watch: "Watching", analyze: "Analyzing", ignore: "Ignored" }[s] || s; }

  function renderQueue(view) {
    const queue = STATE.properties.filter((p) => p.queueStatus !== "ignore" && !p.inPipeline);
    const ranked = queue.map((p) => ({ p, m: metricsFor(p) })).sort((a, b) => b.m.score - a.m.score);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Deal Queue</h1><p>${queue.length} active · triage before the pipeline</p></div>
        <div class="page-actions"><button class="btn" data-add="1">+ Add property</button></div>
      </div>
      ${ranked.length === 0 ? `<div class="empty"><h3 style="margin:0 0 6px">Queue is empty</h3><p>Imported and manual properties land here until you ignore them or move them to the pipeline.</p></div>` : `
      <div class="grid cols-2">
        ${ranked.map(({ p, m }) => queueCard(p, m)).join("")}
      </div>`}
    `;
    bindCommon(view);
    bindQueue(view);
  }

  function queueCard(p, m) {
    const reno = detectRenovation(p);
    return `<div class="card">
      <div class="flex between">
        <div><div class="prop-name" data-open="${p.id}" style="cursor:pointer">${esc(propTitle(p))}</div>
        <div class="prop-sub">${esc(cityStateZip(p) || "—")}</div></div>
        ${m.hasDeal ? `<span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span>` : `<span class="pill">no numbers</span>`}
      </div>
      <div class="grid cols-3 mt">
        ${miniStat("Price", fmtUSD(num(p.brrrr.purchasePrice)))}
        ${miniStat("Cash flow", m.hasDeal ? fmtUSD(m.monthlyCashFlow) : "—")}
        ${miniStat("DSCR", m.hasDeal ? fmtNum(m.dscr) : "—")}
      </div>
      <div class="flex wrap mt">
        <span class="badge ${renoBadgeClass(reno.condition)}">${reno.condition}</span>
        <span class="pill">${queueLabel(p.queueStatus)}</span>
        ${p.listingLink ? `<a class="pill" href="${attr(p.listingLink)}" target="_blank" rel="noopener">Listing ↗</a>` : ""}
      </div>
      <div class="flex wrap mt">
        <button class="btn sm" data-q="watch" data-id="${p.id}">Watch</button>
        <button class="btn sm" data-q="analyze" data-id="${p.id}">Analyze</button>
        <button class="btn sm primary" data-q="pipeline" data-id="${p.id}">→ Pipeline</button>
        <button class="btn sm danger" data-q="ignore" data-id="${p.id}">Ignore</button>
      </div>
    </div>`;
  }

  function bindQueue(view) {
    bindCommon(view);
    view.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
      const p = getProperty(b.dataset.id); if (!p) return;
      const action = b.dataset.q;
      if (action === "pipeline") { p.inPipeline = true; p.pipelineStage = "analyzing"; toast("Moved to pipeline."); }
      else p.queueStatus = action;
      touch(p); saveState(); renderQueue(view);
    }));
  }

  /* ===================================================================== *
   *  14. VIEW: PIPELINE                                                    *
   * ===================================================================== */

  function pipelineLabel(s) { const f = PIPELINE_STAGES.find((x) => x.value === s); return f ? f.label : s; }

  function renderPipeline(view) {
    const inPipe = STATE.properties.filter((p) => p.inPipeline);
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Acquisition Pipeline</h1><p>${inPipe.length} active deals</p></div>
      </div>
      ${inPipe.length === 0 ? `<div class="empty"><h3 style="margin:0 0 6px">Pipeline is empty</h3><p>Promote properties from the Deal Queue or a property's workspace.</p></div>` : `
      <div class="kanban">
        ${PIPELINE_STAGES.map((stage) => {
          const items = inPipe.filter((p) => p.pipelineStage === stage.value);
          return `<div class="kanban-col">
            <h4>${stage.label}<span>${items.length}</span></h4>
            ${items.map((p) => {
              const m = metricsFor(p);
              return `<div class="kanban-card" data-open="${p.id}">
                <div class="prop-name" style="font-size:13px">${esc(propTitle(p))}</div>
                <div class="hint">${m.hasDeal ? `${m.grade} · ${fmtUSD(m.monthlyCashFlow)}/mo` : "—"}</div>
                <select data-stage="${p.id}" style="margin-top:6px">
                  ${PIPELINE_STAGES.map((s) => `<option value="${s.value}" ${s.value === p.pipelineStage ? "selected" : ""}>${s.label}</option>`).join("")}
                </select>
                <button class="btn sm ghost" data-unpipe="${p.id}" style="margin-top:6px;width:100%">Remove</button>
              </div>`;
            }).join("") || `<div class="hint">—</div>`}
          </div>`;
        }).join("")}
      </div>`}
    `;
    bindCommon(view);
    view.querySelectorAll("[data-stage]").forEach((sel) => sel.addEventListener("change", (e) => {
      e.stopPropagation();
      const p = getProperty(sel.dataset.stage); if (!p) return;
      p.pipelineStage = sel.value; touch(p); saveState(); renderPipeline(view);
    }));
    view.querySelectorAll("[data-stage]").forEach((sel) => sel.addEventListener("click", (e) => e.stopPropagation()));
    view.querySelectorAll("[data-unpipe]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const p = getProperty(b.dataset.unpipe); if (!p) return;
      p.inPipeline = false; touch(p); saveState(); renderPipeline(view);
    }));
  }

  /* ===================================================================== *
   *  15. VIEW: COMPARE                                                     *
   * ===================================================================== */

  function renderCompare(view) {
    const ids = STATE.compareIds.filter((id) => getProperty(id));
    STATE.compareIds = ids;
    const chosen = ids.map(getProperty);

    const picker = STATE.properties.map((p) => {
      const on = ids.indexOf(p.id) !== -1;
      return `<label class="checkbox-row" style="text-transform:none;font-size:13px;margin-bottom:6px">
        <input type="checkbox" data-cmp="${p.id}" ${on ? "checked" : ""} ${!on && ids.length >= 4 ? "disabled" : ""}/>
        ${esc(propTitle(p))} <span class="faint">${esc(cityStateZip(p) || "")}</span>
      </label>`;
    }).join("");

    const rows = [
      ["Grade", (m) => m.hasDeal ? `<span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span>` : "—"],
      ["Score", (m) => m.hasDeal ? m.score : "—"],
      ["Recommendation", (m) => m.hasDeal ? m.recommendation : "—"],
      ["Risk", (m) => m.hasDeal ? m.risk : "—"],
      ["Purchase price", (m) => fmtUSD(m.inputs.purchasePrice)],
      ["Rehab", (m) => fmtUSD(m.inputs.rehabCosts)],
      ["ARV used", (m) => fmtUSD(m.arv)],
      ["Monthly rent", (m) => fmtUSD(m.inputs.monthlyRent)],
      ["Cash flow/mo", (m) => `<span class="${cfClass(m.monthlyCashFlow)}">${fmtUSD(m.monthlyCashFlow)}</span>`],
      ["DSCR", (m) => fmtNum(m.dscr)],
      ["Cap rate", (m) => fmtPct(m.capRate)],
      ["Cash-on-cash", (m) => fmtPct(m.cashOnCash)],
      ["Capital recovered", (m) => fmtPct(m.capitalRecoveryPct)],
      ["Cash left in deal", (m) => fmtUSD(m.cashLeftInDeal)],
      ["Forced equity", (m) => fmtUSD(m.equityCreated)],
      ["Worst-case CF", (m) => { const s = sensitivity(m.inputs); return `<span class="${cfClass(s.worstCase.monthlyCashFlow)}">${fmtUSD(s.worstCase.monthlyCashFlow)}</span>`; }],
    ];

    const metrics = chosen.map(metricsFor);

    view.innerHTML = `
      <div class="page-head"><div><h1>Compare Deals</h1><p>Select up to 4 properties</p></div></div>
      <div class="grid cols-2">
        <div class="card"><h3>Choose properties</h3>${STATE.properties.length ? picker : `<p class="faint">No properties yet.</p>`}</div>
        <div class="card">
          <h3>Side by side</h3>
          ${chosen.length === 0 ? `<p class="faint">Pick properties on the left (or use “+ Compare” in a workspace).</p>` : `
          <div style="overflow-x:auto"><table>
            <thead><tr><th>Metric</th>${chosen.map((p) => `<th>${esc(propTitle(p))}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map(([label, fn]) => `<tr><td>${label}</td>${metrics.map((m) => `<td>${fn(m)}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table></div>`}
        </div>
      </div>
    `;
    bindCommon(view);
    view.querySelectorAll("[data-cmp]").forEach((cb) => cb.addEventListener("change", () => {
      const id = cb.dataset.cmp;
      const i = STATE.compareIds.indexOf(id);
      if (cb.checked && i === -1) STATE.compareIds.push(id);
      else if (!cb.checked && i !== -1) STATE.compareIds.splice(i, 1);
      saveState(); renderCompare(view);
    }));
  }

  /* ===================================================================== *
   *  16. VIEW: SETTINGS (assumptions + backup)                            *
   * ===================================================================== */

  function renderSettings(view) {
    const a = STATE.assumptions;
    const af = (label, key, step) => `<div class="field"><label>${label}</label><input type="number" step="${step || 1}" data-assume="${key}" value="${a[key]}" /></div>`;
    view.innerHTML = `
      <div class="page-head"><div><h1>Settings</h1><p>Defaults & local backup</p></div></div>

      <div class="card">
        <h3>Backup <span class="muted">— everything lives in this browser only</span></h3>
        <p class="hint">Export a JSON snapshot of every property, comp and setting. Import restores or merges a snapshot on this or another device.</p>
        <div class="flex wrap mt">
          <button class="btn primary" id="backup-export">⤓ Export Backup</button>
          <button class="btn" id="backup-import">⤒ Import Backup</button>
          <input type="file" id="backup-file" accept=".json,application/json" style="display:none" />
          <button class="btn danger" id="wipe">Clear all data</button>
        </div>
      </div>

      <div class="card">
        <h3>Default assumptions <span class="muted">— applied to new & imported properties</span></h3>
        <div class="grid cols-4">
          ${af("Down payment %", "downPaymentPct")}
          ${af("Purchase rate %", "purchaseRate", 0.01)}
          ${af("Purchase term", "purchaseTermYears")}
          ${af("Closing %", "closingPct", 0.1)}
          ${af("Holding %", "holdingPct", 0.1)}
          ${af("Refi LTV %", "refinanceLTV", 0.1)}
          ${af("Refi rate %", "refiRate", 0.01)}
          ${af("Refi term", "refiTermYears")}
          ${af("Tax rate %", "taxRatePct", 0.01)}
          ${af("Insurance $/yr", "insuranceAnnual")}
          ${af("Mgmt %", "managementPct", 0.1)}
          ${af("Vacancy %", "vacancyPct", 0.1)}
          ${af("Maint %", "maintenancePct", 0.1)}
          ${af("CapEx %", "capexPct", 0.1)}
          ${af("ARV multiplier", "arvMultiplier", 0.01)}
        </div>
        <p class="hint mt">These seed new properties only — they don't change properties you've already saved.</p>
      </div>

      <div class="card">
        <h3>Sample data</h3>
        <p class="hint">Load a few example properties (incl. sold comps) to explore the tool.</p>
        <button class="btn mt" id="seed">Load sample properties</button>
      </div>
    `;
    bindCommon(view);

    view.querySelectorAll("[data-assume]").forEach((input) => input.addEventListener("input", () => {
      const v = num(input.value);
      if (v != null) { STATE.assumptions[input.dataset.assume] = v; saveState(); }
    }));

    view.querySelector("#backup-export").addEventListener("click", () => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`brrrr-backup-${stamp}.json`, JSON.stringify(STATE, null, 2));
      toast("Backup downloaded.");
    });
    const fileInput = view.querySelector("#backup-file");
    view.querySelector("#backup-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = sanitizeState(JSON.parse(String(reader.result)));
          const mode = confirm("OK = MERGE into current data.\nCancel = REPLACE everything with the backup.");
          if (mode) {
            const byKey = new Map(STATE.properties.map((p) => [importKey(p), p]));
            for (const np of data.properties) {
              const k = importKey(np);
              if (k && byKey.has(k)) mergeProperty(byKey.get(k), np);
              else STATE.properties.push(np);
            }
            toast("Backup merged.");
          } else {
            STATE = data; toast("Backup restored.");
          }
          saveState(); render();
        } catch (e) { toast("Could not read backup file."); }
      };
      reader.readAsText(f);
    });

    view.querySelector("#wipe").addEventListener("click", () => {
      if (confirm("Delete ALL local data? Export a backup first if unsure.")) {
        STATE = defaultState(); saveState(); render(); toast("All data cleared.");
      }
    });

    view.querySelector("#seed").addEventListener("click", () => {
      seedSamples(); saveState(); toast("Sample properties added."); navigate("properties");
    });
  }

  function seedSamples() {
    const mk = (o) => {
      const p = emptyProperty();
      Object.assign(p, o.top || {});
      p.brrrr = defaultBrrrr(o.price || 0, STATE.assumptions);
      if (o.rent != null) p.brrrr.monthlyRent = o.rent;
      if (o.rehab != null) p.brrrr.rehabCosts = o.rehab;
      if (o.arv != null) p.brrrr.arv = o.arv;
      return p;
    };
    const samples = [
      mk({ top: { name: "Maple St Rental", address: "742 Maple St", city: "Sherman", state: "TX", zip: "75090", beds: 3, baths: 2, sqft: 1450, lat: 33.6357, lng: -96.6089, description: "Fully renovated, new kitchen and new flooring throughout. Turnkey.", listingLink: "https://example.com/maple" }, price: 165000, rent: 1850, rehab: 25000, arv: 230000 }),
      mk({ top: { name: "Oak Ave Fixer", address: "318 Oak Ave", city: "Sherman", state: "TX", zip: "75090", beds: 3, baths: 1, sqft: 1280, lat: 33.642, lng: -96.62, description: "Investor special, dated, needs work. Bring your contractor — value-add." }, price: 119000, rent: 1500, rehab: 45000, arv: 205000 }),
      mk({ top: { name: "Pine Rd Comp (Sold)", address: "905 Pine Rd", city: "Sherman", state: "TX", zip: "75090", beds: 3, baths: 2, sqft: 1500, lat: 33.63, lng: -96.6, soldPrice: 228000, soldDate: "2026-03-12", description: "Remodeled, updated throughout." } }),
      mk({ top: { name: "Elm St Comp (Sold)", address: "212 Elm St", city: "Sherman", state: "TX", zip: "75090", beds: 3, baths: 2, sqft: 1380, lat: 33.628, lng: -96.615, soldPrice: 199000, soldDate: "2026-02-02", description: "Original condition, some updates." } }),
    ];
    for (const s of samples) STATE.properties.unshift(s);
  }

  /* ===================================================================== *
   *  17. SHARED BINDINGS + BOOTSTRAP                                       *
   * ===================================================================== */

  function bindCommon(view) {
    view.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("[data-del],[data-q],[data-stage],[data-unpipe],button,a,select,input")) return;
      navigate("property/" + el.dataset.open);
    }));
    view.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.go)));
    view.querySelectorAll("[data-add]").forEach((el) => el.addEventListener("click", () => addPropertyAndOpen()));
  }

  function boot() {
    STATE = loadState();
    window.addEventListener("hashchange", render);
    if (!location.hash) location.hash = "#/dashboard";
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
