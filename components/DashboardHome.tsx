"use client";

import { useMemo } from "react";
import { fmtUSD, investmentGrade, type InvestmentGrade } from "@/lib/brrrr";
import {
  dealMetrics,
  dealTitle,
  portfolioSummary,
  statusLabel,
  type DealMetrics,
  type PipelineStatus,
  type SavedDeal,
} from "@/lib/deals";
import { statusColor } from "@/components/AcquisitionPipeline";

function gradeColor(g: InvestmentGrade): string {
  if (g === "Pass") return "bg-red-100 text-red-700 ring-red-200";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (g.startsWith("B")) return "bg-sky-100 text-sky-700 ring-sky-200";
  return "bg-amber-100 text-amber-700 ring-amber-200";
}

const OVERVIEW_STAGES: PipelineStatus[] = [
  "watching",
  "analyzing",
  "offer_submitted",
  "under_contract",
  "owned",
];

const ACTIVE_STAGES: PipelineStatus[] = [
  "watching",
  "analyzing",
  "offer_submitted",
  "under_contract",
];

export function DashboardHome({
  deals,
  onAddProperty,
  onOpen,
  onViewAll,
}: {
  deals: SavedDeal[];
  onAddProperty: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}) {
  const summary = useMemo(() => portfolioSummary(deals), [deals]);
  const rows = useMemo(
    () => deals.map((deal) => ({ deal, m: dealMetrics(deal) })),
    [deals],
  );
  const recent = useMemo(
    () => [...rows].sort((a, b) => b.deal.savedAt - a.deal.savedAt).slice(0, 5),
    [rows],
  );
  const highPriority = useMemo(
    () =>
      rows
        .filter(
          ({ deal, m }) => m.hasDeal && ACTIVE_STAGES.includes(deal.status),
        )
        .sort((a, b) => b.m.score - a.m.score)
        .slice(0, 5),
    [rows],
  );

  const avgGrade =
    summary.completeCount > 0
      ? investmentGrade(summary.avgScore, "Buy")
      : "—";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your acquisition command center.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddProperty}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
          </svg>
          Add Property
        </button>
      </div>

      {deals.length === 0 ? (
        <EmptyOverview onAddProperty={onAddProperty} />
      ) : (
        <>
          {/* Pipeline overview */}
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pipeline Overview
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {OVERVIEW_STAGES.map((s) => (
              <div
                key={s}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusColor(s)}`}
                >
                  {statusLabel(s)}
                </span>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {summary.statusCounts[s]}
                </div>
              </div>
            ))}
          </div>

          {/* Averages */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Total Properties" value={String(summary.totalDeals)} />
            <Stat
              label="Average Investment Grade"
              value={avgGrade}
              accent
            />
            <Stat
              label="Average Cash Flow"
              value={
                summary.completeCount
                  ? `${fmtUSD(summary.avgMonthlyCashFlow)}/mo`
                  : "—"
              }
              tone={summary.avgMonthlyCashFlow >= 0 ? "good" : "bad"}
            />
          </div>

          {/* Two columns: high priority + recent */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PropertyList
              title="High Priority Properties"
              emptyText="No active properties with analysis yet."
              rows={highPriority}
              onOpen={onOpen}
              showScore
            />
            <PropertyList
              title="Recent Properties"
              emptyText="No properties yet."
              rows={recent}
              onOpen={onOpen}
              onViewAll={onViewAll}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PropertyList({
  title,
  emptyText,
  rows,
  onOpen,
  onViewAll,
  showScore,
}: {
  title: string;
  emptyText: string;
  rows: { deal: SavedDeal; m: DealMetrics }[];
  onOpen: (id: string) => void;
  onViewAll?: () => void;
  showScore?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-indigo-600 transition hover:text-indigo-700"
          >
            View all →
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(({ deal, m }) => (
            <li
              key={deal.id}
              className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
            >
              <span
                className={`shrink-0 rounded-lg px-2 py-1 text-sm font-extrabold ring-1 ring-inset ${gradeColor(m.grade)}`}
              >
                {m.grade}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {dealTitle(deal)}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusColor(deal.status)}`}
                  >
                    {statusLabel(deal.status)}
                  </span>
                  <span className="truncate text-xs text-slate-400">
                    {deal.property.address.trim() || "No address"}
                  </span>
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {showScore ? "Score" : "Cash Flow"}
                </div>
                <div
                  className={`text-sm font-bold ${
                    showScore
                      ? "text-slate-800"
                      : m.monthlyCashFlow >= 0
                        ? "text-slate-800"
                        : "text-red-600"
                  }`}
                >
                  {showScore
                    ? m.hasDeal
                      ? m.score
                      : "—"
                    : `${fmtUSD(m.monthlyCashFlow)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpen(deal.id)}
                className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  accent,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
  accent?: boolean;
}) {
  const color = accent
    ? "text-indigo-600"
    : tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-red-600"
        : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function EmptyOverview({ onAddProperty }: { onAddProperty: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </span>
      <h3 className="mt-5 text-lg font-bold text-slate-800">
        Your pipeline is empty
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Add your first property to start building your acquisition command
        center.
      </p>
      <button
        type="button"
        onClick={onAddProperty}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
        </svg>
        Add Property
      </button>
    </div>
  );
}
