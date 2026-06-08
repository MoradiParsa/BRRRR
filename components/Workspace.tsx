"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyze,
  analyzeComps,
  arvForSource,
  assumptionWarnings,
  compareArv,
  CONSERVATIVE_TIP,
  fmtNum,
  fmtPct,
  fmtUSD,
  MAX_COMPS,
  sensitivity,
  summarize,
  type ArvSource,
  type Comp,
  type CostMode,
  type Property,
  type PurchaseType,
  type Recommendation,
  type Subject,
} from "@/lib/brrrr";
import {
  emptyDealState,
  exampleDealState,
  newComp,
  PIPELINE_STATUSES,
  resolveInputs,
  type DealState,
  type NumericKey,
  type PipelineStatus,
  type Values,
} from "@/lib/deals";
import {
  CostField,
  Field,
  MetricCard,
  PhaseCard,
  Pill,
  ReadOut,
  Stars,
  type Tone,
} from "@/components/ui";
import { Timeline, type TimelineStep } from "@/components/Timeline";
import { Sensitivity } from "@/components/Sensitivity";
import { CompAnalyzer } from "@/components/CompAnalyzer";
import { PropertyHeader } from "@/components/PropertyHeader";
import { QuickSummary, type SummaryItem } from "@/components/QuickSummary";
import {
  DealChecklist,
  type CheckStatus,
  type ChecklistItem,
} from "@/components/DealChecklist";
import { ArvSourceCard } from "@/components/ArvSourceCard";

/* ----------------------------- tone resolvers ----------------------------- */

const cfTone = (v: number): Tone => (v >= 200 ? "good" : v >= 0 ? "warn" : "bad");
const dscrTone = (v: number): Tone =>
  !isFinite(v) || v >= 1.25 ? "good" : v >= 1.05 ? "warn" : "bad";
const cashLeftTone = (v: number): Tone =>
  v <= 0 ? "good" : v <= 10000 ? "warn" : "bad";
const recTextTone = (rec: Recommendation): Tone =>
  rec === "Buy" ? "good" : rec === "Buy with Caution" ? "warn" : "bad";

const threeWay = (
  status: CheckStatus,
  label: string,
  detail: string,
): ChecklistItem => ({ status, label, detail });

/* -------------------------------- workspace ------------------------------- */

export type WorkspaceHandle = { save: () => void };

/** Canonical serialization (array form sidesteps key-order issues). */
function serializeDeal(st: DealState): string {
  return JSON.stringify([
    st.values,
    st.purchaseType,
    st.closingMode,
    st.holdingMode,
    st.subject,
    st.comps,
    st.arvMode,
    st.property,
    st.notes ?? "",
    st.status ?? "analyzing",
    st.sourceType ?? "manual",
    st.sourceUrl ?? "",
    st.sourceFileName ?? "",
    st.sourceNotes ?? "",
    st.importedAt ?? 0,
  ]);
}

type WorkspaceProps = {
  deal: DealState;
  mode: "new" | "edit";
  dealId: string | null;
  initialSavedAt: number | null;
  onPersistNew: (state: DealState) => string;
  onPersistExisting: (id: string, state: DealState) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBack: () => void;
};

export const Workspace = forwardRef<WorkspaceHandle, WorkspaceProps>(
  function Workspace(
    {
      deal,
      mode,
      dealId,
      initialSavedAt,
      onPersistNew,
      onPersistExisting,
      onDirtyChange,
      onBack,
    },
    ref,
  ) {
  const [values, setValues] = useState<Values>(deal.values);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(
    deal.purchaseType,
  );
  const [closingMode, setClosingMode] = useState<CostMode>(deal.closingMode);
  const [holdingMode, setHoldingMode] = useState<CostMode>(deal.holdingMode);
  const [subject, setSubject] = useState<Subject>(deal.subject);
  const [comps, setComps] = useState<Comp[]>(deal.comps);
  const [arvMode, setArvMode] = useState<ArvSource>(deal.arvMode);
  const [property, setProperty] = useState<Property>(deal.property);
  const [notes, setNotes] = useState<string>(deal.notes ?? "");
  const [status, setStatus] = useState<PipelineStatus>(
    deal.status ?? "analyzing",
  );

  // Import metadata is read-only inside the workspace; carry it through saves.
  const source = {
    sourceType: deal.sourceType ?? "manual",
    sourceUrl: deal.sourceUrl,
    sourceFileName: deal.sourceFileName,
    sourceNotes: deal.sourceNotes,
    importedAt: deal.importedAt,
  };

  // ---- save / dirty tracking ----
  const [persisted, setPersisted] = useState(mode === "edit");
  const [internalId, setInternalId] = useState<string | null>(dealId);
  // A new draft is "clean" only if it equals a blank deal; an imported draft
  // (with a prefilled link/file/rows) therefore starts dirty and savable.
  const [baseline, setBaseline] = useState<string>(() =>
    serializeDeal(mode === "new" ? emptyDealState() : deal),
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialSavedAt);
  const [saving, setSaving] = useState(false);

  const currentState: DealState = {
    values,
    purchaseType,
    closingMode,
    holdingMode,
    subject,
    comps,
    arvMode,
    property,
    notes,
    status,
    ...source,
  };
  const snapshot = serializeDeal(currentState);
  const dirty = snapshot !== baseline;

  // Report dirty status up for the navigation guard.
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const doSave = () => {
    setSaving(true);
    let id = internalId;
    if (!persisted || !id) {
      id = onPersistNew(currentState);
      setInternalId(id);
      setPersisted(true);
    } else {
      onPersistExisting(id, currentState);
    }
    setBaseline(snapshot);
    setLastSavedAt(Date.now());
    window.setTimeout(() => setSaving(false), 500);
  };

  // Stable imperative handle so the shell can "Save & Leave".
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useImperativeHandle(ref, () => ({ save: () => saveRef.current() }), []);

  // Comparable-sales ARV estimate
  const compAnalysis = useMemo(
    () => analyzeComps(subject, comps),
    [subject, comps],
  );
  const manualArv = values.arv ?? 0;
  const compArv = compAnalysis.averageARV;
  const effectiveArv = arvForSource(arvMode, manualArv, compArv);
  const arvComparison = useMemo(
    () => compareArv(manualArv, compArv),
    [manualArv, compArv],
  );

  const inputs = useMemo(
    () =>
      resolveInputs(values, purchaseType, closingMode, holdingMode, effectiveArv),
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

  const updateComp = (id: string, patch: Partial<Comp>) =>
    setComps((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addComp = () =>
    setComps((cs) => (cs.length >= MAX_COMPS ? cs : [...cs, newComp()]));
  const removeComp = (id: string) =>
    setComps((cs) => cs.filter((c) => c.id !== id));
  const updateSubject = (key: keyof Subject, v: number | null) =>
    setSubject((prev) => ({ ...prev, [key]: v }));

  const updatePropertyText = (
    key: "name" | "address" | "cityState",
    v: string,
  ) => setProperty((prev) => ({ ...prev, [key]: v }));
  const updatePropertyNum = (
    key: "beds" | "baths" | "sqft",
    v: number | null,
  ) => setProperty((prev) => ({ ...prev, [key]: v }));

  const applyState = (next: DealState) => {
    setValues(next.values);
    setPurchaseType(next.purchaseType);
    setClosingMode(next.closingMode);
    setHoldingMode(next.holdingMode);
    setSubject(next.subject);
    setComps(next.comps);
    setArvMode(next.arvMode);
    setProperty(next.property);
    setNotes(next.notes ?? "");
    setStatus(next.status ?? "analyzing");
  };
  const loadExample = () => applyState(exampleDealState());
  const clearDeal = () => applyState(emptyDealState());

  const D = (str: string) => (hasDeal ? str : "—");

  // Header reflects whether this is a brand-new draft or a saved property.
  const headerTitle = persisted
    ? property.name.trim() || property.address.trim() || "Untitled property"
    : "New Property";
  const headerSubtitle = [property.address.trim(), property.cityState.trim()]
    .filter(Boolean)
    .join(" · ");
  const canSave = dirty && !saving;

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

  const capitalRow: SummaryItem =
    r.cashOutSurplus > 0
      ? {
          label: "Cash Out Surplus",
          value: D(fmtUSD(r.cashOutSurplus)),
          tone: "good",
        }
      : {
          label: "Cash Left",
          value: D(fmtUSD(r.cashLeftInDeal)),
          tone: hasDeal ? cashLeftTone(r.cashLeftInDeal) : "neutral",
        };
  const quickItems: SummaryItem[] = [
    { label: "Purchase Price", value: D(fmtUSD(inputs.purchasePrice)) },
    { label: "Rehab Cost", value: D(fmtUSD(inputs.rehabCosts)) },
    { label: "ARV", value: D(fmtUSD(inputs.arv)) },
    { label: "Monthly Rent", value: D(fmtUSD(inputs.monthlyRent)) },
    { label: "Cash Invested", value: D(fmtUSD(r.cashInvested)) },
    {
      label: "Capital Recovered",
      value: D(fmtUSD(r.capitalRecovered)),
      tone: hasDeal ? "good" : "neutral",
    },
    capitalRow,
    {
      label: "Monthly Cash Flow",
      value: D(fmtUSD(r.monthlyCashFlow)),
      tone: hasDeal ? cfTone(r.monthlyCashFlow) : "neutral",
    },
    {
      label: "DSCR",
      value: D(fmtNum(r.dscr)),
      tone: hasDeal ? dscrTone(r.dscr) : "neutral",
    },
    {
      label: "Recommendation",
      value: hasDeal ? s.recommendation : "—",
      tone: hasDeal ? recTextTone(s.recommendation) : "neutral",
    },
  ];

  const rentEntered = inputs.monthlyRent > 0;
  const checklist: ChecklistItem[] = [
    threeWay(
      inputs.purchasePrice > 0 && r.maxOffer70 > 0
        ? inputs.purchasePrice <= r.maxOffer70
          ? "good"
          : inputs.purchasePrice <= r.maxOffer70 * 1.05
            ? "warn"
            : "bad"
        : "warn",
      "Meets the 70% rule",
      `Max offer is ${fmtUSD(r.maxOffer70)}; purchase price is ${fmtUSD(inputs.purchasePrice)}.`,
    ),
    threeWay(
      r.monthlyCashFlow >= 100 ? "good" : r.monthlyCashFlow >= 0 ? "warn" : "bad",
      "Positive monthly cash flow",
      `${fmtUSD(r.monthlyCashFlow)}/mo after expenses and the new mortgage.`,
    ),
    threeWay(
      !isFinite(r.dscr) || r.dscr >= 1.2 ? "good" : r.dscr >= 1.05 ? "warn" : "bad",
      "DSCR above 1.20",
      `DSCR is ${fmtNum(r.dscr)} (lenders typically want 1.20+).`,
    ),
    threeWay(
      !isFinite(r.brrrrPct) || r.brrrrPct >= 90
        ? "good"
        : r.brrrrPct >= 70
          ? "warn"
          : "bad",
      "At least 90% capital recovery",
      `Refinance recovers ${fmtPct(r.brrrrPct, 0)} of invested cash.`,
    ),
    threeWay(
      compAnalysis.validCount === 0
        ? "warn"
        : compAnalysis.confidence === "High"
          ? "good"
          : compAnalysis.confidence === "Medium"
            ? "warn"
            : "bad",
      "ARV confidence medium or high",
      compAnalysis.validCount === 0
        ? "No comps added yet — confidence can't be assessed."
        : `Comp-based ARV confidence is ${compAnalysis.confidence}.`,
    ),
    threeWay(
      !rentEntered
        ? "warn"
        : r.breakEvenRent <= inputs.monthlyRent
          ? "good"
          : r.breakEvenRent <= inputs.monthlyRent * 1.05
            ? "warn"
            : "bad",
      "Break-even rent below expected rent",
      rentEntered
        ? `Break-even is ${fmtUSD(r.breakEvenRent)}; expected rent is ${fmtUSD(inputs.monthlyRent)}.`
        : "Enter expected rent to evaluate.",
    ),
    threeWay(
      !rentEntered
        ? "warn"
        : r.rentForDSCR120 <= inputs.monthlyRent
          ? "good"
          : r.rentForDSCR120 <= inputs.monthlyRent * 1.05
            ? "warn"
            : "bad",
      "Rent for DSCR 1.20 below expected rent",
      rentEntered
        ? `Need ${fmtUSD(r.rentForDSCR120)} for a 1.20 DSCR; expected rent is ${fmtUSD(inputs.monthlyRent)}.`
        : "Enter expected rent to evaluate.",
    ),
    threeWay(
      warnings.length === 0 ? "good" : warnings.length <= 2 ? "warn" : "bad",
      "Assumptions are conservative enough",
      warnings.length === 0
        ? "Management, maintenance, and reserves look reasonable."
        : `${warnings.length} optimistic assumption${warnings.length === 1 ? "" : "s"} flagged.`,
    ),
  ];

  return (
    <div className="min-h-screen">
      {/* ----------------------- Sticky summary bar ----------------------- */}
      <div className="sticky top-14 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80 lg:top-0">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-4 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={onBack}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12.7 15.3a1 1 0 01-1.4 0l-5-5a1 1 0 010-1.4l5-5a1 1 0 111.4 1.4L8.42 10l4.3 4.3a1 1 0 010 1.4z"
                  clipRule="evenodd"
                />
              </svg>
              Pipeline
            </button>
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
              label={r.cashOutSurplus > 0 ? "Cash Out Surplus" : "Cash Left"}
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
              <BarValue
                tone={hasDeal ? (r.equityCreated >= 0 ? "good" : "bad") : "neutral"}
              >
                {D(fmtUSD(r.equityCreated))}
              </BarValue>
            </BarStat>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* ----------------------------- Header ----------------------------- */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12.7 15.3a1 1 0 01-1.4 0l-5-5a1 1 0 010-1.4l5-5a1 1 0 111.4 1.4L8.42 10l4.3 4.3a1 1 0 010 1.4z"
                  clipRule="evenodd"
                />
              </svg>
              Back
            </button>
            <p className="text-sm font-medium text-indigo-600">
              Acquisition Workspace
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {headerTitle}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {persisted && headerSubtitle
                ? headerSubtitle
                : "Model the full Buy · Rehab · Rent · Refinance · Repeat strategy, then save this property to your pipeline."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              Pipeline status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PipelineStatus)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                {PIPELINE_STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <SaveStatus
                saving={saving}
                dirty={dirty}
                persisted={persisted}
                lastSavedAt={lastSavedAt}
              />
              <button
                type="button"
                onClick={doSave}
                disabled={!canSave}
                className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition ${
                  canSave
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "cursor-not-allowed bg-slate-300"
                }`}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadExample}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Load Example
              </button>
              <button
                type="button"
                onClick={clearDeal}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </header>

        {/* ----------------- Property header + quick summary ---------------- */}
        <div className="mb-6 space-y-6">
          {source.sourceType !== "manual" && <SourceCard source={source} />}
          <PropertyHeader
            property={property}
            onText={updatePropertyText}
            onNum={updatePropertyNum}
            recommendation={s.recommendation}
            stars={s.stars}
            hasDeal={hasDeal}
            lastUpdated={lastSavedAt}
          />
          <QuickSummary
            items={quickItems}
            recommendation={s.recommendation}
            hasDeal={hasDeal}
          />
        </div>

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
                      changeCostMode("closingCosts", closingMode, setClosingMode, m)
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
                      changeCostMode("holdingCosts", holdingMode, setHoldingMode, m)
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
                <div className="sm:col-span-2">
                  <ArvSourceCard
                    manualArv={manualArv}
                    compArv={compArv}
                    confidence={compAnalysis.confidence}
                    comparison={arvComparison}
                    source={arvMode}
                    onChange={setArvMode}
                    effectiveArv={effectiveArv}
                  />
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
                  hint={arvMode}
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
                    label="Cash Left"
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
              results={compAnalysis}
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
              {dirty
                ? "Unsaved changes — use Save to store this property in your browser."
                : persisted
                  ? "All changes saved to this browser."
                  : "New property — fill in the details and save it to your pipeline."}
            </p>
          </div>

          {/* =========================== ANALYSIS =========================== */}
          <div className="space-y-6">
            {!hasDeal ? (
              <EmptyState onLoadExample={loadExample} />
            ) : (
              <>
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

                <DealChecklist items={checklist} />

                {warnings.length > 0 && <AssumptionWarnings items={warnings} />}

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
                      tone={r.capRate >= 6 ? "good" : r.capRate >= 4 ? "warn" : "bad"}
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

        {hasDeal && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              BRRRR Timeline
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              The full lifecycle of the property, from acquisition to monthly
              cash flow.
            </p>
            <div className="overflow-x-auto pb-2">
              <Timeline steps={timeline} />
            </div>
          </section>
        )}

        {hasDeal && (
          <div className="mt-8">
            <Sensitivity data={sens} />
          </div>
        )}

        {/* ============================== NOTES ============================== */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Private notes for this property — seller motivation, inspection
            items, negotiation strategy, anything worth remembering.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Add your notes…"
            className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          BRRRR AI · For educational estimates only — verify every number with
          your lender and run your own due diligence.
        </footer>
      </main>
    </div>
  );
  },
);

/* ------------------------------ sub-components ----------------------------- */

function SourceCard({
  source,
}: {
  source: {
    sourceType: string;
    sourceUrl?: string;
    sourceFileName?: string;
    sourceNotes?: string;
    importedAt?: number;
  };
}) {
  const label =
    source.sourceType === "link"
      ? "Imported from listing link"
      : source.sourceType === "pdf"
        ? "Imported from uploaded document"
        : source.sourceType === "csv"
          ? "Imported from CSV"
          : "Imported";
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v7.59l2.3-2.3a1 1 0 011.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.42l2.3 2.3V3a1 1 0 011-1zM4 15a1 1 0 011 1v1h10v-1a1 1 0 112 0v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-sky-900">{label}</h3>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
              {source.sourceType}
            </span>
          </div>
          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-xs font-medium text-sky-700 underline hover:text-sky-800"
            >
              {source.sourceUrl}
            </a>
          )}
          {source.sourceFileName && (
            <div className="mt-1 truncate text-xs font-medium text-slate-600">
              {source.sourceFileName}
            </div>
          )}
          {source.sourceNotes && (
            <p className="mt-1 text-xs text-slate-500">{source.sourceNotes}</p>
          )}
          {source.sourceType === "link" && (
            <p className="mt-1.5 text-xs text-sky-700/80">
              Automatic link extraction coming soon — enter the details manually
              for now.
            </p>
          )}
          {source.importedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Imported {new Date(source.importedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SaveStatus({
  saving,
  dirty,
  persisted,
  lastSavedAt,
}: {
  saving: boolean;
  dirty: boolean;
  persisted: boolean;
  lastSavedAt: number | null;
}) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Unsaved changes
      </span>
    );
  }
  if (persisted) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z"
            clipRule="evenodd"
          />
        </svg>
        Saved
        {lastSavedAt
          ? ` · ${new Date(lastSavedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""}
      </span>
    );
  }
  return <span className="text-xs font-medium text-slate-400">Not saved yet</span>;
}

function EmptyState({ onLoadExample }: { onLoadExample: () => void }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l2-2 4 4 7-7 5 5M3 6h18" />
        </svg>
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-800">
        No property to analyze yet
      </h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Enter at least a purchase price, ARV, and rent — or load the example
        property to see the full analysis.
      </p>
      <button
        type="button"
        onClick={onLoadExample}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Load Example
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
