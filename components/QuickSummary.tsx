"use client";

import type { Recommendation } from "@/lib/brrrr";
import { toneText, type Tone } from "@/components/ui";

export type SummaryItem = { label: string; value: string; tone?: Tone };

const recBadge: Record<Recommendation, string> = {
  Buy: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Buy with Caution": "bg-amber-50 text-amber-700 ring-amber-200",
  Pass: "bg-red-50 text-red-700 ring-red-200",
};

export function QuickSummary({
  items,
  recommendation,
  hasDeal,
}: {
  items: SummaryItem[];
  recommendation: Recommendation;
  hasDeal: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick Summary
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ring-inset ${
            hasDeal ? recBadge[recommendation] : "bg-slate-100 text-slate-500 ring-slate-200"
          }`}
        >
          {hasDeal ? recommendation : "No deal yet"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {it.label}
            </div>
            <div className={`mt-0.5 text-lg font-bold ${toneText(it.tone ?? "neutral")}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
