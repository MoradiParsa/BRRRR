"use client";

import { useMemo, useState } from "react";
import {
  fmtNum,
  fmtPct,
  fmtUSD,
} from "@/lib/brrrr";
import { dealMetrics, dealTitle, type DealMetrics } from "@/lib/deals";
import { compareOpportunity } from "@/lib/scanner";
import {
  QUEUE_STATUS_LABELS,
  type QueueItem,
  type QueueStatus,
} from "@/lib/dealQueue";
import { gradeColor, recColor } from "@/components/ui";

type FilterKey = "inbox" | "watching" | "analyzing" | "ignored" | "promoted" | "all";

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "watching", label: "Watching" },
  { value: "analyzing", label: "Analyzing" },
  { value: "promoted", label: "In Pipeline" },
  { value: "ignored", label: "Ignored" },
  { value: "all", label: "All" },
];

function statusBadge(s: QueueStatus): string {
  switch (s) {
    case "new":
      return "bg-indigo-100 text-indigo-700 ring-indigo-200";
    case "watching":
      return "bg-sky-100 text-sky-700 ring-sky-200";
    case "analyzing":
      return "bg-amber-100 text-amber-700 ring-amber-200";
    case "promoted":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "ignored":
      return "bg-slate-200 text-slate-500 ring-slate-300";
  }
}

export function DealQueue({
  items,
  onIgnore,
  onWatch,
  onAnalyze,
  onAddToPipeline,
  onRestore,
  onRemove,
  onGoToScanner,
}: {
  items: QueueItem[];
  onIgnore: (id: string) => void;
  onWatch: (id: string) => void;
  onAnalyze: (item: QueueItem) => void;
  onAddToPipeline: (item: QueueItem) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onGoToScanner: () => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("inbox");

  const rows = useMemo(
    () =>
      items
        .map((it) => ({ it, m: dealMetrics(it.deal) }))
        .sort((a, b) => compareOpportunity(a.m, b.m)),
    [items],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      inbox: 0,
      watching: 0,
      analyzing: 0,
      ignored: 0,
      promoted: 0,
      all: items.length,
    };
    for (const it of items) {
      if (it.queueStatus === "ignored") c.ignored++;
      else if (it.queueStatus === "promoted") c.promoted++;
      else {
        c.inbox++;
        if (it.queueStatus === "watching") c.watching++;
        if (it.queueStatus === "analyzing") c.analyzing++;
      }
    }
    return c;
  }, [items]);

  const visible = rows.filter(({ it }) => {
    switch (filter) {
      case "all":
        return true;
      case "inbox":
        return it.queueStatus !== "ignored" && it.queueStatus !== "promoted";
      default:
        return it.queueStatus === filter;
    }
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Review inbox</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Deal Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Triage opportunities the Scanner found. Promote the ones worth pursuing
            into your Acquisition Pipeline.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToScanner}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Open Scanner
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyQueue onGoToScanner={onGoToScanner} />
      ) : visible.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Nothing in this view.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visible.map(({ it, m }) => (
            <QueueCard
              key={it.id}
              item={it}
              metrics={m}
              onIgnore={() => onIgnore(it.id)}
              onWatch={() => onWatch(it.id)}
              onAnalyze={() => onAnalyze(it)}
              onAddToPipeline={() => onAddToPipeline(it)}
              onRestore={() => onRestore(it.id)}
              onRemove={() => onRemove(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({
  item,
  metrics,
  onIgnore,
  onWatch,
  onAnalyze,
  onAddToPipeline,
  onRestore,
  onRemove,
}: {
  item: QueueItem;
  metrics: DealMetrics;
  onIgnore: () => void;
  onWatch: () => void;
  onAnalyze: () => void;
  onAddToPipeline: () => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  const { deal } = item;
  const surplus = metrics.cashOutSurplus > 0;
  const tracking = deal.tracking;
  const priceDrop =
    tracking && tracking.priceChange != null && tracking.priceChange < 0;
  const priceUp =
    tracking && tracking.priceChange != null && tracking.priceChange > 0;
  const muted = item.queueStatus === "ignored" || item.queueStatus === "promoted";

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
        muted ? "border-slate-200 opacity-75" : "border-slate-200 hover:border-slate-300 hover:shadow-md"
      }`}
    >
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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
              {item.sourceLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusBadge(item.queueStatus)}`}
            >
              {QUEUE_STATUS_LABELS[item.queueStatus]}
            </span>
            {priceDrop && (
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                ↓ {fmtUSD(Math.abs(tracking!.priceChange!))} price drop
              </span>
            )}
            {priceUp && (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-600">
                ↑ {fmtUSD(tracking!.priceChange!)}
              </span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-extrabold ring-1 ring-inset ${gradeColor(metrics.grade)}`}
        >
          {metrics.grade}
        </span>
      </div>

      {/* Recommendation */}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-sm font-semibold ${recColor(metrics.recommendation)}`}>
          {metrics.hasDeal ? metrics.recommendation : "Incomplete"}
        </span>
        {deal.sourceUrl && (
          <a
            href={deal.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-indigo-600 underline hover:text-indigo-700"
          >
            Open listing ↗
          </a>
        )}
      </div>

      {/* Metrics */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <Metric label="Price" value={fmtUSD(metrics.purchasePrice)} />
        <Metric label="Beds / Baths" value={`${deal.subject.beds ?? "—"} / ${deal.subject.baths ?? "—"}`} />
        <Metric label="Sq Ft" value={deal.subject.sqft != null ? deal.subject.sqft.toLocaleString() : "—"} />
        <Metric
          label="Cash Flow"
          value={fmtUSD(metrics.monthlyCashFlow)}
          tone={metrics.monthlyCashFlow >= 200 ? "good" : metrics.monthlyCashFlow >= 0 ? "warn" : "bad"}
        />
        <Metric
          label="DSCR"
          value={fmtNum(metrics.dscr)}
          tone={!isFinite(metrics.dscr) || metrics.dscr >= 1.2 ? "good" : metrics.dscr >= 1.05 ? "warn" : "bad"}
        />
        <Metric label="Capital Recovery" value={fmtPct(metrics.capitalRecoveryPct, 0)} />
        <Metric
          label={surplus ? "Cash Out Surplus" : "Cash Left"}
          value={fmtUSD(surplus ? metrics.cashOutSurplus : metrics.cashLeftInDeal)}
          tone={surplus || metrics.cashLeftInDeal <= 0 ? "good" : "neutral"}
        />
        <Metric label="ARV Used" value={fmtUSD(metrics.arv)} />
      </dl>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {item.queueStatus === "ignored" ? (
          <>
            <ActionButton onClick={onRestore}>Restore</ActionButton>
            <ActionButton onClick={onRemove} subtle>
              Remove
            </ActionButton>
          </>
        ) : item.queueStatus === "promoted" ? (
          <>
            <span className="text-xs font-medium text-emerald-600">
              Added to Acquisition Pipeline
            </span>
            <ActionButton onClick={onRemove} subtle>
              Remove
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton onClick={onAddToPipeline} primary>
              Add to Pipeline
            </ActionButton>
            <ActionButton onClick={onAnalyze}>Analyze</ActionButton>
            <ActionButton onClick={onWatch}>Watch</ActionButton>
            <ActionButton onClick={onIgnore} subtle>
              Ignore
            </ActionButton>
          </>
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

function ActionButton({
  children,
  onClick,
  primary,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  subtle?: boolean;
}) {
  const cls = primary
    ? "bg-indigo-600 text-white hover:bg-indigo-700"
    : subtle
      ? "text-slate-400 hover:text-slate-600"
      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${cls}`}
    >
      {children}
    </button>
  );
}

function EmptyQueue({ onGoToScanner }: { onGoToScanner: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
      <h3 className="text-lg font-bold text-slate-800">Your Deal Queue is empty</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Run the Universal Property Scanner to find opportunities. Matches land here
        for review before you add them to your pipeline.
      </p>
      <button
        type="button"
        onClick={onGoToScanner}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        Open Scanner
      </button>
    </div>
  );
}
