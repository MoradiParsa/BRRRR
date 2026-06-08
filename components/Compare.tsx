"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ARV_SOURCE_LABELS,
  fmtNum,
  fmtPct,
  fmtUSD,
  gradeRank,
  type InvestmentGrade,
  type Level,
  type Recommendation,
  type Verdict,
} from "@/lib/brrrr";
import {
  compareMetrics,
  dealTitle,
  type CompareMetrics,
  type SavedDeal,
} from "@/lib/deals";
import { Stars } from "@/components/ui";

const MAX_SELECT = 4;
const MIN_SELECT = 2;

/* ------------------------------ rank helpers ------------------------------ */

const recRank = (r: Recommendation) =>
  r === "Buy" ? 3 : r === "Buy with Caution" ? 2 : 1;
const riskRank = (l: Level) => (l === "Low" ? 3 : l === "Medium" ? 2 : 1);
const verdictRank = (v: Verdict) =>
  v === "Still Works" ? 3 : v === "Tight" ? 2 : 1;

/** Which columns tie for best (empty if every value is equal). */
function highlightFlags(ranks: (number | null)[]): boolean[] {
  const valid = ranks.filter(
    (x): x is number => x !== null && !Number.isNaN(x),
  );
  if (valid.length < 2) return ranks.map(() => false);
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  if (max === min) return ranks.map(() => false);
  // Finite-safe tolerance: when the best value is Infinity (e.g. infinite DSCR
  // or cash-on-cash), eps must be 0 so only the Infinity column(s) win.
  const eps = Number.isFinite(max) ? Math.max(Math.abs(max) * 1e-9, 1e-9) : 0;
  return ranks.map(
    (x) => x !== null && !Number.isNaN(x) && x >= max - eps,
  );
}

/* ------------------------------ styling maps ------------------------------ */

function gradeColor(g: InvestmentGrade): string {
  if (g === "Pass") return "bg-red-100 text-red-700 ring-red-200";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (g.startsWith("B")) return "bg-sky-100 text-sky-700 ring-sky-200";
  return "bg-amber-100 text-amber-700 ring-amber-200";
}
const recTextColor = (r: Recommendation) =>
  r === "Buy"
    ? "text-emerald-600"
    : r === "Buy with Caution"
      ? "text-amber-600"
      : "text-red-600";
const riskTextColor = (l: Level) =>
  l === "Low" ? "text-emerald-600" : l === "Medium" ? "text-amber-600" : "text-red-600";
const verdictBadge = (v: Verdict) =>
  v === "Still Works"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : v === "Tight"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-red-50 text-red-700 ring-red-200";

/* --------------------------------- rows ----------------------------------- */

type Ctx = { deal: SavedDeal; m: CompareMetrics };

type Row =
  | { kind: "section"; label: string }
  | {
      kind: "metric";
      label: string;
      cell: (c: Ctx) => ReactNode;
      rank?: (c: Ctx) => number;
    };

const ROWS: Row[] = [
  { kind: "section", label: "Overview" },
  {
    kind: "metric",
    label: "Recommendation",
    cell: ({ m }) => (
      <span className={`font-semibold ${recTextColor(m.recommendation)}`}>
        {m.hasDeal ? m.recommendation : "Incomplete"}
      </span>
    ),
    rank: ({ m }) => recRank(m.recommendation),
  },
  {
    kind: "metric",
    label: "Investment Grade",
    cell: ({ m }) => (
      <span
        className={`inline-flex rounded-md px-2 py-0.5 text-sm font-extrabold ring-1 ring-inset ${gradeColor(m.grade)}`}
      >
        {m.grade}
      </span>
    ),
    rank: ({ m }) => -gradeRank(m.grade),
  },
  {
    kind: "metric",
    label: "Investment Score",
    cell: ({ m }) => <span className="font-semibold">{m.score}/100</span>,
    rank: ({ m }) => m.score,
  },
  {
    kind: "metric",
    label: "Star Rating",
    cell: ({ m }) => (
      <span className="flex items-center gap-1.5">
        <Stars value={m.stars} size="sm" />
        <span className="text-xs font-bold text-slate-500">
          {fmtNum(m.stars, 1)}
        </span>
      </span>
    ),
    rank: ({ m }) => m.stars,
  },
  {
    kind: "metric",
    label: "Risk Level",
    cell: ({ m }) => (
      <span className={`font-semibold ${riskTextColor(m.risk)}`}>{m.risk}</span>
    ),
    rank: ({ m }) => riskRank(m.risk),
  },

  { kind: "section", label: "Acquisition" },
  { kind: "metric", label: "Purchase Price", cell: ({ m }) => fmtUSD(m.purchasePrice) },
  { kind: "metric", label: "Rehab Cost", cell: ({ m }) => fmtUSD(m.rehabCost) },
  { kind: "metric", label: "Cash Invested", cell: ({ m }) => fmtUSD(m.cashInvested) },
  { kind: "metric", label: "ARV Used", cell: ({ m }) => fmtUSD(m.arvUsed) },
  {
    kind: "metric",
    label: "ARV Source",
    cell: ({ m }) => ARV_SOURCE_LABELS[m.arvSource],
  },
  { kind: "metric", label: "Monthly Rent", cell: ({ m }) => fmtUSD(m.monthlyRent) },

  { kind: "section", label: "Returns" },
  {
    kind: "metric",
    label: "Monthly Cash Flow",
    cell: ({ m }) => fmtUSD(m.monthlyCashFlow),
    rank: ({ m }) => m.monthlyCashFlow,
  },
  {
    kind: "metric",
    label: "Annual Cash Flow",
    cell: ({ m }) => fmtUSD(m.annualCashFlow),
    rank: ({ m }) => m.annualCashFlow,
  },
  {
    kind: "metric",
    label: "DSCR",
    cell: ({ m }) => fmtNum(m.dscr),
    rank: ({ m }) => m.dscr,
  },
  {
    kind: "metric",
    label: "Cap Rate",
    cell: ({ m }) => fmtPct(m.capRate),
    rank: ({ m }) => m.capRate,
  },
  {
    kind: "metric",
    label: "Cash-on-Cash Return",
    cell: ({ m }) => fmtPct(m.cashOnCash),
    rank: ({ m }) => m.cashOnCash,
  },

  { kind: "section", label: "Capital Recovery" },
  {
    kind: "metric",
    label: "Capital Recovery %",
    cell: ({ m }) => fmtPct(m.capitalRecoveryPct, 0),
    rank: ({ m }) => m.capitalRecoveryPct,
  },
  {
    kind: "metric",
    label: "Cash Left",
    cell: ({ m }) => fmtUSD(m.cashLeftInDeal),
    rank: ({ m }) => -m.cashLeftInDeal,
  },
  {
    kind: "metric",
    label: "Cash Out Surplus",
    cell: ({ m }) => fmtUSD(m.cashOutSurplus),
    rank: ({ m }) => m.cashOutSurplus,
  },
  {
    kind: "metric",
    label: "Equity Created",
    cell: ({ m }) => fmtUSD(m.equityCreated),
    rank: ({ m }) => m.equityCreated,
  },

  { kind: "section", label: "Rent & Risk" },
  {
    kind: "metric",
    label: "Break-even Rent",
    cell: ({ m }) => fmtUSD(m.breakEvenRent),
    rank: ({ m }) => -m.breakEvenRent,
  },
  {
    kind: "metric",
    label: "Required Rent (DSCR 1.20)",
    cell: ({ m }) => fmtUSD(m.rentForDSCR120),
    rank: ({ m }) => -m.rentForDSCR120,
  },
  {
    kind: "metric",
    label: "Worst-Case Sensitivity",
    cell: ({ m }) => (
      <span className="flex flex-col gap-1">
        <span
          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${verdictBadge(m.worstCaseVerdict)}`}
        >
          {m.worstCaseVerdict}
        </span>
        <span className="text-xs text-slate-400">
          {fmtUSD(m.worstCaseCashFlow)}/mo
        </span>
      </span>
    ),
    rank: ({ m }) => verdictRank(m.worstCaseVerdict),
  },
];

/* -------------------------------- component ------------------------------- */

export function Compare({
  deals,
  onOpen,
}: {
  deals: SavedDeal[];
  onOpen: (id: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    [...deals]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, 3)
      .map((d) => d.id),
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
  };

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => deals.find((d) => d.id === id))
        .filter((d): d is SavedDeal => Boolean(d)),
    [selectedIds, deals],
  );

  const cols = useMemo<Ctx[]>(
    () => selected.map((deal) => ({ deal, m: compareMetrics(deal) })),
    [selected],
  );

  if (deals.length < MIN_SELECT) {
    return (
      <Shell>
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 2v18M4 6h3v12H4zM15 9h3v9h-3z" />
            </svg>
          </span>
          <h2 className="mt-5 text-lg font-bold text-slate-800">
            Nothing to compare yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Save at least two properties to compare opportunities.
          </p>
        </div>
      </Shell>
    );
  }

  const atMax = selectedIds.length >= MAX_SELECT;

  return (
    <Shell>
      {/* Selection */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Select properties to compare
          </h2>
          <span className="text-xs font-medium text-slate-400">
            {selectedIds.length} of {MAX_SELECT} selected · min {MIN_SELECT}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal) => {
            const isSel = selectedIds.includes(deal.id);
            const disabled = !isSel && atMax;
            return (
              <button
                key={deal.id}
                type="button"
                onClick={() => toggle(deal.id)}
                disabled={disabled}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  isSel
                    ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200"
                    : disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                    isSel ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300"
                  }`}
                >
                  {isSel && (
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {dealTitle(deal)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {deal.property.address.trim() || "No address"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selected.length < MIN_SELECT ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Select at least {MIN_SELECT} deals to see the comparison.
        </div>
      ) : (
        <>
          <WinnerSummary cols={cols} />
          <ComparisonTable cols={cols} onOpen={onOpen} onDeselect={toggle} />
        </>
      )}
    </Shell>
  );
}

/* ------------------------------ winner summary ---------------------------- */

function bestIndex(cols: Ctx[], cmp: (a: Ctx, b: Ctx) => number): number {
  let bi = 0;
  for (let i = 1; i < cols.length; i++) {
    if (cmp(cols[i], cols[bi]) > 0) bi = i;
  }
  return bi;
}

function WinnerSummary({ cols }: { cols: Ctx[] }) {
  const overall = cols[
    bestIndex(
      cols,
      (a, b) =>
        a.m.score - b.m.score ||
        recRank(a.m.recommendation) - recRank(b.m.recommendation) ||
        a.m.monthlyCashFlow - b.m.monthlyCashFlow,
    )
  ];
  const cashFlow = cols[
    bestIndex(cols, (a, b) => a.m.monthlyCashFlow - b.m.monthlyCashFlow)
  ];
  const capital = cols[
    bestIndex(cols, (a, b) => a.m.capitalRecoveryPct - b.m.capitalRecoveryPct)
  ];
  const lowRisk = cols[
    bestIndex(
      cols,
      (a, b) =>
        riskRank(a.m.risk) - riskRank(b.m.risk) || a.m.score - b.m.score,
    )
  ];

  return (
    <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <WinnerCard
        label="Best Overall"
        name={dealTitle(overall.deal)}
        value={`${overall.m.grade} · ${overall.m.score}/100`}
        accent="from-indigo-500 to-violet-500"
      />
      <WinnerCard
        label="Best Cash Flow"
        name={dealTitle(cashFlow.deal)}
        value={`${fmtUSD(cashFlow.m.monthlyCashFlow)}/mo`}
        accent="from-emerald-500 to-teal-500"
      />
      <WinnerCard
        label="Best Capital Recovery"
        name={dealTitle(capital.deal)}
        value={fmtPct(capital.m.capitalRecoveryPct, 0)}
        accent="from-sky-500 to-blue-500"
      />
      <WinnerCard
        label="Lowest Risk"
        name={dealTitle(lowRisk.deal)}
        value={`${lowRisk.m.risk} risk`}
        accent="from-amber-500 to-orange-500"
      />
    </section>
  );
}

function WinnerCard({
  label,
  name,
  value,
  accent,
}: {
  label: string;
  name: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`bg-gradient-to-r ${accent} px-4 py-2`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-white/90">
          {label}
        </span>
      </div>
      <div className="p-4">
        <div className="truncate text-base font-bold text-slate-900">{name}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-500">{value}</div>
      </div>
    </div>
  );
}

/* ------------------------------ comparison table -------------------------- */

function ComparisonTable({
  cols,
  onOpen,
  onDeselect,
}: {
  cols: Ctx[];
  onOpen: (id: string) => void;
  onDeselect: (id: string) => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-44 min-w-44 border-b border-slate-200 bg-slate-50 p-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Metric
              </th>
              {cols.map(({ deal, m }) => (
                <th
                  key={deal.id}
                  className="min-w-[200px] border-b border-l border-slate-100 bg-white p-3 text-left align-top"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">
                        {dealTitle(deal)}
                      </div>
                      <div className="truncate text-xs font-normal text-slate-500">
                        {deal.property.address.trim() || "No address"}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-extrabold ring-1 ring-inset ${gradeColor(m.grade)}`}
                    >
                      {m.grade}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(deal.id)}
                      className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white transition hover:bg-slate-700"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeselect(deal.id)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              if (row.kind === "section") {
                return (
                  <tr key={`s-${ri}`}>
                    <td
                      colSpan={cols.length + 1}
                      className="sticky left-0 bg-slate-100/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const ranks = row.rank
                ? cols.map((c) => row.rank!(c))
                : cols.map(() => null);
              const flags = highlightFlags(ranks);
              return (
                <tr key={row.label} className="border-b border-slate-50">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-slate-100 bg-white p-3 text-left text-xs font-medium text-slate-500"
                  >
                    {row.label}
                  </th>
                  {cols.map((c, ci) => (
                    <td
                      key={c.deal.id}
                      className={`border-l border-slate-50 p-3 align-middle ${
                        flags[ci]
                          ? "bg-emerald-50 font-semibold text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {flags[ci] && (
                          <svg
                            viewBox="0 0 20 20"
                            className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                            fill="currentColor"
                            aria-label="Best"
                          >
                            <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.98 4.8 17.5l.99-5.79-4.21-4.1 5.82-.85L10 1.5z" />
                          </svg>
                        )}
                        <span>{row.cell(c)}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --------------------------------- shell ---------------------------------- */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-medium text-indigo-600">Side by side</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Compare
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Stack 2–4 saved properties against each other. The best value in each
          row is highlighted.
        </p>
      </div>
      {children}
    </div>
  );
}
