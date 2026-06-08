"use client";

import { useMemo } from "react";
import { fmtNum, fmtUSD, type InvestmentGrade } from "@/lib/brrrr";
import {
  dealMetrics,
  dealTitle,
  portfolioSummary,
  type SavedDeal,
} from "@/lib/deals";

function gradeColor(g: InvestmentGrade): string {
  if (g === "Pass") return "bg-red-100 text-red-700 ring-red-200";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (g.startsWith("B")) return "bg-sky-100 text-sky-700 ring-sky-200";
  return "bg-amber-100 text-amber-700 ring-amber-200";
}

export function DashboardHome({
  deals,
  onNew,
  onOpen,
  onViewAll,
}: {
  deals: SavedDeal[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}) {
  const summary = useMemo(() => portfolioSummary(deals), [deals]);
  const recent = useMemo(
    () =>
      [...deals]
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, 5)
        .map((deal) => ({ deal, m: dealMetrics(deal) })),
    [deals],
  );

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
            A high-level view of your acquisition pipeline.
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

      {deals.length === 0 ? (
        <EmptyOverview onNew={onNew} />
      ) : (
        <>
          {/* Overview stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Saved Deals" value={String(summary.totalDeals)} />
            <Stat
              label="Buy-Rated"
              value={String(summary.buyCount)}
              tone="good"
            />
            <Stat
              label="Avg Score"
              value={summary.completeCount ? `${summary.avgScore}/100` : "—"}
            />
            <Stat
              label="Total Cash Flow"
              value={`${fmtUSD(summary.totalMonthlyCashFlow)}/mo`}
              tone={summary.totalMonthlyCashFlow >= 0 ? "good" : "bad"}
            />
          </div>

          {/* Recommendation breakdown + equity */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Pipeline Mix
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <MixPill label="Buy" count={summary.buyCount} tone="good" />
                <MixPill
                  label="Caution"
                  count={summary.cautionCount}
                  tone="warn"
                />
                <MixPill label="Pass" count={summary.passCount} tone="bad" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Forced Equity
              </h2>
              <div className="mt-3 text-2xl font-bold text-emerald-600">
                {fmtUSD(summary.totalEquityCreated)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Combined equity created across complete deals.
              </p>
            </div>
          </div>

          {/* Recent deals */}
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent Deals
            </h2>
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
            >
              View all →
            </button>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {recent.map(({ deal, m }) => (
                <li
                  key={deal.id}
                  className="flex items-center gap-4 p-4 transition hover:bg-slate-50"
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
                    <div className="truncate text-xs text-slate-500">
                      {deal.property.address.trim() || "No address"}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Cash Flow
                    </div>
                    <div
                      className={`text-sm font-bold ${
                        m.monthlyCashFlow >= 0
                          ? "text-slate-800"
                          : "text-red-600"
                      }`}
                    >
                      {fmtUSD(m.monthlyCashFlow)}/mo
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right md:block">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Score
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {m.hasDeal ? `${m.score}` : "—"}
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
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const color =
    tone === "good"
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

function MixPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "good" | "warn" | "bad";
}) {
  const map = {
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    bad: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-xl ${map[tone]} px-3 py-3 text-center`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function EmptyOverview({ onNew }: { onNew: () => void }) {
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
        Create your first deal to start building your acquisition dashboard.
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
