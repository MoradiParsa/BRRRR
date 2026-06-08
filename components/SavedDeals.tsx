"use client";

import { useMemo, useState } from "react";
import {
  fmtNum,
  fmtPct,
  fmtUSD,
  gradeRank,
  type InvestmentGrade,
  type Recommendation,
} from "@/lib/brrrr";
import {
  dealMetrics,
  dealTitle,
  type DealMetrics,
  type SavedDeal,
} from "@/lib/deals";
import { Stars } from "@/components/ui";

type SortKey = "updated" | "cashflow" | "grade" | "arv" | "rent";
type FilterKey = "all" | Recommendation;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Last Updated" },
  { value: "cashflow", label: "Cash Flow" },
  { value: "grade", label: "Investment Grade" },
  { value: "arv", label: "ARV" },
  { value: "rent", label: "Monthly Rent" },
];

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Buy", label: "Buy" },
  { value: "Buy with Caution", label: "Buy with Caution" },
  { value: "Pass", label: "Pass" },
];

function gradeColor(g: InvestmentGrade): string {
  if (g === "Pass") return "bg-red-100 text-red-700 ring-red-200";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (g.startsWith("B")) return "bg-sky-100 text-sky-700 ring-sky-200";
  return "bg-amber-100 text-amber-700 ring-amber-200";
}

function recColor(rec: Recommendation): string {
  return rec === "Buy"
    ? "text-emerald-600"
    : rec === "Buy with Caution"
      ? "text-amber-600"
      : "text-red-600";
}

export function SavedDeals({
  deals,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
}: {
  deals: SavedDeal[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("updated");

  const rows = useMemo(
    () => deals.map((deal) => ({ deal, metrics: dealMetrics(deal) })),
    [deals],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(({ deal }) =>
        `${deal.property.name} ${deal.property.address} ${deal.property.cityState}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (filter !== "all") {
      list = list.filter(({ metrics }) => metrics.recommendation === filter);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "cashflow":
          return b.metrics.monthlyCashFlow - a.metrics.monthlyCashFlow;
        case "grade":
          return gradeRank(a.metrics.grade) - gradeRank(b.metrics.grade);
        case "arv":
          return b.metrics.arv - a.metrics.arv;
        case "rent":
          return b.metrics.monthlyRent - a.metrics.monthlyRent;
        default:
          return b.deal.savedAt - a.deal.savedAt;
      }
    });
    return sorted;
  }, [rows, search, filter, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Greeting + new deal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Your pipeline</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Saved Deals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {deals.length === 0
              ? "Your acquisition pipeline starts here."
              : `${deals.length} deal${deals.length === 1 ? "" : "s"} in your pipeline.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
          </svg>
          New Deal
        </button>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 103.4 9.8l3.15 3.15a1 1 0 001.4-1.4l-3.14-3.15A5.5 5.5 0 009 3.5zm-3.5 5.5a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or address"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f.value
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Cards / empty states */}
      {deals.length === 0 ? (
        <EmptyDashboard onNew={onNew} />
      ) : visible.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No deals match your search or filters.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ deal, metrics }) => (
            <DealCard
              key={deal.id}
              deal={deal}
              metrics={metrics}
              onOpen={() => onOpen(deal.id)}
              onDuplicate={() => onDuplicate(deal.id)}
              onDelete={() => onDelete(deal.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DealCard({
  deal,
  metrics,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  deal: SavedDeal;
  metrics: DealMetrics;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const surplus = metrics.cashOutSurplus > 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">
            {dealTitle(deal)}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[deal.property.address, deal.property.cityState]
              .filter((s) => s.trim())
              .join(" · ") || "No address"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-extrabold ring-1 ring-inset ${gradeColor(metrics.grade)}`}
        >
          {metrics.grade}
        </span>
      </div>

      {/* Recommendation + stars */}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-sm font-semibold ${recColor(metrics.recommendation)}`}>
          {metrics.hasDeal ? metrics.recommendation : "Incomplete"}
        </span>
        <span className="flex items-center gap-1.5">
          <Stars value={metrics.stars} size="sm" />
          <span className="text-xs font-bold text-slate-500">
            {fmtNum(metrics.stars, 1)}
          </span>
        </span>
      </div>

      {/* Metrics grid */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
        <Metric label="Purchase Price" value={fmtUSD(metrics.purchasePrice)} />
        <Metric label="ARV" value={fmtUSD(metrics.arv)} />
        <Metric
          label="Monthly Cash Flow"
          value={fmtUSD(metrics.monthlyCashFlow)}
          tone={
            metrics.monthlyCashFlow >= 200
              ? "good"
              : metrics.monthlyCashFlow >= 0
                ? "warn"
                : "bad"
          }
        />
        <Metric
          label="Capital Recovery"
          value={fmtPct(metrics.capitalRecoveryPct, 0)}
        />
        <Metric
          label={surplus ? "Cash Out Surplus" : "Cash Left in Deal"}
          value={fmtUSD(surplus ? metrics.cashOutSurplus : metrics.cashLeftInDeal)}
          tone={surplus || metrics.cashLeftInDeal <= 0 ? "good" : "neutral"}
        />
        <Metric
          label="DSCR"
          value={fmtNum(metrics.dscr)}
          tone={
            !isFinite(metrics.dscr) || metrics.dscr >= 1.2
              ? "good"
              : metrics.dscr >= 1.05
                ? "warn"
                : "bad"
          }
        />
      </dl>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[11px] text-slate-400">
          Updated{" "}
          {new Date(deal.savedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Delete?</span>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white transition hover:bg-red-700"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              No
            </button>
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpen}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              Open
            </button>
            <IconButton label="Duplicate" onClick={onDuplicate}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
                <path d="M3 7a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </IconButton>
            <IconButton label="Delete" onClick={() => setConfirming(true)} danger>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8 2a1 1 0 00-1 1v1H4a1 1 0 100 2h12a1 1 0 100-2h-3V3a1 1 0 00-1-1H8zM6 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className={`text-sm font-bold ${color}`}>{value}</dd>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition ${
        danger
          ? "hover:border-red-300 hover:bg-red-50 hover:text-red-500"
          : "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyDashboard({ onNew }: { onNew: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </span>
      <h3 className="mt-5 text-lg font-bold text-slate-800">No deals yet</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Create your first deal to start analyzing acquisitions, comparing
        properties, and building your portfolio.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
        </svg>
        Create your first deal
      </button>
    </div>
  );
}
