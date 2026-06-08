"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyze,
  analyzeComps,
  assumptionWarnings,
  compareArv,
  CONSERVATIVE_TIP,
  defaultInputs,
  fmtNum,
  fmtPct,
  fmtUSD,
  MAX_COMPS,
  sensitivity,
  summarize,
  type Comp,
  type CostMode,
  type Inputs,
  type Level,
  type PurchaseType,
  type Recommendation,
  type Subject,
} from "@/lib/brrrr";
import {
  CostField,
  Field,
  MetricCard,
  PhaseCard,
  Pill,
  ReadOut,
  Segmented,
  Stars,
  type Tone,
} from "@/components/ui";
import { Timeline, type TimelineStep } from "@/components/Timeline";
import { Sensitivity } from "@/components/Sensitivity";
import { CompAnalyzer } from "@/components/CompAnalyzer";

type ArvMode = "manual" | "comp";

/* ------------------------------ deal state -------------------------------- */

type NumericKey = keyof Omit<Inputs, "purchaseType">;

const NUMERIC_KEYS: NumericKey[] = [
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

type Values = Record<NumericKey, number | null>;

const EMPTY_VALUES = Object.fromEntries(
  NUMERIC_KEYS.map((k) => [k, null]),
) as Values;

const EXAMPLE_VALUES = Object.fromEntries(
  NUMERIC_KEYS.map((k) => [k, defaultInputs[k] as number]),
) as Values;

const STORAGE_KEY = "brrrr-deal-v1";

const EMPTY_SUBJECT: Subject = { sqft: null, beds: null, baths: null };
const EXAMPLE_SUBJECT: Subject = { sqft: 1400, beds: 3, baths: 2 };

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

function newComp(): Comp {
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
  };
}

const EXAMPLE_COMPS: Comp[] = [
  { id: "ex1", address: "123 Oak St", salePrice: 215000, sqft: 1450, beds: 3, baths: 2, distance: 0.4, daysSinceSale: 35, reno: "Similar" },
  { id: "ex2", address: "456 Maple Ave", salePrice: 199000, sqft: 1350, beds: 3, baths: 2, distance: 0.7, daysSinceSale: 60, reno: "Similar" },
  { id: "ex3", address: "789 Pine Rd", salePrice: 228000, sqft: 1500, beds: 4, baths: 2, distance: 1.1, daysSinceSale: 90, reno: "Superior" },
  { id: "ex4", address: "321 Elm St", salePrice: 192000, sqft: 1300, beds: 3, baths: 1.5, distance: 0.9, daysSinceSale: 120, reno: "Basic" },
  { id: "ex5", address: "654 Birch Ln", salePrice: 221000, sqft: 1480, beds: 3, baths: 2.5, distance: 1.5, daysSinceSale: 150, reno: "Similar" },
];

/** Coerce an unknown value loaded from storage into a Comp (or null). */
function sanitizeComp(x: unknown): Comp | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  const reno: Comp["reno"] =
    o.reno === "Basic" || o.reno === "Superior" ? o.reno : "Similar";
  return {
    id: typeof o.id === "string" ? o.id : genId(),
    address: typeof o.address === "string" ? o.address : "",
    salePrice: num(o.salePrice),
    sqft: num(o.sqft),
    beds: num(o.beds),
    baths: num(o.baths),
    distance: num(o.distance),
    daysSinceSale: num(o.daysSinceSale),
    reno,
  };
}

/** A cost value entered as either dollars or a % of purchase price. */
function effectiveCost(
  value: number | null,
  mode: CostMode,
  purchasePrice: number,
): number {
  const v = value ?? 0;
  return mode === "percent" ? (v / 100) * purchasePrice : v;
}

function resolve(
  values: Values,
  purchaseType: PurchaseType,
  closingMode: CostMode,
  holdingMode: CostMode,
  effectiveArv: number,
): Inputs {
  const out: Record<string, unknown> = { purchaseType };
  for (const k of NUMERIC_KEYS) {
    out[k] = values[k] ?? 0;
  }
  const price = values.purchasePrice ?? 0;
  out.closingCosts = effectiveCost(values.closingCosts, closingMode, price);
  out.holdingCosts = effectiveCost(values.holdingCosts, holdingMode, price);
  out.arv = effectiveArv;
  return out as Inputs;
}

/* ----------------------------- tone resolvers ----------------------------- */

const cfTone = (v: number): Tone => (v >= 200 ? "good" : v >= 0 ? "warn" : "bad");
const dscrTone = (v: number): Tone =>
  !isFinite(v) || v >= 1.25 ? "good" : v >= 1.05 ? "warn" : "bad";
const cashLeftTone = (v: number): Tone =>
  v <= 0 ? "good" : v <= 10000 ? "warn" : "bad";

/* --------------------------------- page ----------------------------------- */

export default function Home() {
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(
    defaultInputs.purchaseType,
  );
  const [closingMode, setClosingMode] = useState<CostMode>("dollar");
  const [holdingMode, setHoldingMode] = useState<CostMode>("dollar");
  const [subject, setSubject] = useState<Subject>(EMPTY_SUBJECT);
  const [comps, setComps] = useState<Comp[]>([]);
  const [arvMode, setArvMode] = useState<ArvMode>("manual");
  const [pendingResume, setPendingResume] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedRef = useRef<{
    values: Values;
    purchaseType: PurchaseType;
    closingMode: CostMode;
    holdingMode: CostMode;
    subject: Subject;
    comps: Comp[];
    arvMode: ArvMode;
  } | null>(null);

  // Load any saved deal once, on mount (client only — avoids hydration issues)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.values) {
          const rawComps = Array.isArray(p.comps) ? p.comps : [];
          savedRef.current = {
            values: { ...EMPTY_VALUES, ...p.values },
            purchaseType: p.purchaseType === "cash" ? "cash" : "financed",
            closingMode: p.closingMode === "percent" ? "percent" : "dollar",
            holdingMode: p.holdingMode === "percent" ? "percent" : "dollar",
            subject: {
              sqft: typeof p.subject?.sqft === "number" ? p.subject.sqft : null,
              beds: typeof p.subject?.beds === "number" ? p.subject.beds : null,
              baths:
                typeof p.subject?.baths === "number" ? p.subject.baths : null,
            },
            comps: rawComps
              .map(sanitizeComp)
              .filter((c: Comp | null): c is Comp => c !== null)
              .slice(0, MAX_COMPS),
            arvMode: p.arvMode === "comp" ? "comp" : "manual",
          };
          setPendingResume(true);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  // Autosave 2s after the last change (skip while a resume prompt is pending)
  useEffect(() => {
    if (!ready || pendingResume) return;
    const id = setTimeout(() => {
      try {
        const t = Date.now();
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            values,
            purchaseType,
            closingMode,
            holdingMode,
            subject,
            comps,
            arvMode,
            savedAt: t,
          }),
        );
        setSavedAt(t);
      } catch {
        /* ignore quota errors */
      }
    }, 2000);
    return () => clearTimeout(id);
  }, [
    values,
    purchaseType,
    closingMode,
    holdingMode,
    subject,
    comps,
    arvMode,
    ready,
    pendingResume,
  ]);

  // Comparable-sales ARV estimate
  const compAnalysis = useMemo(
    () => analyzeComps(subject, comps),
    [subject, comps],
  );
  const manualArv = values.arv ?? 0;
  // When comp-based mode is on (and we have an estimate) use the comp average;
  // otherwise fall back to the manually entered ARV.
  const effectiveArv =
    arvMode === "comp" && compAnalysis.averageARV > 0
      ? compAnalysis.averageARV
      : manualArv;
  const arvVerdict = useMemo(
    () => compareArv(manualArv, compAnalysis.averageARV),
    [manualArv, compAnalysis.averageARV],
  );

  // Calculations run only when committed values change (Enter / blur / load)
  const inputs = useMemo(
    () => resolve(values, purchaseType, closingMode, holdingMode, effectiveArv),
    [values, purchaseType, closingMode, holdingMode, effectiveArv],
  );
  const r = useMemo(() => analyze(inputs), [inputs]);
  const s = useMemo(() => summarize(inputs, r), [inputs, r]);
  const sens = useMemo(() => sensitivity(inputs), [inputs]);
  const warnings = useMemo(() => assumptionWarnings(inputs, r), [inputs, r]);

  const hasDeal =
    (values.purchasePrice ?? 0) > 0 ||
    (values.arv ?? 0) > 0 ||
    (values.monthlyRent ?? 0) > 0;

  const commit = (key: NumericKey) => (v: number | null) =>
    setValues((prev) => (prev[key] === v ? prev : { ...prev, [key]: v }));

  // Switching a cost between $ and % converts the value so the resolved dollar
  // amount stays the same (e.g. $6,000 ⇄ 3% of $200,000).
  const changeCostMode = (
    key: "closingCosts" | "holdingCosts",
    current: CostMode,
    setMode: (m: CostMode) => void,
    next: CostMode,
  ) => {
    if (next === current) return;
    const price = values.purchasePrice ?? 0;
    const cur = values[key];
    if (cur != null && price > 0) {
      const dollar = current === "percent" ? (cur / 100) * price : cur;
      const converted = next === "percent" ? (dollar / price) * 100 : dollar;
      const rounded =
        next === "dollar"
          ? Math.round(converted)
          : Math.round(converted * 1000) / 1000;
      setValues((prev) => ({ ...prev, [key]: rounded }));
    }
    setMode(next);
  };

  // Comp editing
  const updateComp = (id: string, patch: Partial<Comp>) =>
    setComps((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addComp = () =>
    setComps((cs) => (cs.length >= MAX_COMPS ? cs : [...cs, newComp()]));
  const removeComp = (id: string) =>
    setComps((cs) => cs.filter((c) => c.id !== id));
  const updateSubject = (key: keyof Subject, v: number | null) =>
    setSubject((prev) => ({ ...prev, [key]: v }));

  const loadExample = () => {
    setValues(EXAMPLE_VALUES);
    setPurchaseType(defaultInputs.purchaseType);
    setClosingMode("dollar");
    setHoldingMode("dollar");
    setSubject(EXAMPLE_SUBJECT);
    setComps(EXAMPLE_COMPS.map((c) => ({ ...c })));
    setArvMode("manual");
    setPendingResume(false);
  };
  const clearDeal = () => {
    setValues(EMPTY_VALUES);
    setClosingMode("dollar");
    setHoldingMode("dollar");
    setSubject(EMPTY_SUBJECT);
    setComps([]);
    setArvMode("manual");
    setPendingResume(false);
  };
  const resume = () => {
    if (savedRef.current) {
      setValues(savedRef.current.values);
      setPurchaseType(savedRef.current.purchaseType);
      setClosingMode(savedRef.current.closingMode);
      setHoldingMode(savedRef.current.holdingMode);
      setSubject(savedRef.current.subject);
      setComps(savedRef.current.comps);
      setArvMode(savedRef.current.arvMode);
    }
    setPendingResume(false);
  };
  const startNew = () => {
    setValues(EMPTY_VALUES);
    setClosingMode("dollar");
    setHoldingMode("dollar");
    setSubject(EMPTY_SUBJECT);
    setComps([]);
    setArvMode("manual");
    setPendingResume(false);
  };

  const D = (str: string) => (hasDeal ? str : "—");

  const timeline: TimelineStep[] = [
    { label: "Purchase", value: fmtUSD(inputs.purchasePrice) },
    { label: "Rehab", value: fmtUSD(inputs.rehabCosts) },
    {
      label: "Cash Invested",
      value: fmtUSD(r.cashInvested),
      sub: "out of pocket",
      emphasis: true,
    },
    { label: "ARV", value: fmtUSD(inputs.arv), tone: "good" },
    {
      label: "Refi Proceeds",
      value: fmtUSD(r.refinanceAmount),
      sub: `${inputs.refinanceLTV}% LTV`,
    },
    { label: "Loan Payoff", value: fmtUSD(r.originalLoanPayoff), sub: "old loan" },
    { label: "Net Cash Avail.", value: fmtUSD(r.netCashAvailable) },
    {
      label: "Capital Recovered",
      value: fmtUSD(r.capitalRecovered),
      tone: "good",
    },
    r.cashOutSurplus > 0
      ? {
          label: "Cash Out Surplus",
          value: fmtUSD(r.cashOutSurplus),
          tone: "good" as const,
          emphasis: true,
        }
      : {
          label: "Cash Left",
          value: fmtUSD(r.cashLeftInDeal),
          tone: cashLeftTone(r.cashLeftInDeal),
          emphasis: true,
        },
    { label: "New Mortgage", value: fmtUSD(r.newMonthlyPayment), sub: "/mo" },
    { label: "Expected Rent", value: fmtUSD(inputs.monthlyRent), sub: "/mo" },
    {
      label: "Monthly Cash Flow",
      value: fmtUSD(r.monthlyCashFlow),
      sub: "/mo",
      tone: cfTone(r.monthlyCashFlow),
      emphasis: true,
    },
  ];

  const financed = purchaseType === "financed";

  return (
    <div className="min-h-screen">
      {/* ----------------------- Sticky summary bar ----------------------- */}
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-4 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex shrink-0 items-center gap-2 pr-3">
              <span className="text-sm font-bold tracking-tight text-white">
                BRRRR<span className="text-indigo-400">·</span>Analyzer
              </span>
            </div>
            <BarStat label="Rating">
              {hasDeal ? (
                <span className="flex items-center gap-1.5">
                  <Stars value={s.stars} size="sm" />
                  <span className="text-sm font-bold text-white">
                    {fmtNum(s.stars, 1)}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-500">—</span>
              )}
            </BarStat>
            <BarStat label="Monthly Cash Flow">
              <BarValue tone={hasDeal ? cfTone(r.monthlyCashFlow) : "neutral"}>
                {D(fmtUSD(r.monthlyCashFlow))}
              </BarValue>
            </BarStat>
            <BarStat
              label={r.cashOutSurplus > 0 ? "Cash Out Surplus" : "Cash Left in Deal"}
            >
              <BarValue
                tone={
                  !hasDeal
                    ? "neutral"
                    : r.cashOutSurplus > 0
                      ? "good"
                      : cashLeftTone(r.cashLeftInDeal)
                }
              >
                {D(
                  fmtUSD(
                    r.cashOutSurplus > 0 ? r.cashOutSurplus : r.cashLeftInDeal,
                  ),
                )}
              </BarValue>
            </BarStat>
            <BarStat label="Break-even Rent">
              <BarValue>{D(fmtUSD(r.breakEvenRent))}</BarValue>
            </BarStat>
            <BarStat label="DSCR">
              <BarValue tone={hasDeal ? dscrTone(r.dscr) : "neutral"}>
                {D(fmtNum(r.dscr))}
              </BarValue>
            </BarStat>
            <BarStat label="Equity Created">
              <BarValue tone={hasDeal ? (r.equityCreated >= 0 ? "good" : "bad") : "neutral"}>
                {D(fmtUSD(r.equityCreated))}
              </BarValue>
            </BarStat>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* ----------------------- Resume banner ----------------------- */}
        {pendingResume && (
          <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <path d="M10 3a7 7 0 100 14 7 7 0 000-14zm.75 3.5a.75.75 0 00-1.5 0V10c0 .27.14.52.38.65l2.5 1.5a.75.75 0 10.74-1.3l-2.12-1.27V6.5z" />
                </svg>
              </span>
              <div>
                <div className="text-sm font-semibold text-indigo-900">
                  Resume previous deal?
                </div>
                <p className="text-xs text-indigo-700">
                  We found a deal saved in this browser
                  {savedRef.current
                    ? ` (${fmtUSD(savedRef.current.values.purchasePrice ?? 0)} purchase)`
                    : ""}
                  .
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={resume}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={startNew}
                className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                Start New
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------- Header ----------------------------- */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Deal Analysis
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Model a Buy · Rehab · Rent · Refinance · Repeat deal across all
              three phases. Press{" "}
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs">
                Enter
              </kbd>{" "}
              or click away to update.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={loadExample}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Load Example Deal
            </button>
            <button
              type="button"
              onClick={clearDeal}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear Deal
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* =========================== INPUTS =========================== */}
          <div className="space-y-6">
            {/* Phase 1 */}
            <PhaseCard
              phase="1"
              title="Purchase Phase"
              subtitle="How you acquire and fund the property"
              accent="bg-indigo-600"
            >
              <div className="space-y-4">
                <div>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Acquisition method
                  </span>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    {(["cash", "financed"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPurchaseType(t)}
                        className={`rounded-md px-3 py-2.5 text-sm font-medium capitalize transition ${
                          purchaseType === t
                            ? "bg-white text-indigo-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {t === "cash" ? "Cash purchase" : "Financed"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Purchase Price"
                    kind="currency"
                    placeholder="Enter purchase price"
                    value={values.purchasePrice}
                    onCommit={commit("purchasePrice")}
                  />
                  {financed && (
                    <>
                      <Field
                        label="Down Payment"
                        kind="currency"
                        placeholder="Enter down payment"
                        value={values.downPayment}
                        onCommit={commit("downPayment")}
                      />
                      <ReadOut
                        label="Purchase Loan Amount"
                        value={D(fmtUSD(r.purchaseLoanAmount))}
                        hint="auto"
                      />
                      <Field
                        label="Purchase Interest Rate"
                        kind="percent"
                        placeholder="e.g. 9.5"
                        value={values.purchaseInterestRate}
                        onCommit={commit("purchaseInterestRate")}
                      />
                      <Field
                        label="Purchase Loan Term"
                        kind="years"
                        placeholder="e.g. 30"
                        value={values.purchaseLoanTerm}
                        onCommit={commit("purchaseLoanTerm")}
                      />
                    </>
                  )}
                  <CostField
                    label="Closing Costs"
                    value={values.closingCosts}
                    onCommit={commit("closingCosts")}
                    mode={closingMode}
                    onModeChange={(m) =>
                      changeCostMode(
                        "closingCosts",
                        closingMode,
                        setClosingMode,
                        m,
                      )
                    }
                    purchasePrice={inputs.purchasePrice}
                    effectiveDollar={inputs.closingCosts}
                    placeholderDollar="Enter closing costs"
                    placeholderPercent="e.g. 3"
                  />
                  <CostField
                    label="Holding Costs"
                    value={values.holdingCosts}
                    onCommit={commit("holdingCosts")}
                    mode={holdingMode}
                    onModeChange={(m) =>
                      changeCostMode(
                        "holdingCosts",
                        holdingMode,
                        setHoldingMode,
                        m,
                      )
                    }
                    purchasePrice={inputs.purchasePrice}
                    effectiveDollar={inputs.holdingCosts}
                    placeholderDollar="Enter holding costs"
                    placeholderPercent="e.g. 1"
                  />
                  <Field
                    label="Rehab Costs"
                    kind="currency"
                    placeholder="Enter rehab budget"
                    value={values.rehabCosts}
                    onCommit={commit("rehabCosts")}
                  />
                </div>
              </div>
            </PhaseCard>

            {/* Phase 2 */}
            <PhaseCard
              phase="2"
              title="Refinance Phase"
              subtitle="Pull your capital back out with a cash-out refinance"
              accent="bg-violet-600"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* ARV source toggle */}
                <div className="sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    ARV Source
                  </span>
                  <Segmented<ArvMode>
                    value={arvMode}
                    onChange={setArvMode}
                    options={[
                      { value: "manual", label: "Use Manual ARV" },
                      { value: "comp", label: "Use Comp-based ARV" },
                    ]}
                  />
                  {arvMode === "comp" ? (
                    <p className="mt-1.5 text-xs text-slate-500">
                      {compAnalysis.averageARV > 0 ? (
                        <>
                          Refinance is using the comp-based ARV of{" "}
                          <span className="font-semibold text-sky-700">
                            {fmtUSD(compAnalysis.averageARV)}
                          </span>
                          .
                        </>
                      ) : (
                        "No comp estimate yet — add comps below. Until then, the manual ARV is used."
                      )}
                    </p>
                  ) : (
                    arvVerdict && (
                      <p
                        className={`mt-1.5 text-xs font-medium ${
                          arvVerdict.tone === "good"
                            ? "text-emerald-600"
                            : arvVerdict.tone === "warn"
                              ? "text-amber-600"
                              : "text-sky-600"
                        }`}
                      >
                        {arvVerdict.message}{" "}
                        <span className="font-normal text-slate-400">
                          (comp avg {fmtUSD(compAnalysis.averageARV)})
                        </span>
                      </p>
                    )
                  )}
                </div>
                <Field
                  label="Manual ARV"
                  kind="currency"
                  placeholder="Enter ARV"
                  value={values.arv}
                  onCommit={commit("arv")}
                />
                <ReadOut
                  label="ARV Used"
                  value={D(fmtUSD(inputs.arv))}
                  hint={arvMode === "comp" ? "comp-based" : "manual"}
                  tone="neutral"
                />
                <Field
                  label="Refinance LTV"
                  kind="percent"
                  placeholder="e.g. 75"
                  value={values.refinanceLTV}
                  onCommit={commit("refinanceLTV")}
                />
                <Field
                  label="New Interest Rate"
                  kind="percent"
                  placeholder="e.g. 7.25"
                  value={values.newInterestRate}
                  onCommit={commit("newInterestRate")}
                />
                <Field
                  label="New Loan Term"
                  kind="years"
                  placeholder="e.g. 30"
                  value={values.newLoanTerm}
                  onCommit={commit("newLoanTerm")}
                />
                <ReadOut
                  label="Cash Invested"
                  value={D(fmtUSD(r.cashInvested))}
                  hint="out of pocket"
                />
                <ReadOut
                  label="Refinance Proceeds"
                  value={D(fmtUSD(r.refinanceAmount))}
                  hint="ARV × LTV"
                />
                <ReadOut
                  label="Original Loan Payoff"
                  value={D(fmtUSD(r.originalLoanPayoff))}
                  hint="old loan"
                />
                <ReadOut
                  label="Net Cash After Payoff"
                  value={D(fmtUSD(r.netCashAvailable))}
                  hint="proceeds − payoff"
                  tone={hasDeal && r.netCashAvailable < 0 ? "bad" : "neutral"}
                />
                <ReadOut
                  label="New Monthly Payment"
                  value={D(fmtUSD(r.newMonthlyPayment))}
                  hint="P & I"
                />
                <ReadOut
                  label="Capital Recovered"
                  value={D(fmtUSD(r.capitalRecovered))}
                  hint="of cash invested"
                  tone={hasDeal ? "good" : "neutral"}
                />
                {r.cashOutSurplus > 0 ? (
                  <ReadOut
                    label="Cash Out Surplus"
                    value={D(fmtUSD(r.cashOutSurplus))}
                    hint="pulled out beyond invested"
                    tone={hasDeal ? "good" : "neutral"}
                  />
                ) : (
                  <ReadOut
                    label="Cash Left in Deal"
                    value={D(fmtUSD(r.cashLeftInDeal))}
                    hint="still tied up"
                    tone={hasDeal ? cashLeftTone(r.cashLeftInDeal) : "neutral"}
                  />
                )}
              </div>
            </PhaseCard>

            {/* Comparable Sales / ARV — between Refinance and Rental */}
            <CompAnalyzer
              subject={subject}
              onSubject={updateSubject}
              comps={comps}
              onUpdate={updateComp}
              onAdd={addComp}
              onRemove={removeComp}
            />

            {/* Phase 3 */}
            <PhaseCard
              phase="3"
              title="Rental Phase"
              subtitle="Ongoing income and operating expenses"
              accent="bg-teal-600"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Monthly Rent"
                  kind="currency"
                  placeholder="Enter monthly rent"
                  value={values.monthlyRent}
                  onCommit={commit("monthlyRent")}
                />
                <Field
                  label="Property Taxes"
                  kind="currency"
                  placeholder="Enter annual taxes"
                  hint="per year"
                  value={values.taxes}
                  onCommit={commit("taxes")}
                />
                <Field
                  label="Insurance"
                  kind="currency"
                  placeholder="Enter annual premium"
                  hint="per year"
                  value={values.insurance}
                  onCommit={commit("insurance")}
                />
                <Field
                  label="HOA"
                  kind="currency"
                  placeholder="Enter HOA dues"
                  hint="per month"
                  value={values.hoa}
                  onCommit={commit("hoa")}
                />
                <Field
                  label="Management"
                  kind="percent"
                  placeholder="e.g. 8"
                  hint="of rent"
                  value={values.management}
                  onCommit={commit("management")}
                />
                <Field
                  label="Vacancy"
                  kind="percent"
                  placeholder="e.g. 5"
                  hint="of rent"
                  value={values.vacancy}
                  onCommit={commit("vacancy")}
                />
                <Field
                  label="Maintenance"
                  kind="percent"
                  placeholder="e.g. 5"
                  hint="of rent"
                  value={values.maintenance}
                  onCommit={commit("maintenance")}
                />
                <Field
                  label="CapEx Reserve"
                  kind="percent"
                  placeholder="e.g. 5"
                  hint="of rent"
                  value={values.capexReserve}
                  onCommit={commit("capexReserve")}
                />
                <Field
                  label="Utilities"
                  kind="currency"
                  placeholder="Optional"
                  hint="per month"
                  value={values.utilities}
                  onCommit={commit("utilities")}
                />
              </div>
            </PhaseCard>

            <p className="text-center text-xs text-slate-400">
              {savedAt
                ? `Autosaved to this browser at ${new Date(savedAt).toLocaleTimeString()}`
                : "Changes autosave to this browser"}
            </p>
          </div>

          {/* =========================== ANALYSIS =========================== */}
          <div className="space-y-6">
            {!hasDeal ? (
              <EmptyState onLoadExample={loadExample} />
            ) : (
              <>
                {/* Deal Summary / recommendation */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-5 text-white">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Recommendation
                        </div>
                        <div
                          className={`mt-1 text-2xl font-extrabold ${
                            s.recommendation === "Buy"
                              ? "text-emerald-400"
                              : s.recommendation === "Buy with Caution"
                                ? "text-amber-400"
                                : "text-red-400"
                          }`}
                        >
                          {s.recommendation}
                        </div>
                      </div>
                      <div className="text-right">
                        <Stars value={s.stars} />
                        <div className="mt-1 text-xs text-slate-400">
                          {fmtNum(s.stars, 1)} / 5 · score {s.score}/100
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                      {s.recommendationReason}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                        Risk:{" "}
                        <span
                          className={
                            s.risk === "Low"
                              ? "text-emerald-300"
                              : s.risk === "Medium"
                                ? "text-amber-300"
                                : "text-red-300"
                          }
                        >
                          {s.risk}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                        Confidence:{" "}
                        <span
                          className={
                            s.confidence === "High"
                              ? "text-emerald-300"
                              : s.confidence === "Medium"
                                ? "text-amber-300"
                                : "text-slate-300"
                          }
                        >
                          {s.confidence}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
                    <FindingList
                      title="Top strengths"
                      tone="good"
                      items={s.strengths}
                      empty="No standout strengths at these numbers."
                    />
                    <FindingList
                      title="Top weaknesses"
                      tone="bad"
                      items={s.weaknesses}
                      empty="No major weaknesses detected — looks clean."
                    />
                  </div>
                </section>

                {/* Assumption warnings */}
                {warnings.length > 0 && <AssumptionWarnings items={warnings} />}

                {/* Smart analysis metrics */}
                <div>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Smart Analysis
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MetricCard
                      label="Monthly Cash Flow"
                      value={fmtUSD(r.monthlyCashFlow)}
                      hint="Income left after expenses and the new mortgage."
                      tone={cfTone(r.monthlyCashFlow)}
                    />
                    <MetricCard
                      label="Annual Cash Flow"
                      value={fmtUSD(r.annualCashFlow)}
                      hint="Your yearly profit from the property."
                      tone={cfTone(r.monthlyCashFlow)}
                    />
                    <MetricCard
                      label="DSCR"
                      value={fmtNum(r.dscr)}
                      hint="Income ÷ mortgage. Lenders typically want 1.20+."
                      tone={dscrTone(r.dscr)}
                    />
                    <MetricCard
                      label="Cap Rate"
                      value={fmtPct(r.capRate)}
                      hint="NOI ÷ value — return ignoring financing."
                      tone={
                        r.capRate >= 6 ? "good" : r.capRate >= 4 ? "warn" : "bad"
                      }
                    />
                    <MetricCard
                      label="Cash-on-Cash Return"
                      value={fmtPct(r.cashOnCash)}
                      hint="Annual cash flow ÷ cash left. ∞ = all cash recovered."
                      tone={
                        !isFinite(r.cashOnCash) || r.cashOnCash >= 8
                          ? "good"
                          : r.cashOnCash >= 0
                            ? "warn"
                            : "bad"
                      }
                    />
                    <MetricCard
                      label="Equity Created"
                      value={fmtUSD(r.equityCreated)}
                      hint="ARV minus your all-in cost — forced equity."
                      tone={r.equityCreated > 0 ? "good" : "bad"}
                    />
                    <MetricCard
                      label="BRRRR Percentage"
                      value={fmtPct(r.brrrrPct, 0)}
                      hint="Share of invested cash recovered. 100% = full BRRRR."
                      tone={
                        !isFinite(r.brrrrPct) || r.brrrrPct >= 90
                          ? "good"
                          : r.brrrrPct >= 70
                            ? "warn"
                            : "bad"
                      }
                    />
                    <MetricCard
                      label="Total ROI"
                      value={fmtPct(r.totalROI, 0)}
                      hint="First-year cash flow + equity, on cash invested."
                      tone={
                        !isFinite(r.totalROI) || r.totalROI >= 25
                          ? "good"
                          : r.totalROI >= 0
                            ? "warn"
                            : "bad"
                      }
                    />
                  </div>
                </div>

                {/* Required rent table */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Required Rent
                  </h2>
                  <p className="mb-3 mt-1 text-xs text-slate-500">
                    The monthly rent you&apos;d need to hit each target. Your
                    current rent is{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtUSD(inputs.monthlyRent)}
                    </span>
                    .
                  </p>
                  <div className="divide-y divide-slate-100">
                    <RentRow
                      label="Break-even ($0 cash flow)"
                      value={r.rentFor0}
                      rent={inputs.monthlyRent}
                    />
                    <RentRow
                      label="$200/mo cash flow"
                      value={r.rentFor200}
                      rent={inputs.monthlyRent}
                    />
                    <RentRow
                      label="$500/mo cash flow"
                      value={r.rentFor500}
                      rent={inputs.monthlyRent}
                    />
                    <RentRow
                      label="DSCR of 1.20"
                      value={r.rentForDSCR120}
                      rent={inputs.monthlyRent}
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        </div>

        {/* ============================ TIMELINE ============================ */}
        {hasDeal && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              BRRRR Timeline
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              The full lifecycle of the deal, from acquisition to monthly cash
              flow.
            </p>
            <div className="overflow-x-auto pb-2">
              <Timeline steps={timeline} />
            </div>
          </section>
        )}

        {/* =========================== SENSITIVITY =========================== */}
        {hasDeal && (
          <div className="mt-8">
            <Sensitivity data={sens} />
          </div>
        )}

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          BRRRR Analyzer · For educational estimates only — verify every number
          with your lender and run your own due diligence.
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------ sub-components ----------------------------- */

function EmptyState({ onLoadExample }: { onLoadExample: () => void }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l2-2 4 4 7-7 5 5M3 6h18" />
        </svg>
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-800">
        No deal to analyze yet
      </h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Enter at least a purchase price, ARV, and rent — or load the example
        deal to see the full analysis.
      </p>
      <button
        type="button"
        onClick={onLoadExample}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Load Example Deal
      </button>
    </div>
  );
}

function AssumptionWarnings({
  items,
}: {
  items: { title: string; detail: string }[];
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.2 3-1.74 3H3.72c-1.54 0-2.5-1.67-1.74-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-amber-900">
            Optimistic assumptions
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            {CONSERVATIVE_TIP}
          </p>
          <ul className="mt-3 space-y-2">
            {items.map((it) => (
              <li key={it.title} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <div className="text-sm font-medium text-amber-900">
                    {it.title}
                  </div>
                  <div className="text-xs leading-relaxed text-amber-700">
                    {it.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function BarStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col border-l border-slate-700/60 pl-4">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-0.5 leading-none">{children}</span>
    </div>
  );
}

function BarValue({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-red-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-white";
  return <span className={`text-sm font-bold ${color}`}>{children}</span>;
}

function FindingList({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: Tone;
  items: { title: string; detail: string }[];
  empty: string;
}) {
  const dot =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "bad"
        ? "bg-red-500"
        : "bg-slate-400";
  return (
    <div className="bg-white p-5">
      <h3 className={`mb-3 text-sm font-semibold ${toneTextLocal(tone)}`}>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.title} className="flex gap-2.5">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {it.title}
                </div>
                <div className="text-xs leading-relaxed text-slate-500">
                  {it.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toneTextLocal(tone: Tone) {
  return tone === "good"
    ? "text-emerald-600"
    : tone === "bad"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-slate-900";
}

function RentRow({
  label,
  value,
  rent,
}: {
  label: string;
  value: number;
  rent: number;
}) {
  const ok = isFinite(value) && rent >= value;
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {fmtUSD(value)}
        </span>
        <Pill tone={ok ? "good" : "warn"}>{ok ? "met" : "short"}</Pill>
      </span>
    </div>
  );
}
