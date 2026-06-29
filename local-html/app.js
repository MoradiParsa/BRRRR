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
  const fmtUSD = (n, digits) => (n != null && isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits || 0, minimumFractionDigits: digits || 0 }) : "—");
  const fmtPct = (n, digits) => (n == null ? "—" : isFinite(n) ? `${n.toFixed(digits == null ? 1 : digits)}%` : "∞");
  const fmtNum = (n, digits) => (n == null ? "—" : isFinite(n) ? n.toFixed(digits == null ? 2 : digits) : "∞");
  const fmtInt = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));

  /* ===================================================================== *
   *  2. DATA MODEL + DEFAULTS                                              *
   * ===================================================================== */

  const STORE_KEY = "brrrr-local-v1";

  const DEFAULT_ASSUMPTIONS = {
    downPaymentPct: 20, purchaseRate: 9.5, purchaseTermYears: 30, closingPct: 3, holdingPct: 2,
    refinanceLTV: 75, refiRate: 7.25, refiTermYears: 30, taxRatePct: 1.5, insuranceAnnual: 1200,
    managementPct: 8, vacancyPct: 5, maintenancePct: 5, capexPct: 5, arvMultiplier: 1.3,
    defaultRehab: 0, defaultRent: 0,
  };

  // Multifamily typically carries higher management + reserves and a tighter ARV bump.
  const MULTIFAMILY_OVERRIDES = { managementPct: 10, vacancyPct: 7, maintenancePct: 7, capexPct: 7, arvMultiplier: 1.25 };

  const PROPERTY_TYPES = ["single_family", "multifamily"];
  function profileKey(type) { return type === "multifamily" ? "multifamily" : "singleFamily"; }
  function propertyTypeLabel(type) { return type === "multifamily" ? "Multifamily" : "Single Family"; }

  function defaultProfiles() {
    return {
      singleFamily: Object.assign({}, DEFAULT_ASSUMPTIONS),
      multifamily: Object.assign({}, DEFAULT_ASSUMPTIONS, MULTIFAMILY_OVERRIDES),
    };
  }

  // The assumption profile (SF or MF) that should seed a given property.
  function assumptionsForType(type) {
    const a = STATE && STATE.assumptions ? STATE.assumptions : defaultProfiles();
    return a[profileKey(type)] || a.singleFamily || DEFAULT_ASSUMPTIONS;
  }

  // Local, rule-based property-type inference from a units count and/or a type label.
  function inferPropertyType(unitsRaw, typeText, fallback) {
    const u = num(unitsRaw);
    if (u != null && u > 1) return "multifamily";
    const t = normKey(typeText);
    if (t && /(duplex|triplex|fourplex|plex|multi|apartment|\bmf\b|units?)/.test(t)) return "multifamily";
    if (t && /(single|\bsfr\b|\bsfh\b|house|detached|town|condo|\bsf\b)/.test(t)) return "single_family";
    if (u === 1) return "single_family";
    return fallback || "single_family";
  }

  /* ----------------------------- markets -------------------------------- *
   * Texas-focused grouping for filtering. A market label from the CSV is    *
   * always respected (custom labels allowed); otherwise we infer one from   *
   * the city name. Anything unrecognized falls into "Other".                */
  const MARKETS = ["DFW", "Houston", "College Station", "Austin", "San Antonio", "Other"];
  const MARKET_CITY_RULES = [
    ["DFW", ["dallas", "fort worth", "ft worth", "arlington", "plano", "irving", "frisco", "mckinney", "denton", "garland", "mesquite", "richardson", "carrollton", "lewisville", "allen", "grand prairie", "euless", "bedford", "hurst", "grapevine", "mansfield", "rockwall", "wylie", "the colony", "flower mound", "keller", "southlake", "rowlett", "desoto", "duncanville", "cedar hill", "burleson", "weatherford", "prosper", "celina", "little elm", "anna", "melissa", "greenville", "terrell", "sherman", "denison", "cleburne", "waxahachie", "midlothian", "forney", "sachse", "murphy", "coppell"]],
    ["Houston", ["houston", "katy", "sugar land", "pearland", "spring", "cypress", "the woodlands", "woodlands", "humble", "kingwood", "tomball", "conroe", "baytown", "pasadena", "league city", "friendswood", "missouri city", "rosenberg", "richmond", "stafford", "channelview", "deer park", "la porte", "galveston", "texas city", "dickinson", "alvin", "porter", "magnolia", "atascocita", "fulshear", "manvel", "webster", "seabrook", "bellaire"]],
    ["College Station", ["college station", "bryan", "navasota", "hearne", "caldwell", "madisonville", "huntsville", "brenham", "franklin", "anderson"]],
    ["Austin", ["austin", "round rock", "cedar park", "georgetown", "pflugerville", "leander", "kyle", "buda", "san marcos", "hutto", "lakeway", "bee cave", "dripping springs", "manor", "elgin", "taylor", "bastrop", "lockhart", "del valle", "jollyville"]],
    ["San Antonio", ["san antonio", "new braunfels", "schertz", "cibolo", "converse", "universal city", "live oak", "selma", "boerne", "seguin", "helotes", "leon valley", "kirby", "windcrest", "alamo heights", "floresville", "canyon lake", "fair oaks ranch"]],
  ];

  function normCity(s) { return normKey(s).replace(/[.,]/g, ""); }
  function inferMarket(city) {
    const c = normCity(city);
    if (!c) return "";
    for (const [market, cities] of MARKET_CITY_RULES) if (cities.indexOf(c) !== -1) return market;
    for (const [market, cities] of MARKET_CITY_RULES) if (cities.some((x) => c.indexOf(x) !== -1)) return market;
    return "";
  }
  // The market a property belongs to for grouping/filtering (explicit > inferred > Other).
  function marketOf(p) {
    const explicit = (p.market || "").trim();
    if (explicit) return explicit;
    return inferMarket(p.city) || "Other";
  }

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
      rentPerUnit: null,
      otherIncome: null,
      rentMode: "manual", // "manual" total | "auto" from units × rent/unit + other income
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

  // Renovation planner line items (the rehab estimate is built from these).
  const RENO_CATEGORIES = ["Exterior", "Roof", "HVAC", "Plumbing", "Electrical", "Kitchen", "Bathrooms", "Flooring", "Paint", "Windows", "Landscaping", "Other"];
  function defaultRenoItems() { return RENO_CATEGORIES.map((category) => ({ category, cost: null, notes: "" })); }
  function renoTotal(p) { return (p.renoItems || []).reduce((sum, it) => sum + (num(it.cost) || 0), 0); }

  function emptyProperty() {
    const now = Date.now();
    return {
      id: genId(), createdAt: now, updatedAt: now,
      name: "", address: "", city: "", state: "", zip: "",
      market: "", submarket: "",
      propertyType: "single_family", units: null,
      beds: null, baths: null, sqft: null, lotSize: null, yearBuilt: null,
      lat: null, lng: null,
      listingLink: "", photosLink: "",
      notes: "", description: "", renovationNotes: "",
      listingStatus: "", soldPrice: null, soldDate: "",
      queueStatus: "new", inPipeline: false, pipelineStage: "watching",
      arvMode: "manual",
      rehabMode: "planner", // "planner" total from line items | "manual" rehab override
      renoItems: defaultRenoItems(),
      compIds: [],          // manually selected comps — the ONLY comps used for ARV
      brrrr: defaultBrrrr(0),
      extraFields: {},
    };
  }

  /* ------------------------------ resolve inputs ------------------------ */
  // Total monthly rent from the unit-level rent roll (units × rent/unit + other income).
  function totalRentRoll(p) {
    const b = p.brrrr;
    const units = Math.max(1, num(p.units) || 1);
    return units * (num(b.rentPerUnit) || 0) + (num(b.otherIncome) || 0);
  }
  // Effective total monthly rent fed to the engine (auto rent-roll or manual total).
  function effectiveRent(p) {
    return p.brrrr.rentMode === "auto" ? totalRentRoll(p) : (num(p.brrrr.monthlyRent) || 0);
  }
  // Effective rehab cost — the renovation planner total unless a manual override is set.
  function effectiveRehab(p) {
    return p.rehabMode === "manual" ? (num(p.brrrr.rehabCosts) || 0) : renoTotal(p);
  }

  // Build the engine Inputs from a property, substituting the chosen ARV source.
  function resolveInputs(p) {
    const b = p.brrrr;
    const manualArv = num(b.arv) || 0;
    // Only price the comp range when a comp-based ARV actually feeds the deal — keeps
    // the list/dashboard fast (they use the manual ARV and skip the O(n) comp scan).
    let arv = manualArv;
    if (p.arvMode && p.arvMode !== "manual") arv = arvForSource(p.arvMode, manualArv, computeArvRange(p));
    const n = (v) => num(v) || 0;
    return {
      purchasePrice: n(b.purchasePrice), purchaseType: b.purchaseType === "cash" ? "cash" : "financed",
      downPayment: n(b.downPayment), purchaseInterestRate: n(b.purchaseInterestRate), purchaseLoanTerm: n(b.purchaseLoanTerm),
      closingCosts: n(b.closingCosts), holdingCosts: n(b.holdingCosts), rehabCosts: effectiveRehab(p),
      arv, refinanceLTV: n(b.refinanceLTV), newInterestRate: n(b.newInterestRate), newLoanTerm: n(b.newLoanTerm),
      monthlyRent: effectiveRent(p), taxes: n(b.taxes), insurance: n(b.insurance),
      management: n(b.management), vacancy: n(b.vacancy), maintenance: n(b.maintenance),
      hoa: n(b.hoa), capexReserve: n(b.capexReserve), utilities: n(b.utilities),
    };
  }

  function metricsFor(p) {
    const inputs = resolveInputs(p);
    const r = analyze(inputs);
    const s = summarize(inputs, r);
    const hasDeal = (num(p.brrrr.purchasePrice) || 0) > 0 || inputs.arv > 0 || effectiveRent(p) > 0;
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
    return detectRenovationText([p.notes, p.description, p.renovationNotes].filter(Boolean).join(" \n "));
  }

  // Precompiled word-boundary matchers so e.g. "dated" doesn't match inside "updated".
  const RENO_RX = {};
  for (const cat of Object.keys(RENO_RULES)) {
    RENO_RX[cat] = RENO_RULES[cat].map((kw) => [kw, new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i")]);
  }

  function detectRenovationText(raw) {
    const text = String(raw || "").toLowerCase();
    if (!text.trim()) return { condition: "Unknown", confidence: "Low", matched: [] };
    const hits = { recent: [], updated: [], light: [], needs: [] };
    for (const cat of Object.keys(RENO_RX)) {
      for (const [kw, rx] of RENO_RX[cat]) {
        if (rx.test(text) && hits[cat].indexOf(kw) === -1) hits[cat].push(kw);
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

  // Map a detected condition to the comp engine's reno quality.
  function renoQualityFromCondition(c) {
    if (c === "Recently Renovated") return "Superior";
    if (c === "Needs Renovation") return "Basic";
    return "Similar";
  }
  function renoQuality(p) { return renoQualityFromCondition(detectRenovation(p).condition); }

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

  // A comp's value for ARV purposes: prefer a real sold price, then list/purchase, then ARV.
  function compValue(c) {
    const sold = num(c.soldPrice);
    if (sold) return { value: sold, sold: true };
    const list = c.brrrr ? num(c.brrrr.purchasePrice) : null;
    if (list) return { value: list, sold: false };
    const arv = c.brrrr ? num(c.brrrr.arv) : null;
    if (arv) return { value: arv, sold: false };
    return null;
  }

  // Score another property from the master list as a comp for `subject`.
  function scoreCompProp(subject, c) {
    const cv = compValue(c);
    const sqft = num(c.sqft);
    if (!cv || !sqft) return null; // unusable without a value + sqft
    const value = cv.value;
    const ppsf = value / sqft;
    const dist = haversineMiles(subject, c);
    const why = [];
    let score = 100;

    const sm = marketOf(subject), cm = marketOf(c);
    if (sm === cm && sm !== "Other") why.push(sm);
    else if (sm !== cm) score -= 12;

    if (subject.zip && c.zip && normKey(subject.zip) === normKey(c.zip)) why.push("Same ZIP");
    else if (subject.city && c.city && normKey(subject.city) === normKey(c.city)) { score -= 3; why.push("Same city"); }
    else score -= 14;

    const cType = c.propertyType || inferPropertyType(c.units, "", null);
    if (cType && subject.propertyType) {
      if (cType === subject.propertyType) why.push(propertyTypeLabel(cType));
      else score -= 14;
    }
    if (num(subject.units) != null && num(c.units) != null) {
      score -= Math.min(12, Math.abs(c.units - subject.units) * 6);
      if (c.units === subject.units) why.push(c.units + "-unit");
    }

    if (dist != null) { score -= Math.min(22, dist * 7); if (dist <= 2) why.push(dist.toFixed(1) + " mi"); }

    if (num(subject.beds) != null && num(c.beds) != null) {
      score -= Math.min(15, Math.abs(c.beds - subject.beds) * 8);
      if (c.beds === subject.beds) why.push("Same beds");
    }
    if (num(subject.baths) != null && num(c.baths) != null) score -= Math.min(12, Math.abs(c.baths - subject.baths) * 8);
    if (num(subject.sqft) > 0) {
      const diff = Math.abs(sqft - subject.sqft) / subject.sqft;
      score -= Math.min(25, diff * 60);
      if (diff <= 0.1) why.push("Similar sqft");
    }

    const cond = detectRenovation(c).condition;
    const reno = renoQualityFromCondition(cond);
    if (renoQuality(subject) === reno) why.push("Similar condition"); else score -= 4;
    if (cond !== "Unknown") why.push(cond);

    const days = soldDaysAgo(c);
    if (cv.sold) { score += 6; why.push("Sold comp"); }
    if (days != null) { score -= Math.min(12, (days / 30) * 2); if (days <= 120) why.push("Recent sale"); }

    const impliedARV = num(subject.sqft) > 0 ? ppsf * renoFactor(reno) * subject.sqft : value;
    return { c, value, sold: cv.sold, sqft, ppsf, dist, days, reno, condition: cond, score: Math.max(5, Math.round(score)), why, impliedARV };
  }

  // Every other property scored + ranked as a candidate comp for `subject`.
  function compCandidates(subject) {
    return STATE.properties
      .filter((c) => c.id !== subject.id)
      .map((c) => scoreCompProp(subject, c))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  // Auto-pick lower / similar / higher brackets from a scored candidate pool.
  function autoBrackets(pool) {
    if (pool.length === 0) return { lower: null, similar: null, higher: null };
    const similar = pool[0];
    const rest = pool.slice(1);
    const below = rest.filter((x) => x.impliedARV < similar.impliedARV).sort((a, b) => b.score - a.score);
    const above = rest.filter((x) => x.impliedARV > similar.impliedARV).sort((a, b) => b.score - a.score);
    let lower = below[0] || null, higher = above[0] || null;
    if (!lower && above[1]) lower = above[1];
    if (!higher && below[1]) higher = below[1];
    return { lower, similar, higher };
  }

  // Optional suggestion: up to three comps spanning lower / similar / higher value.
  function suggestThree(subject) {
    const auto = autoBrackets(compCandidates(subject));
    return [auto.lower, auto.similar, auto.higher].filter(Boolean);
  }

  // The comps the user has manually selected — the ONLY comps used for ARV.
  function selectedCompList(subject) {
    const out = [];
    for (const id of subject.compIds || []) {
      const c = getProperty(id);
      if (!c) continue;
      const scored = scoreCompProp(subject, c);
      if (scored) out.push(scored);
    }
    // Order by implied value so the lowest reads as the conservative end.
    return out.sort((a, b) => a.impliedARV - b.impliedARV);
  }

  // ARV range derived ONLY from the manually selected comps.
  function computeArvRange(p) {
    const sqft = num(p.sqft);
    const sel = selectedCompList(p);
    if (!sqft || sel.length === 0) return { conservative: 0, expected: 0, aggressive: 0, confidence: "Low", ppsfLow: 0, ppsfHigh: 0, count: 0 };

    const implied = sel.map((x) => x.ppsf * renoFactor(x.reno));
    const arvs = implied.map((ppsf) => ppsf * sqft);
    const conservative = Math.min.apply(null, arvs);
    const aggressive = Math.max.apply(null, arvs);
    const expected = arvs.reduce((a, b) => a + b, 0) / arvs.length;
    const mean = expected;
    const cv = mean > 0 ? Math.sqrt(arvs.reduce((a, b) => a + (b - mean) ** 2, 0) / arvs.length) / mean : 1;
    let confidence = "Medium";
    if (sel.length >= 3 && cv <= 0.1) confidence = "High";
    else if (sel.length < 2 || cv > 0.2) confidence = "Low";
    return {
      conservative, expected, aggressive, confidence,
      ppsfLow: Math.min.apply(null, implied), ppsfHigh: Math.max.apply(null, implied), count: sel.length,
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
    ["market", ["market", "metro", "msa", "metro area", "market area", "region"]],
    ["submarket", ["submarket", "sub market", "neighborhood", "subdivision", "district", "area"]],
    ["listPrice", ["list price", "listing price", "asking price", "asking", "list"]],
    ["price", ["purchase price", "current price", "price"]],
    ["propertyType", ["property type", "home type", "type", "style", "dwelling type", "structure type"]],
    ["units", ["number of units", "num units", "unit count", "units", "no of units"]],
    ["beds", ["bedrooms", "beds", "bedroom", "bed", "br"]],
    ["baths", ["bathrooms", "baths", "bathroom", "bath", "ba"]],
    ["sqft", ["square feet", "square footage", "sq ft", "sqft", "living area", "gla", "size"]],
    ["taxes", ["property taxes", "annual tax", "property tax", "taxes", "tax"]],
    ["insurance", ["annual insurance", "hazard insurance", "insurance"]],
    ["rentPerUnit", ["rent per unit", "per unit rent", "unit rent", "rent/unit", "avg rent", "average rent"]],
    ["rent", ["monthly rent", "market rent", "estimated rent", "rent estimate", "total rent", "rent", "rental", "gross rent"]],
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

  // Columns that were mapped to a known field; everything else (non-empty) is kept as raw data.
  function extraFieldsFor(headers, cells, map) {
    const usedIdx = new Set(Object.values(map));
    const extra = {};
    for (let i = 0; i < headers.length; i++) {
      if (usedIdx.has(i)) continue;
      const key = (headers[i] || "").trim();
      const val = i < cells.length ? String(cells[i]).trim() : "";
      if (key && val) extra[key] = val;
    }
    return extra;
  }

  function csvToProperties(text, profiles, defaultType) {
    profiles = profiles || defaultProfiles();
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
      const price = num(get("price")) != null ? num(get("price")) : num(get("listPrice"));
      if (!address && !name && price == null && num(get("beds")) == null) continue;

      const p = emptyProperty();
      p.name = name;
      p.address = address;
      p.city = get("city");
      p.state = get("state");
      p.zip = get("zip");
      p.market = get("market");
      p.submarket = get("submarket");
      p.units = num(get("units"));
      p.propertyType = inferPropertyType(get("units"), get("propertyType"), defaultType || "single_family");
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
      p.extraFields = extraFieldsFor(headers, cells, map);

      const profile = profiles[profileKey(p.propertyType)] || profiles.singleFamily || DEFAULT_ASSUMPTIONS;
      const b = defaultBrrrr(price || 0, profile);
      const taxes = num(get("taxes"));
      const insurance = num(get("insurance"));
      const rent = num(get("rent"));
      const rentPerUnit = num(get("rentPerUnit"));
      const rehab = num(get("rehabEstimate"));
      const arv = num(get("arv"));
      if (taxes != null) b.taxes = taxes;
      if (insurance != null) b.insurance = insurance;
      b.monthlyRent = rent != null ? rent : (profile.defaultRent || null);
      // A per-unit rent figure switches the deal to the auto rent roll.
      if (rentPerUnit != null) { b.rentPerUnit = rentPerUnit; b.rentMode = "auto"; }
      // Rehab estimate flows into the renovation planner (so it feeds rehab) and the manual field.
      const rehabVal = rehab != null ? rehab : (profile.defaultRehab || null);
      b.rehabCosts = rehabVal;
      if (rehabVal) { const other = p.renoItems.find((it) => it.category === "Other"); if (other) { other.cost = rehabVal; other.notes = "Imported estimate"; } }
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
    return { version: 3, properties: [], assumptions: defaultProfiles(), defaultPropertyType: "single_family", compareIds: [] };
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
      s.assumptions = sanitizeAssumptions(x.assumptions);
      if (Array.isArray(x.properties)) s.properties = x.properties.map(sanitizeProperty);
      // Legacy backups carried a separate comps DB; fold any usable records into the master
      // list so nothing is lost, then comps are matched from siblings going forward.
      if (Array.isArray(x.comps)) s.properties = s.properties.concat(x.comps.map(dbCompToProperty).filter(Boolean));
      if (Array.isArray(x.compareIds)) s.compareIds = x.compareIds.filter((id) => typeof id === "string");
      if (PROPERTY_TYPES.indexOf(x.defaultPropertyType) !== -1) s.defaultPropertyType = x.defaultPropertyType;
    }
    return s;
  }

  function sanitizeProfile(x) { return Object.assign({}, DEFAULT_ASSUMPTIONS, x && typeof x === "object" ? x : {}); }

  // Accepts the new {singleFamily, multifamily} shape or migrates a legacy flat object.
  function sanitizeAssumptions(x) {
    if (!x || typeof x !== "object") return defaultProfiles();
    if (x.singleFamily || x.multifamily) {
      return { singleFamily: sanitizeProfile(x.singleFamily), multifamily: sanitizeProfile(x.multifamily || x.singleFamily) };
    }
    const flat = sanitizeProfile(x); // legacy flat assumptions → seed both profiles
    return { singleFamily: Object.assign({}, flat), multifamily: Object.assign({}, flat) };
  }

  function sanitizeProperty(x) {
    const p = emptyProperty();
    if (!x || typeof x !== "object") return p;
    const str = (v) => (typeof v === "string" ? v : "");
    p.id = str(x.id) || p.id;
    p.createdAt = num(x.createdAt) || p.createdAt;
    p.updatedAt = num(x.updatedAt) || p.updatedAt;
    p.name = str(x.name); p.address = str(x.address); p.city = str(x.city); p.state = str(x.state); p.zip = str(x.zip);
    p.market = str(x.market); p.submarket = str(x.submarket);
    p.propertyType = PROPERTY_TYPES.indexOf(x.propertyType) !== -1 ? x.propertyType : "single_family";
    p.units = num(x.units);
    p.beds = num(x.beds); p.baths = num(x.baths); p.sqft = num(x.sqft); p.lotSize = num(x.lotSize); p.yearBuilt = num(x.yearBuilt);
    p.lat = num(x.lat); p.lng = num(x.lng);
    p.listingLink = str(x.listingLink); p.photosLink = str(x.photosLink);
    p.notes = str(x.notes); p.description = str(x.description); p.renovationNotes = str(x.renovationNotes);
    p.listingStatus = str(x.listingStatus); p.soldPrice = num(x.soldPrice); p.soldDate = str(x.soldDate);
    p.queueStatus = QUEUE_STATUSES.indexOf(x.queueStatus) !== -1 ? x.queueStatus : "new";
    p.inPipeline = !!x.inPipeline;
    p.pipelineStage = PIPELINE_STAGES.some((s) => s.value === x.pipelineStage) ? x.pipelineStage : "watching";
    p.arvMode = ["manual", "conservative", "expected", "aggressive"].indexOf(x.arvMode) !== -1 ? x.arvMode : "manual";
    p.rehabMode = x.rehabMode === "manual" ? "manual" : "planner";
    p.renoItems = sanitizeRenoItems(x.renoItems);
    p.brrrr = Object.assign(defaultBrrrr(0), x.brrrr && typeof x.brrrr === "object" ? x.brrrr : {});
    if (p.brrrr.purchaseType !== "cash") p.brrrr.purchaseType = "financed";
    if (p.brrrr.rentMode !== "auto") p.brrrr.rentMode = "manual";
    // Selected comps (the only comps that feed ARV). Migrate a legacy auto-selection if present.
    if (Array.isArray(x.compIds)) p.compIds = x.compIds.filter((id) => typeof id === "string");
    else if (x.compSelections && typeof x.compSelections === "object") {
      p.compIds = ["lower", "similar", "higher"].map((k) => x.compSelections[k]).filter((id) => typeof id === "string");
    } else p.compIds = [];
    p.extraFields = x.extraFields && typeof x.extraFields === "object" ? x.extraFields : {};
    return p;
  }

  function sanitizeRenoItems(x) {
    const base = defaultRenoItems();
    if (Array.isArray(x)) {
      for (const it of x) {
        if (!it || typeof it !== "object") continue;
        const cat = typeof it.category === "string" ? it.category : "Other";
        const notes = typeof it.notes === "string" ? it.notes : "";
        const row = base.find((b) => b.category === cat);
        if (row) { row.cost = num(it.cost); row.notes = notes; }
        else base.push({ category: cat, cost: num(it.cost), notes: notes });
      }
    }
    return base;
  }

  // Migrate a legacy comps-DB record from an old backup into a master-list property.
  function dbCompToProperty(x) {
    if (!x || typeof x !== "object") return null;
    const str = (v) => (typeof v === "string" ? v : "");
    const p = emptyProperty();
    p.address = str(x.address); p.name = str(x.address);
    p.city = str(x.city); p.state = str(x.state); p.zip = str(x.zip);
    p.beds = num(x.beds); p.baths = num(x.baths); p.sqft = num(x.sqft); p.units = num(x.units);
    p.propertyType = PROPERTY_TYPES.indexOf(x.propertyType) !== -1 ? x.propertyType : inferPropertyType(x.units, "", "single_family");
    p.lat = num(x.lat); p.lng = num(x.lng);
    p.soldPrice = num(x.salePrice); p.soldDate = str(x.soldDate);
    p.listingStatus = p.soldPrice ? "Sold" : "";
    p.listingLink = str(x.link);
    p.notes = str(x.notes); p.description = str(x.description);
    if (!p.address && p.soldPrice == null && p.sqft == null) return null;
    return p;
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
    "units", "beds", "baths", "sqft", "lotSize", "yearBuilt", "lat", "lng", "soldPrice",
    "brrrr.purchasePrice", "brrrr.downPayment", "brrrr.purchaseInterestRate", "brrrr.purchaseLoanTerm",
    "brrrr.closingCosts", "brrrr.holdingCosts", "brrrr.rehabCosts", "brrrr.arv", "brrrr.refinanceLTV",
    "brrrr.newInterestRate", "brrrr.newLoanTerm", "brrrr.monthlyRent", "brrrr.rentPerUnit", "brrrr.otherIncome",
    "brrrr.taxes", "brrrr.insurance",
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
    import: { label: "Import", ico: "⤓", render: renderImport },
    properties: { label: "Properties", ico: "▤", render: renderProperties },
    analyze: { label: "Analyze", ico: "◧", render: renderAnalyzeEntry },
    compare: { label: "Compare", ico: "⇄", render: renderCompare },
    settings: { label: "Settings", ico: "⚙", render: renderSettings },
    // Kept reachable by direct hash link, hidden from the simplified sidebar:
    map: { label: "Map", ico: "◉", render: renderMap, hidden: true },
    queue: { label: "Deal Queue", ico: "≣", render: renderQueue, hidden: true },
    pipeline: { label: "Pipeline", ico: "⇶", render: renderPipeline, hidden: true },
  };

  // Only these appear in the sidebar, in this order.
  const NAV_ORDER = ["dashboard", "import", "properties", "analyze", "compare", "settings"];

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
    const navItems = NAV_ORDER.map((key) => {
      const r = ROUTES[key];
      const active = key === route || (route === "property" && key === "analyze") ? " active" : "";
      return `<button class="nav-item${active}" data-nav="${key}"><span class="nav-ico">${r.ico}</span><span class="nav-label">${r.label}</span></button>`;
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
    const all = props.map((p) => ({ p, m: metricsFor(p) }));
    const withDeal = all.filter((x) => x.m.hasDeal);
    const buy = withDeal.filter((x) => x.m.recommendation === "Buy").length;
    const caution = withDeal.filter((x) => x.m.recommendation === "Buy with Caution").length;
    const pass = withDeal.filter((x) => x.m.recommendation === "Pass").length;
    const totalCf = withDeal.reduce((a, x) => a + (isFinite(x.m.monthlyCashFlow) ? x.m.monthlyCashFlow : 0), 0);
    const avgScore = withDeal.length ? Math.round(withDeal.reduce((a, x) => a + x.m.score, 0) / withDeal.length) : 0;
    const totalEquity = withDeal.reduce((a, x) => a + (isFinite(x.m.equityCreated) ? x.m.equityCreated : 0), 0);

    const top = withDeal.slice().sort((a, b) => b.m.score - a.m.score).slice(0, 6);

    // Per-market rollup, ordered by count.
    const ms = {};
    for (const x of all) {
      const k = marketOf(x.p);
      const s = ms[k] || (ms[k] = { count: 0, buy: 0, caution: 0, pass: 0, cf: 0 });
      s.count++;
      if (x.m.hasDeal) {
        s.cf += isFinite(x.m.monthlyCashFlow) ? x.m.monthlyCashFlow : 0;
        if (x.m.recommendation === "Buy") s.buy++;
        else if (x.m.recommendation === "Buy with Caution") s.caution++;
        else s.pass++;
      }
    }
    const marketRows = Object.keys(ms).sort((a, b) => ms[b].count - ms[a].count);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Dashboard</h1><p>${props.length} propert${props.length === 1 ? "y" : "ies"} · ${withDeal.length} analyzed</p></div>
        <div class="page-actions">
          <button class="btn" data-go="import">⤓ Import CSV</button>
          <button class="btn primary" data-add="1">+ Add property</button>
        </div>
      </div>
      ${props.length === 0
        ? emptyState("🏠", "No properties yet", "Import one master CSV and every deal is scored instantly — comps are picked from the same list. Everything stays on this device.", `<button class="btn primary" data-go="import">Import CSV</button><button class="btn" data-add="1">+ Add property</button>`)
        : `
      <div class="grid cols-4 kpi-grid">
        ${stat("Properties", props.length, withDeal.length + " analyzed")}
        ${stat("Deal mix", (buy || "—"), buy + " buy · " + caution + " caution · " + pass + " pass", buy ? "good" : "")}
        ${stat("Monthly cash flow", fmtUSD(totalCf), "across analyzed deals", cfClass(totalCf))}
        ${stat("Forced equity", fmtUSD(totalEquity), "sum of created equity", totalEquity >= 0 ? "good" : "bad")}
      </div>

      <div class="grid cols-2 mt-lg dash-split">
        <div class="card">
          <h3>Top opportunities <span class="muted">— ranked by deal score</span></h3>
          ${top.length === 0 ? `<p class="faint">Add purchase price, rent and ARV to a property to see it ranked here.</p>` : `
          <table>
            <thead><tr><th>Property</th><th>Grade</th><th class="num">Cash flow/mo</th><th class="num">Score</th></tr></thead>
            <tbody>
              ${top.map(({ p, m }) => `
                <tr class="prop-row" data-open="${p.id}">
                  <td><div class="prop-name">${esc(propTitle(p))}</div><div class="prop-sub">${esc(marketOf(p))} · ${esc(cityStateZip(p) || "—")}</div></td>
                  <td><span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span></td>
                  <td class="num ${cfClass(m.monthlyCashFlow)}">${fmtUSD(m.monthlyCashFlow)}</td>
                  <td class="num">${m.score}</td>
                </tr>`).join("")}
            </tbody>
          </table>`}
        </div>

        <div class="card">
          <h3>By market <span class="muted">— click to filter</span></h3>
          <div class="market-list">
            ${marketRows.map((k) => {
              const s = ms[k];
              const seg = (n, cls) => n ? `<span class="seg ${cls}" style="flex:${n}"></span>` : "";
              return `<button class="market-row" data-marketgo="${attr(k)}">
                <div class="market-row-top"><span class="market-name">${esc(k)}</span><span class="market-count">${s.count}</span></div>
                <div class="market-bar">${seg(s.buy, "good")}${seg(s.caution, "warn")}${seg(s.pass, "bad")}${s.buy + s.caution + s.pass === 0 ? `<span class="seg muted-seg" style="flex:1"></span>` : ""}</div>
                <div class="market-row-sub">${s.buy} buy · ${s.caution} caution · ${s.pass} pass${s.cf ? " · " + fmtUSD(s.cf) + "/mo" : ""}</div>
              </button>`;
            }).join("")}
          </div>
        </div>
      </div>`}
    `;
    bindCommon(view);
    view.querySelectorAll("[data-marketgo]").forEach((b) => b.addEventListener("click", () => {
      propMarketFilter = b.dataset.marketgo; navigate("properties");
    }));
  }

  function stat(k, v, sub, cls) {
    return `<div class="stat"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }

  // Polished empty state used across views. `actions` is raw button HTML.
  function emptyState(icon, title, body, actions) {
    return `<div class="empty">
      <div class="empty-ico">${icon}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      ${actions ? `<div class="flex" style="justify-content:center;margin-top:16px">${actions}</div>` : ""}
    </div>`;
  }

  /* ===================================================================== *
   *  10. VIEW: IMPORT  (one master CSV → score everything)                 *
   * ===================================================================== */

  const MASTER_COLS_HINT = "Recognized: address, city, state, zip, market, submarket, price, list price, sold price, beds, baths, sqft, units, property type, rent, rent per unit, taxes, insurance, rehab estimate, ARV, listing link, photo link, notes, description, renovation notes, sold date, latitude, longitude.";

  // The 12 assumptions surfaced on the pre-import step (full set lives in Settings).
  const IMPORT_ASSUME_FIELDS = [
    ["defaultRehab", "Default rehab ($)", 1], ["defaultRent", "Default rent ($/mo)", 1],
    ["arvMultiplier", "ARV multiplier", 0.01], ["refiRate", "Interest rate %", 0.01],
    ["refiTermYears", "Loan term (yrs)", 1], ["refinanceLTV", "Refinance LTV %", 0.1],
    ["managementPct", "Management %", 0.1], ["vacancyPct", "Vacancy %", 0.1],
    ["maintenancePct", "Maintenance %", 0.1], ["capexPct", "CapEx %", 0.1],
    ["closingPct", "Closing %", 0.1], ["holdingPct", "Holding %", 0.1],
  ];

  let pendingSubjects = null, pendingSubjectMatch = null, pendingSubjectText = null;

  function renderImport(view) {
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Import</h1><p>Import one master CSV — or add a property by hand. Every deal is scored automatically.</p></div>
        <div class="page-actions"><button class="btn" data-add="1">+ Add manually</button></div>
      </div>

      <div class="card" id="csv-card">
        <h3>1 · Drop your property CSV</h3>
        <div class="dropzone" id="dropzone">
          <div class="dz-ico">⤓</div>
          <p style="margin:0 0 8px">Drop a CSV file here, or choose one</p>
          <input type="file" id="csv-file" accept=".csv,text/csv" style="width:auto;display:inline-block" />
          <div class="hint mt">${MASTER_COLS_HINT}</div>
          <div class="hint">Headers are matched fuzzily; unrecognized columns are kept as extra data, not discarded.</div>
        </div>
        <div id="csv-preview"></div>
      </div>

      <div class="card">
        <h3>How comps work <span class="muted">— one list, comps you choose</span></h3>
        <p class="hint" style="margin:0">Import one broad list of properties. On a property's <strong>Analyze</strong> page you pick which of your other properties to use as comps (with optional lower / similar / higher suggestions) — only the comps you select drive the ARV range. Add a <strong>sold price</strong> and <strong>sold date</strong> to rows you want treated as solid sold comps.</p>
      </div>
    `;
    bindCommon(view);
    bindCsv(view);
    if (pendingSubjects) renderSubjectPreview(view, { properties: pendingSubjects, matched: pendingSubjectMatch });
  }

  /* ===================================================================== *
   *  10c. VIEW: ANALYZE  (entry into per-property underwriting)            *
   * ===================================================================== */

  let activePropertyId = null;

  function renderAnalyzeEntry(view) {
    const props = STATE.properties;
    if (!props.length) {
      view.innerHTML = `<div class="page-head"><div><h1>Analyze</h1><p>Underwrite a single deal end to end.</p></div></div>` +
        emptyState("📊", "Nothing to analyze yet", "Import a CSV or add a property, then come back here to underwrite it.", `<button class="btn primary" data-go="import">Import CSV</button><button class="btn" data-add="1">+ Add property</button>`);
      bindCommon(view);
      return;
    }
    const valid = activePropertyId && getProperty(activePropertyId);
    const id = valid ? activePropertyId : props.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    activePropertyId = id;
    renderWorkspace(view, id, { fromAnalyze: true });
  }

  function bindCsv(view) {
    const fileInput = view.querySelector("#csv-file");
    const dz = view.querySelector("#dropzone");
    const handle = (text, fname) => {
      pendingSubjectText = text;
      const res = csvToProperties(text, STATE.assumptions, STATE.defaultPropertyType);
      pendingSubjects = res.properties; pendingSubjectMatch = res.matched;
      renderSubjectPreview(view, res, fname);
    };
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => handle(String(reader.result), f.name);
      reader.readAsText(f);
    });
    if (dz) {
      ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => handle(String(reader.result), f.name);
        reader.readAsText(f);
      });
    }
  }

  function assumeProfileCard(key, title) {
    const a = STATE.assumptions[key];
    const rows = IMPORT_ASSUME_FIELDS.map(([k, label, step]) =>
      `<div class="field"><label>${label}</label><input type="number" step="${step}" data-profile="${key}" data-key="${k}" value="${a[k]}" /></div>`
    ).join("");
    return `<div class="card" style="margin:0"><div class="comp-tag">${title}</div><div class="grid cols-2 mt">${rows}</div></div>`;
  }

  function reparseSubjects(view) {
    if (pendingSubjectText == null) return;
    const res = csvToProperties(pendingSubjectText, STATE.assumptions, STATE.defaultPropertyType);
    pendingSubjects = res.properties; pendingSubjectMatch = res.matched;
    renderSubjectPreview(view, res);
  }

  function renderSubjectPreview(view, res, fname) {
    const wrap = view.querySelector("#csv-preview");
    if (!wrap) return;
    if (!res.properties || res.properties.length === 0) {
      wrap.innerHTML = `<p class="bad mt">No rows recognized${fname ? " in " + esc(fname) : ""}. Check that the first row is a header.</p>`;
      return;
    }
    const matchedList = Object.keys(res.matched || {}).map((f) => `<span class="pill">${f} ← ${esc(res.matched[f])}</span>`).join(" ");
    const sample = res.properties.slice(0, 6);
    const mf = res.properties.filter((p) => p.propertyType === "multifamily").length;
    const sf = res.properties.length - mf;
    const byMarket = {};
    for (const p of res.properties) { const m = marketOf(p); byMarket[m] = (byMarket[m] || 0) + 1; }
    const marketChips = Object.keys(byMarket).sort((a, b) => byMarket[b] - byMarket[a])
      .map((m) => `<span class="pill">${esc(m)} · ${byMarket[m]}</span>`).join(" ");

    wrap.innerHTML = `
      <div class="divider"></div>
      <strong>${res.properties.length} properties parsed</strong> <span class="hint">· ${sf} single-family · ${mf} multifamily</span>
      <div class="hint mt">Markets: ${marketChips}</div>
      <div class="hint mt">Matched columns: ${matchedList || "none"}</div>
      <table class="mt">
        <thead><tr><th>Name</th><th>Location</th><th>Market</th><th>Type</th><th class="num">Price</th><th class="num">Bd/Ba</th><th class="num">Sqft</th><th>Geo</th></tr></thead>
        <tbody>
          ${sample.map((p) => `<tr>
            <td>${esc(propTitle(p))}</td><td>${esc(cityStateZip(p) || "—")}</td>
            <td><span class="pill">${esc(marketOf(p))}</span></td>
            <td><span class="pill">${propertyTypeLabel(p.propertyType)}</span></td>
            <td class="num">${fmtUSD(num(p.brrrr.purchasePrice))}</td>
            <td class="num">${p.beds == null ? "—" : p.beds}/${p.baths == null ? "—" : p.baths}</td>
            <td class="num">${fmtInt(p.sqft)}</td>
            <td>${p.lat != null && p.lng != null ? "✓" : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${res.properties.length > 6 ? `<p class="hint">…and ${res.properties.length - 6} more.</p>` : ""}

      <div class="divider"></div>
      <h3>3 · Confirm assumptions before scoring</h3>
      <div class="field" style="max-width:340px">
        <label>Default type when a row doesn't specify one</label>
        <div class="mode-toggle" id="default-type">
          <button data-dtype="single_family" class="${STATE.defaultPropertyType !== "multifamily" ? "active" : ""}">Single Family</button>
          <button data-dtype="multifamily" class="${STATE.defaultPropertyType === "multifamily" ? "active" : ""}">Multifamily</button>
        </div>
      </div>
      <div class="grid cols-2 mt">
        ${assumeProfileCard("singleFamily", "Single-family defaults")}
        ${assumeProfileCard("multifamily", "Multifamily defaults")}
      </div>

      <div class="flex between wrap mt-lg">
        <span class="hint">Edits here update your saved defaults and re-seed the rows above.</span>
        <div class="flex">
          <button class="btn" id="csv-cancel">Cancel</button>
          <button class="btn primary" id="csv-confirm">Import & analyze ${res.properties.length}</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll("#default-type [data-dtype]").forEach((b) => b.addEventListener("click", () => {
      STATE.defaultPropertyType = b.dataset.dtype === "multifamily" ? "multifamily" : "single_family";
      saveState(); reparseSubjects(view);
    }));
    wrap.querySelectorAll("[data-profile][data-key]").forEach((input) => input.addEventListener("input", () => {
      const v = num(input.value);
      if (v != null) { STATE.assumptions[input.dataset.profile][input.dataset.key] = v; saveState(); }
    }));
    wrap.querySelector("#csv-cancel").addEventListener("click", () => {
      pendingSubjects = null; pendingSubjectText = null; wrap.innerHTML = "";
      const f = view.querySelector("#csv-file"); if (f) f.value = "";
    });
    wrap.querySelector("#csv-confirm").addEventListener("click", () => {
      // Re-seed from raw text so the latest assumption edits are applied.
      const incoming = csvToProperties(pendingSubjectText, STATE.assumptions, STATE.defaultPropertyType).properties;
      const existing = STATE.properties;
      let added = 0, updated = 0;
      for (const np of incoming) {
        const key = importKey(np);
        const match = key ? existing.find((e) => importKey(e) === key) : null;
        if (match) { mergeProperty(match, np); updated++; }
        else { existing.unshift(np); added++; }
      }
      pendingSubjects = null; pendingSubjectText = null;
      saveState();
      toast(`Imported ${added} new, updated ${updated}.`);
      navigate("properties");
    });
  }

  /* ===================================================================== *
   *  10b. VIEW: PROPERTIES (list)                                          *
   * ===================================================================== */

  let propMarketFilter = "All";

  function renderProperties(view) {
    const props = STATE.properties;
    // Tally markets present, ordered by the canonical list then any custom labels.
    const counts = {};
    for (const p of props) { const m = marketOf(p); counts[m] = (counts[m] || 0) + 1; }
    const present = Object.keys(counts);
    const ordered = MARKETS.filter((m) => counts[m]).concat(present.filter((m) => MARKETS.indexOf(m) === -1).sort());
    if (propMarketFilter !== "All" && !counts[propMarketFilter]) propMarketFilter = "All";

    const chip = (label, count) => `<button class="chip${propMarketFilter === label ? " active" : ""}" data-market="${attr(label)}">${esc(label)}${count != null ? `<span class="chip-n">${count}</span>` : ""}</button>`;
    const filterBar = props.length
      ? `<div class="filter-bar">${chip("All", props.length)}${ordered.map((m) => chip(m, counts[m])).join("")}</div>`
      : "";

    const shown = propMarketFilter === "All" ? props : props.filter((p) => marketOf(p) === propMarketFilter);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Properties</h1><p>${props.length} saved · stored locally${propMarketFilter !== "All" ? ` · showing ${shown.length} in ${esc(propMarketFilter)}` : ""}</p></div>
        <div class="page-actions">
          <button class="btn" data-go="import">⤓ Import CSV</button>
          <button class="btn primary" data-add="1">+ Add property</button>
        </div>
      </div>
      ${filterBar}
      <div class="card">
        ${props.length === 0
          ? emptyState("📋", "No properties yet", "Import one master CSV of properties and the app scores every deal — then picks comps from the same list.", `<button class="btn primary" data-go="import">Import CSV</button><button class="btn" data-add="1">+ Add property</button>`)
          : (shown.length === 0 ? `<p class="faint">No properties in ${esc(propMarketFilter)}.</p>` : `
        <table>
          <thead><tr><th>Property</th><th>Market</th><th>Type</th><th>Reno</th><th>Grade</th><th class="num">Price</th><th class="num">Cash flow</th><th></th></tr></thead>
          <tbody>
            ${shown.map((p) => {
              const m = metricsFor(p); const reno = detectRenovation(p);
              return `<tr class="prop-row" data-open="${p.id}">
                <td><div class="prop-name">${esc(propTitle(p))}</div><div class="prop-sub">${esc(cityStateZip(p) || "—")}</div></td>
                <td><span class="pill">${esc(marketOf(p))}</span></td>
                <td><span class="pill">${propertyTypeLabel(p.propertyType)}${p.units > 1 ? " · " + p.units + "u" : ""}</span></td>
                <td><span class="badge ${renoBadgeClass(reno.condition)}">${reno.condition}</span></td>
                <td>${m.hasDeal ? `<span class="badge grade ${gradeClass(m.grade)}">${m.grade}</span>` : `<span class="faint">—</span>`}</td>
                <td class="num">${fmtUSD(num(p.brrrr.purchasePrice))}</td>
                <td class="num ${m.hasDeal ? cfClass(m.monthlyCashFlow) : ""}">${m.hasDeal ? fmtUSD(m.monthlyCashFlow) : "—"}</td>
                <td class="right"><button class="btn sm danger" data-del="${p.id}">Delete</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`)}
      </div>
    `;
    bindCommon(view);
    view.querySelectorAll("[data-market]").forEach((b) => b.addEventListener("click", () => {
      propMarketFilter = b.dataset.market; renderProperties(view);
    }));
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

  function importKey(p) {
    const link = (p.listingLink || "").trim().toLowerCase().replace(/[#?].*$/, "").replace(/\/+$/, "");
    if (link) return link;
    return [p.address, p.city, p.state, p.zip].map((s) => normKey(s)).filter(Boolean).join(" ");
  }

  // Fill only fields the incoming row provides; keep manual edits otherwise.
  function mergeProperty(dst, src) {
    const fields = ["name", "address", "city", "state", "zip", "market", "submarket", "propertyType", "listingLink", "photosLink", "notes", "description", "renovationNotes", "listingStatus", "soldDate"];
    for (const f of fields) if (src[f]) dst[f] = src[f];
    ["units", "beds", "baths", "sqft", "lotSize", "yearBuilt", "lat", "lng", "soldPrice"].forEach((f) => { if (src[f] != null) dst[f] = src[f]; });
    ["purchasePrice", "taxes", "insurance", "monthlyRent", "rehabCosts", "arv"].forEach((f) => { if (src.brrrr[f] != null) dst.brrrr[f] = src.brrrr[f]; });
    if (src.extraFields) dst.extraFields = Object.assign({}, dst.extraFields, src.extraFields);
    touch(dst);
  }

  /* ===================================================================== *
   *  11. VIEW: PROPERTY WORKSPACE                                          *
   * ===================================================================== */

  function renderWorkspace(view, id, opts) {
    opts = opts || {};
    const p = getProperty(id);
    if (!p) { view.innerHTML = `<div class="empty">Property not found. <a href="#/properties">Back to list</a></div>`; return; }
    activePropertyId = p.id;

    // From the Analyze tab: a property switcher; otherwise a back-to-list link.
    const lead = opts.fromAnalyze
      ? `<div class="ws-switch"><span class="comp-tag">Analyzing</span>
          <select id="ws-switch">${STATE.properties.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((q) => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${esc(propTitle(q))}${q.city ? " — " + esc(q.city) : ""}</option>`).join("")}</select>
        </div>`
      : `<button class="btn ghost sm" data-go="properties">← Properties</button>`;

    view.innerHTML = `
      <div class="page-head">
        <div>
          ${lead}
          <h1 style="margin-top:8px" id="ws-title">${esc(propTitle(p))}</h1>
          <p id="ws-sub">${esc([propertyTypeLabel(p.propertyType), marketOf(p), cityStateZip(p)].filter(Boolean).join(" · ") || "Add an address below")}</p>
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
    const sw = document.getElementById("ws-switch");
    if (sw) sw.addEventListener("change", () => { activePropertyId = sw.value; render(); });
  }

  function renderHeadActions(p) {
    const el = document.getElementById("ws-head-actions");
    if (!el) return;
    const inCompare = STATE.compareIds.indexOf(p.id) !== -1;
    el.innerHTML = `
      <button class="btn ${inCompare ? "primary" : ""}" data-compare="1">${inCompare ? "✓ Comparing" : "+ Compare"}</button>
    `;
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
        <div class="field-row">
          ${field("Market", "market", p.market, { ph: inferMarket(p.city) || "Other" })}
          ${field("Submarket", "submarket", p.submarket, { ph: "Neighborhood / area" })}
        </div>
        <div class="field-row">
          <div class="field">
            <label>Property type</label>
            <div class="mode-toggle" data-toggle="propertyType">
              <button data-val="single_family" class="${p.propertyType !== "multifamily" ? "active" : ""}">Single Family</button>
              <button data-val="multifamily" class="${p.propertyType === "multifamily" ? "active" : ""}">Multifamily</button>
            </div>
          </div>
          ${field("Units", "units", p.units)}
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
          ${field(p.propertyType === "multifamily" ? "Total purchase price ($)" : "Purchase price ($)", "brrrr.purchasePrice", b.purchasePrice)}
          ${field("Down payment ($)", "brrrr.downPayment", b.downPayment)}
        </div>
        <div class="field-row three">
          ${field("Purchase rate %", "brrrr.purchaseInterestRate", b.purchaseInterestRate, { step: "0.01" })}
          ${field("Term (yrs)", "brrrr.purchaseLoanTerm", b.purchaseLoanTerm)}
          ${field("Closing ($)", "brrrr.closingCosts", b.closingCosts)}
        </div>
        ${field("Holding costs ($)", "brrrr.holdingCosts", b.holdingCosts)}
      </div>

      <div class="section-title">Renovation planner</div>
      <div class="card" id="reno-card">${renoSection(p)}</div>

      <div class="section-title">Phase 2 — Refinance &amp; ARV</div>
      <div class="card" id="arv-card">${arvSection(p)}</div>

      <div class="section-title">Phase 3 — Rental income</div>
      <div class="card">
        <div id="rent-block">${rentSection(p)}</div>
        <div class="divider"></div>
        <div class="field-row">
          ${field("Annual taxes ($)", "brrrr.taxes", b.taxes)}
          ${field("Annual insurance ($)", "brrrr.insurance", b.insurance)}
        </div>
        <div class="field-row three">
          ${field("Mgmt %", "brrrr.management", b.management, { step: "0.1" })}
          ${field("Vacancy %", "brrrr.vacancy", b.vacancy, { step: "0.1" })}
          ${field("Maint %", "brrrr.maintenance", b.maintenance, { step: "0.1" })}
        </div>
        <div class="field-row three">
          ${field("CapEx %", "brrrr.capexReserve", b.capexReserve, { step: "0.1" })}
          ${field("HOA ($/mo)", "brrrr.hoa", b.hoa)}
          ${field("Utilities ($/mo)", "brrrr.utilities", b.utilities)}
        </div>
      </div>

      <div class="section-title">Sold (for use as a comp)</div>
      <div class="card">
        <div class="field-row">
          ${field("Sold price ($)", "soldPrice", p.soldPrice)}
          ${field("Sold date", "soldDate", p.soldDate, { type: "date" })}
        </div>
        <div class="hint">A sold price + sqft makes this property a strong comp for your other deals.</div>
      </div>
    `;
  }

  // Phase 3 rent: per-unit rent roll (auto total) or a manual total.
  function rentSection(p) {
    const b = p.brrrr;
    const auto = b.rentMode === "auto";
    const units = Math.max(1, num(p.units) || 1);
    const total = totalRentRoll(p);
    return `
      <div class="flex between wrap">
        <label style="margin:0">Rent input</label>
        <div class="mode-toggle" data-renttoggle>
          <button data-val="auto" class="${auto ? "active" : ""}">Per-unit rent roll</button>
          <button data-val="manual" class="${auto ? "" : "active"}">Manual total</button>
        </div>
      </div>
      ${auto ? `
        <div class="hint mt">Using <strong>${units}</strong> unit${units === 1 ? "" : "s"} from Property details above.</div>
        <div class="field-row mt">
          ${field("Rent / unit ($/mo)", "brrrr.rentPerUnit", b.rentPerUnit)}
          ${field("Other income ($/mo)", "brrrr.otherIncome", b.otherIncome)}
        </div>
        <div class="kv"><span class="k">Total monthly rent</span><span class="v" id="rent-total">${fmtUSD(total)}</span></div>
      ` : `
        <div class="field mt">${field("Total monthly rent ($)", "brrrr.monthlyRent", b.monthlyRent)}</div>
        <div class="kv"><span class="k">Used in analysis</span><span class="v" id="rent-total">${fmtUSD(effectiveRent(p))}</span></div>
      `}
    `;
  }

  // Renovation planner: line items feed the rehab cost unless a manual override is set.
  function renoSection(p) {
    const manual = p.rehabMode === "manual";
    const total = renoTotal(p);
    const rows = (p.renoItems || []).map((it, i) => `
      <div class="reno-row">
        <span class="reno-cat">${esc(it.category)}</span>
        <input type="number" step="1" data-reno="${i}" data-renofield="cost" value="${it.cost == null ? "" : it.cost}" placeholder="0" />
        <input type="text" data-reno="${i}" data-renofield="notes" value="${attr(it.notes)}" placeholder="notes" />
      </div>`).join("");
    return `
      <div class="flex between wrap">
        <label style="margin:0">Rehab source</label>
        <div class="mode-toggle" data-rehabtoggle>
          <button data-val="planner" class="${manual ? "" : "active"}">Planner total</button>
          <button data-val="manual" class="${manual ? "active" : ""}">Manual override</button>
        </div>
      </div>
      ${manual ? `
        <div class="field mt">${field("Rehab costs — total ($)", "brrrr.rehabCosts", p.brrrr.rehabCosts)}</div>
        <div class="hint">Planner total (${fmtUSD(total)}) is ignored while manual override is on.</div>
      ` : `
        <div class="reno-list mt">
          <div class="reno-row reno-head"><span class="reno-cat">Item</span><span>Cost</span><span>Notes</span></div>
          ${rows}
        </div>
        <div class="kv mt"><span class="k">Total renovation estimate</span><span class="v" id="reno-total">${fmtUSD(total)}</span></div>
        <div class="hint">This total feeds the BRRRR rehab cost.</div>
      `}
    `;
  }

  function arvSection(p) {
    const b = p.brrrr;
    const range = computeArvRange(p);
    const opt = (val, label, arv) => `<button class="btn sm ${p.arvMode === val ? "primary" : ""}" data-arvmode="${val}" ${arv ? "" : "disabled"}>${label}${arv ? ` · ${fmtUSD(arv)}` : ""}</button>`;
    return `
      <div class="field-row three">
        ${field(p.propertyType === "multifamily" ? "Manual total ARV ($)" : "Manual ARV ($)", "brrrr.arv", b.arv)}
        ${field("Refinance LTV %", "brrrr.refinanceLTV", b.refinanceLTV, { step: "0.1" })}
        ${field("Refinance rate %", "brrrr.newInterestRate", b.newInterestRate, { step: "0.01" })}
      </div>
      ${field("Loan term (yrs)", "brrrr.newLoanTerm", b.newLoanTerm)}
      <div class="divider"></div>
      <label>ARV source feeding the calculator</label>
      <div class="flex wrap" data-arvmodes>
        ${opt("manual", "Manual", num(b.arv))}
        ${opt("conservative", "Conservative", range.conservative)}
        ${opt("expected", "Expected", range.expected)}
        ${opt("aggressive", "Aggressive", range.aggressive)}
      </div>
      ${range.count > 0 ? `<div class="hint mt">Range from ${range.count} selected comp${range.count === 1 ? "" : "s"} · confidence ${range.confidence} · $${fmtInt(range.ppsfLow)}–$${fmtInt(range.ppsfHigh)}/sqft</div>` : `<div class="hint mt">Select comps in the “ARV &amp; comps” panel to unlock Conservative / Expected / Aggressive ARV.</div>`}
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
          <div class="kv"><span class="k">Total project cost</span><span class="v">${fmtUSD(r.totalProjectCost)}</span></div>
          <div class="kv"><span class="k">Cash invested</span><span class="v">${fmtUSD(r.cashInvested)}</span></div>
          <div class="kv"><span class="k">Forced equity</span><span class="v">${fmtUSD(r.equityCreated)}</span></div>
          <div class="kv"><span class="k">Monthly rent used</span><span class="v">${fmtUSD(m.inputs.monthlyRent)}/mo</span></div>
          <div class="kv"><span class="k">Break-even rent</span><span class="v">${fmtUSD(r.breakEvenRent)}</span></div>
        </div>`}
      </div>
      ${m.hasDeal ? refinanceCard(p, m) : ""}
      ${m.hasDeal ? findingsCard(m.s) : ""}
      ${m.hasDeal ? compsCard(p) : ""}
      ${m.hasDeal ? sensitivityCard(m.inputs) : ""}
    `;
  }

  // Refinance-after-repair breakdown — applies to single-family and multifamily alike.
  function refinanceCard(p, m) {
    const r = m.r;
    const inp = m.inputs;
    return `<div class="card">
      <h3>Refinance after repair <span class="muted">— ARV source: ${p.arvMode}</span></h3>
      <div class="kv"><span class="k">After Repair Value</span><span class="v">${fmtUSD(m.arv)}</span></div>
      <div class="kv"><span class="k">Refinance LTV</span><span class="v">${fmtPct(inp.refinanceLTV)}</span></div>
      <div class="kv"><span class="k">Refinance interest rate</span><span class="v">${fmtPct(inp.newInterestRate, 2)}</span></div>
      <div class="kv"><span class="k">Loan term</span><span class="v">${fmtInt(inp.newLoanTerm)} yrs</span></div>
      <div class="kv"><span class="k">Refinance amount</span><span class="v">${fmtUSD(r.refinanceAmount)}</span></div>
      <div class="kv"><span class="k">Original loan payoff</span><span class="v">${fmtUSD(r.originalLoanPayoff)}</span></div>
      <div class="kv"><span class="k">Cash recovered</span><span class="v good">${fmtUSD(r.capitalRecovered)}</span></div>
      <div class="kv"><span class="k">Cash left in deal</span><span class="v ${r.cashLeftInDeal > 0 ? "warn" : "good"}">${fmtUSD(r.cashLeftInDeal)}</span></div>
      <div class="kv"><span class="k">Cash-out surplus</span><span class="v ${r.cashOutSurplus > 0 ? "good" : ""}">${fmtUSD(r.cashOutSurplus)}</span></div>
      <div class="kv"><span class="k">New monthly mortgage</span><span class="v">${fmtUSD(r.newMonthlyPayment)}/mo</span></div>
    </div>`;
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

  /* -------------------------- comp selection UI ------------------------- */
  let compFilterText = "", compFilterType = "all", compFilterMarket = "all";

  function compFilterPass(x) {
    if (compFilterType !== "all" && (x.c.propertyType || "single_family") !== compFilterType) return false;
    if (compFilterMarket !== "all" && marketOf(x.c) !== compFilterMarket) return false;
    if (compFilterText) {
      const hay = [propTitle(x.c), x.c.address, x.c.city, x.c.zip, marketOf(x.c)].join(" ").toLowerCase();
      if (hay.indexOf(compFilterText.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function filteredCandidates(p) {
    const selSet = new Set((p.compIds || []).filter((id) => getProperty(id)));
    return compCandidates(p).filter((x) => !selSet.has(x.c.id) && compFilterPass(x)).slice(0, 40);
  }
  function pickerRowHtml(x) {
    const c = x.c;
    const sub = [marketOf(c), cityStateZip(c) || "—", propertyTypeLabel(c.propertyType) + (c.units > 1 ? " " + c.units + "u" : ""),
      (c.beds == null ? "—" : c.beds) + "bd/" + (c.baths == null ? "—" : c.baths) + "ba", fmtInt(x.sqft) + " sqft",
      (x.sold ? "sold " : "") + fmtUSD(x.value), x.condition].join(" · ");
    return `<div class="picker-row">
      <div class="picker-main"><div class="prop-name">${esc(propTitle(c))}</div><div class="prop-sub">${esc(sub)}</div></div>
      <span class="pill">match ${x.score}</span>
      <button class="btn sm primary" data-addcomp="${c.id}">Add</button>
    </div>`;
  }

  function compsCard(p) {
    const sqft = num(p.sqft);
    const range = computeArvRange(p);
    const candidates = compCandidates(p);
    const candCount = candidates.length;
    const selectedIds = (p.compIds || []).filter((id) => getProperty(id));
    const selected = selectedCompList(p); // sorted by implied value (low → high)
    const n = selected.length;
    const replaceOptions = (currentId) => candidates.map((o) =>
      `<option value="${o.c.id}" ${o.c.id === currentId ? "selected" : ""}>${esc(propTitle(o.c))} · ${fmtUSD(o.value)} · match ${o.score}</option>`).join("");

    const selCard = (x, i) => {
      const c = x.c;
      const bracket = n <= 1 ? "similar" : i === 0 ? "lower" : i === n - 1 ? "higher" : "similar";
      const label = n <= 1 ? "comp" : bracket + " comp";
      return `<div class="comp-card ${bracket}">
        <div class="flex between"><span class="comp-tag">${label}</span><span class="pill">match ${x.score}</span></div>
        <div class="prop-name mt">${esc(propTitle(c))}</div>
        <div class="prop-sub">${esc(c.address || cityStateZip(c) || "—")}</div>
        <div class="comp-facts mt">
          <span class="pill">${esc(marketOf(c))}</span>
          <span class="pill">${propertyTypeLabel(c.propertyType)}${c.units > 1 ? " · " + c.units + "u" : ""}</span>
          <span class="badge ${renoBadgeClass(x.condition)}">${x.condition}</span>
        </div>
        <div class="grid cols-2 mt">
          ${miniStat(x.sold ? "Sold price" : "List / value", fmtUSD(x.value))}
          ${miniStat("$/sqft", "$" + fmtInt(x.ppsf))}
        </div>
        <div class="hint mt">${esc(cityStateZip(c) || "—")} · ${c.beds == null ? "—" : c.beds}bd/${c.baths == null ? "—" : c.baths}ba · ${fmtInt(x.sqft)} sqft${x.dist != null ? " · " + x.dist.toFixed(1) + " mi" : ""}${c.soldDate ? " · sold " + esc(c.soldDate) : ""}</div>
        ${sqft ? `<div class="hint">Implies ARV ≈ ${fmtUSD(x.impliedARV)}</div>` : ""}
        <div class="comp-why">Why: ${esc(x.why.join(" · ") || "selected comp")}</div>
        <label class="comp-swap mt"><span>Replace</span><select data-replacecomp="${c.id}">${replaceOptions(c.id)}</select></label>
        <div class="comp-actions mt">
          <button class="btn sm danger" data-removecomp="${c.id}">Remove</button>
          ${c.listingLink ? `<a class="btn sm" href="${attr(c.listingLink)}" target="_blank" rel="noopener">Link ↗</a>` : ""}
          ${c.photosLink ? `<a class="btn sm" href="${attr(c.photosLink)}" target="_blank" rel="noopener">Photo ↗</a>` : ""}
          <button class="btn sm ghost" data-opencomp="${c.id}">Open</button>
        </div>
      </div>`;
    };

    const marketOptions = ["all"].concat(Array.from(new Set(candidates.map((x) => marketOf(x.c)))))
      .map((m) => `<option value="${attr(m)}" ${compFilterMarket === m ? "selected" : ""}>${m === "all" ? "All markets" : esc(m)}</option>`).join("");
    const filtered = filteredCandidates(p);

    return `<div class="card" id="comps-card">
      <div class="flex between wrap">
        <h3 style="margin:0">ARV &amp; comps <span class="muted">— ${selectedIds.length} selected · ${candCount} available</span></h3>
        ${candCount ? `<button class="btn sm" data-suggest3="1">✨ Suggest 3</button>` : ""}
      </div>
      ${!sqft ? `<p class="warn mt">Add the subject's square footage to compute comp-based ARV.</p>` : ""}
      ${range.count > 0 ? `<div class="grid cols-3 mb mt">
        ${stat("Conservative", fmtUSD(range.conservative), "lowest comp")}
        ${stat("Expected", fmtUSD(range.expected), "confidence " + range.confidence)}
        ${stat("Aggressive", fmtUSD(range.aggressive), "highest comp")}
      </div>` : ""}

      <div class="comp-tag mt">Selected comps — only these drive the ARV</div>
      ${n === 0
        ? `<p class="faint mt">No comps selected. ${candCount ? `Use <strong>Suggest 3</strong> or add from your properties below.` : `<a href="#/import">Import more properties</a> (each comp needs a value + sqft) to choose comps.`}</p>`
        : `<div class="grid cols-3 mt">${selected.map(selCard).join("")}</div>`}

      ${candCount ? `
      <div class="divider"></div>
      <div class="comp-tag">Add comps from your properties</div>
      <div class="comp-filters mt">
        <input type="text" id="comp-search" placeholder="Search address, city, ZIP, market…" value="${attr(compFilterText)}" />
        <select id="comp-type">
          <option value="all" ${compFilterType === "all" ? "selected" : ""}>All types</option>
          <option value="single_family" ${compFilterType === "single_family" ? "selected" : ""}>Single Family</option>
          <option value="multifamily" ${compFilterType === "multifamily" ? "selected" : ""}>Multifamily</option>
        </select>
        <select id="comp-market">${marketOptions}</select>
      </div>
      <div class="picker-list mt" id="comp-picker-list">
        ${filtered.length ? filtered.map(pickerRowHtml).join("") : `<p class="faint">No candidates match the filter.</p>`}
      </div>` : ""}
    </div>`;
  }

  /* ----------------------------- workspace binders ---------------------- */
  function rerenderResults(view, p) {
    const results = document.getElementById("ws-results");
    if (results) { results.innerHTML = workspaceResults(p); bindResults(view, p); }
  }
  function rerenderComps(view, p) {
    rerenderResults(view, p);
    const arvCard = document.getElementById("arv-card");
    if (arvCard) { arvCard.innerHTML = arvSection(p); bindArvCard(view, p); }
  }
  function refreshHeader(p) {
    const title = document.getElementById("ws-title");
    const sub = document.getElementById("ws-sub");
    if (title) title.textContent = propTitle(p);
    if (sub) sub.textContent = [propertyTypeLabel(p.propertyType), marketOf(p), cityStateZip(p)].filter(Boolean).join(" · ") || "Add an address below";
  }
  function refreshFormTotals(p) {
    const rt = document.getElementById("rent-total");
    if (rt) rt.textContent = p.brrrr.rentMode === "auto" ? fmtUSD(totalRentRoll(p)) : fmtUSD(effectiveRent(p));
    const nt = document.getElementById("reno-total");
    if (nt) nt.textContent = fmtUSD(renoTotal(p));
  }

  // Shared [data-field] input binder.
  function bindFieldInput(input, view, p) {
    const path = input.dataset.field;
    input.addEventListener("input", () => {
      let val = input.value;
      if (NUMERIC_FIELDS.has(path) && input.type === "number") val = input.value === "" ? null : num(input.value);
      setPath(p, path, val);
      touch(p); saveState();
      if (path === "notes" || path === "description" || path === "renovationNotes") refreshRenoLine(p);
      rerenderResults(view, p);
      refreshHeader(p);
      refreshFormTotals(p);
    });
  }

  function bindWorkspace(view, p) {
    // Generic fields, except those owned by the self-re-rendering sub-cards.
    view.querySelectorAll("[data-field]").forEach((input) => {
      if (input.closest("#arv-card, #rent-block, #reno-card")) return;
      bindFieldInput(input, view, p);
    });
    view.querySelectorAll("[data-toggle]").forEach((tg) => {
      tg.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
        setPath(p, tg.dataset.toggle, btn.dataset.val);
        tg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        touch(p); saveState();
        rerenderResults(view, p); refreshHeader(p);
        // Property type can change MF labels in sub-cards.
        rerenderRentBlock(view, p); rerenderRenoCard(view, p);
        const arvCard = document.getElementById("arv-card");
        if (arvCard) { arvCard.innerHTML = arvSection(p); bindArvCard(view, p); }
      }));
    });
    bindArvCard(view, p);
    bindRentBlock(view, p);
    bindRenoCard(view, p);
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

  function bindArvCard(view, p) {
    const card = document.getElementById("arv-card");
    if (!card) return;
    card.querySelectorAll("[data-field]").forEach((input) => bindFieldInput(input, view, p));
  }

  function rerenderRentBlock(view, p) {
    const block = document.getElementById("rent-block");
    if (block) { block.innerHTML = rentSection(p); bindRentBlock(view, p); }
  }
  function bindRentBlock(view, p) {
    const block = document.getElementById("rent-block");
    if (!block) return;
    block.querySelectorAll("[data-renttoggle] button").forEach((btn) => btn.addEventListener("click", () => {
      p.brrrr.rentMode = btn.dataset.val === "auto" ? "auto" : "manual";
      touch(p); saveState();
      rerenderRentBlock(view, p); rerenderResults(view, p);
    }));
    block.querySelectorAll("[data-field]").forEach((input) => bindFieldInput(input, view, p));
  }

  function rerenderRenoCard(view, p) {
    const card = document.getElementById("reno-card");
    if (card) { card.innerHTML = renoSection(p); bindRenoCard(view, p); }
  }
  function bindRenoCard(view, p) {
    const card = document.getElementById("reno-card");
    if (!card) return;
    card.querySelectorAll("[data-rehabtoggle] button").forEach((btn) => btn.addEventListener("click", () => {
      p.rehabMode = btn.dataset.val === "manual" ? "manual" : "planner";
      touch(p); saveState();
      rerenderRenoCard(view, p); rerenderResults(view, p);
    }));
    card.querySelectorAll("[data-reno]").forEach((input) => input.addEventListener("input", () => {
      const i = +input.dataset.reno, f = input.dataset.renofield;
      if (!p.renoItems[i]) return;
      p.renoItems[i][f] = f === "cost" ? (input.value === "" ? null : num(input.value)) : input.value;
      touch(p); saveState();
      const nt = document.getElementById("reno-total"); if (nt) nt.textContent = fmtUSD(renoTotal(p));
      rerenderResults(view, p);
    }));
    card.querySelectorAll("[data-field]").forEach((input) => bindFieldInput(input, view, p));
  }

  function refreshPickerList(view, p) {
    const list = document.getElementById("comp-picker-list");
    if (!list) return;
    const filtered = filteredCandidates(p);
    list.innerHTML = filtered.length ? filtered.map(pickerRowHtml).join("") : `<p class="faint">No candidates match the filter.</p>`;
    list.querySelectorAll("[data-addcomp]").forEach((b) => b.addEventListener("click", () => addComp(view, p, b.dataset.addcomp)));
  }

  function addComp(view, p, id) {
    if (!getProperty(id)) return;
    p.compIds = p.compIds || [];
    if (p.compIds.indexOf(id) === -1) p.compIds.push(id);
    touch(p); saveState(); rerenderComps(view, p);
  }

  // (Re)bind handlers inside the results column: ARV source + comp selection.
  function bindResults(view, p) {
    document.querySelectorAll("[data-arvmode]").forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      p.arvMode = b.dataset.arvmode; touch(p); saveState(); rerenderComps(view, p);
    }));
    document.querySelectorAll("[data-suggest3]").forEach((b) => b.addEventListener("click", () => {
      p.compIds = suggestThree(p).map((x) => x.c.id);
      touch(p); saveState(); rerenderComps(view, p);
    }));
    document.querySelectorAll("[data-addcomp]").forEach((b) => b.addEventListener("click", () => addComp(view, p, b.dataset.addcomp)));
    document.querySelectorAll("[data-removecomp]").forEach((b) => b.addEventListener("click", () => {
      p.compIds = (p.compIds || []).filter((id) => id !== b.dataset.removecomp);
      touch(p); saveState(); rerenderComps(view, p);
    }));
    document.querySelectorAll("[data-replacecomp]").forEach((box) => box.addEventListener("change", () => {
      const oldId = box.dataset.replacecomp, newId = box.value;
      if (!newId || newId === oldId) return;
      p.compIds = (p.compIds || []).map((id) => (id === oldId ? newId : id)).filter((id, i, a) => a.indexOf(id) === i);
      touch(p); saveState(); rerenderComps(view, p);
    }));
    document.querySelectorAll("[data-opencomp]").forEach((b) => b.addEventListener("click", () => navigate("property/" + b.dataset.opencomp)));

    const search = document.getElementById("comp-search");
    if (search) search.addEventListener("input", () => { compFilterText = search.value; refreshPickerList(view, p); });
    const typeSel = document.getElementById("comp-type");
    if (typeSel) typeSel.addEventListener("change", () => { compFilterType = typeSel.value; refreshPickerList(view, p); });
    const mktSel = document.getElementById("comp-market");
    if (mktSel) mktSel.addEventListener("change", () => { compFilterMarket = mktSel.value; refreshPickerList(view, p); });
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

  const SETTINGS_ASSUME_FIELDS = [
    ["downPaymentPct", "Down payment %", 0.1], ["purchaseRate", "Purchase rate %", 0.01],
    ["purchaseTermYears", "Purchase term", 1], ["closingPct", "Closing %", 0.1],
    ["holdingPct", "Holding %", 0.1], ["refinanceLTV", "Refi LTV %", 0.1],
    ["refiRate", "Refi rate %", 0.01], ["refiTermYears", "Refi term", 1],
    ["taxRatePct", "Tax rate %", 0.01], ["insuranceAnnual", "Insurance $/yr", 1],
    ["managementPct", "Mgmt %", 0.1], ["vacancyPct", "Vacancy %", 0.1],
    ["maintenancePct", "Maint %", 0.1], ["capexPct", "CapEx %", 0.1],
    ["arvMultiplier", "ARV multiplier", 0.01], ["defaultRehab", "Default rehab $", 1],
    ["defaultRent", "Default rent $/mo", 1],
  ];

  function settingsProfileCard(key, title) {
    const a = STATE.assumptions[key];
    const rows = SETTINGS_ASSUME_FIELDS.map(([k, label, step]) =>
      `<div class="field"><label>${label}</label><input type="number" step="${step}" data-profile="${key}" data-key="${k}" value="${a[k]}" /></div>`
    ).join("");
    return `<div class="card" style="margin:0"><h3 style="margin-top:0">${title}</h3><div class="grid cols-3">${rows}</div></div>`;
  }

  function renderSettings(view) {
    view.innerHTML = `
      <div class="page-head"><div><h1>Settings</h1><p>Defaults & local backup</p></div></div>

      <div class="card">
        <h3>Backup <span class="muted">— everything lives in this browser only</span></h3>
        <p class="hint">Export a JSON snapshot of every property and setting. Import restores or merges a snapshot on this or another device.</p>
        <div class="flex wrap mt">
          <button class="btn primary" id="backup-export">⤓ Export Backup</button>
          <button class="btn" id="backup-import">⤒ Import Backup</button>
          <input type="file" id="backup-file" accept=".json,application/json" style="display:none" />
          <button class="btn danger" id="wipe">Clear all data</button>
        </div>
      </div>

      <div class="card">
        <h3>Default assumptions <span class="muted">— separate profiles seed new & imported properties</span></h3>
        <div class="grid cols-2 mt">
          ${settingsProfileCard("singleFamily", "Single Family")}
          ${settingsProfileCard("multifamily", "Multifamily")}
        </div>
        <p class="hint mt">These seed new & imported properties only — they don't change properties you've already saved.</p>
      </div>

      <div class="card">
        <h3>Sample data</h3>
        <p class="hint">Load a few example properties — active deals plus recent sold comps in the same market — to explore the tool.</p>
        <button class="btn mt" id="seed">Load sample data</button>
      </div>
    `;
    bindCommon(view);

    view.querySelectorAll("[data-profile][data-key]").forEach((input) => input.addEventListener("input", () => {
      const v = num(input.value);
      if (v != null) { STATE.assumptions[input.dataset.profile][input.dataset.key] = v; saveState(); }
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
      seedSamples(); saveState(); toast("Sample data added."); navigate("properties");
    });
  }

  function seedSamples() {
    // One master list: a few active deals + recent sold comps in the same DFW market.
    const base = { city: "Sherman", state: "TX", zip: "75090", market: "DFW" };
    const mk = (o) => {
      const p = emptyProperty();
      Object.assign(p, base, o.top || {});
      p.propertyType = o.type || "single_family";
      p.brrrr = defaultBrrrr(o.price || 0, assumptionsForType(p.propertyType));
      if (o.rent != null) p.brrrr.monthlyRent = o.rent;
      if (o.rehab != null) {
        p.brrrr.rehabCosts = o.rehab;
        const other = p.renoItems.find((it) => it.category === "Other");
        if (other) { other.cost = o.rehab; other.notes = "Estimate"; }
      }
      if (o.arv != null) p.brrrr.arv = o.arv;
      if (o.soldPrice != null) { p.soldPrice = o.soldPrice; p.soldDate = o.soldDate || ""; p.listingStatus = "Sold"; }
      return p;
    };
    const subjects = [
      mk({ top: { name: "Maple St Rental", address: "742 Maple St", beds: 3, baths: 2, sqft: 1450, lat: 33.6357, lng: -96.6089, listingStatus: "Active", description: "Fully renovated, new kitchen and new flooring throughout. Turnkey.", listingLink: "https://example.com/maple" }, price: 165000, rent: 1850, rehab: 25000, arv: 230000 }),
      mk({ top: { name: "Oak Ave Fixer", address: "318 Oak Ave", beds: 3, baths: 1, sqft: 1280, lat: 33.642, lng: -96.62, listingStatus: "Active", description: "Investor special, dated, needs work. Bring your contractor — value-add." }, price: 119000, rent: 1500, rehab: 45000 }),
      mk({ type: "multifamily", top: { name: "Cedar Duplex", address: "55 Cedar St", units: 2, beds: 4, baths: 2, sqft: 2200, lat: 33.638, lng: -96.611, listingStatus: "Active", description: "Side-by-side duplex, both units updated, long-term tenants." }, price: 240000, rehab: 20000 }),
    ];
    // Showcase the per-unit rent roll on the multifamily deal.
    subjects[2].brrrr.rentMode = "auto"; subjects[2].brrrr.rentPerUnit = 1450;
    const comps = [
      mk({ top: { name: "905 Pine Rd", address: "905 Pine Rd", beds: 3, baths: 2, sqft: 1500, lat: 33.63, lng: -96.6, description: "Remodeled, updated throughout." }, soldPrice: 228000, soldDate: "2026-03-12" }),
      mk({ top: { name: "212 Elm St", address: "212 Elm St", beds: 3, baths: 2, sqft: 1380, lat: 33.628, lng: -96.615, description: "Original condition, dated." }, soldPrice: 199000, soldDate: "2026-02-02" }),
      mk({ top: { name: "640 Birch Ln", address: "640 Birch Ln", beds: 3, baths: 2, sqft: 1420, lat: 33.634, lng: -96.605, description: "Move-in ready, new paint and flooring." }, soldPrice: 215000, soldDate: "2026-04-01" }),
      mk({ type: "multifamily", top: { name: "88 Cedar Ct", address: "88 Cedar Ct", units: 2, beds: 4, baths: 2, sqft: 2150, lat: 33.639, lng: -96.612, description: "Updated duplex, both units renovated." }, soldPrice: 305000, soldDate: "2026-03-20" }),
    ];
    const rows = subjects.concat(comps);
    for (let i = rows.length - 1; i >= 0; i--) STATE.properties.unshift(rows[i]);
    // Pre-select suggested comps for the active deals so ARV ranges show immediately.
    for (const s of subjects) s.compIds = suggestThree(s).map((x) => x.c.id);
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
