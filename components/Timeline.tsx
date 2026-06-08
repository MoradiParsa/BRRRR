"use client";

import type { Tone } from "./ui";
import { toneText } from "./ui";

export type TimelineStep = {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  emphasis?: boolean;
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-3">
      {steps.map((s, idx) => (
        <div key={s.label} className="flex items-stretch">
          <div
            className={`flex min-w-[120px] flex-col justify-center rounded-xl border px-3 py-3 ${
              s.emphasis
                ? "border-indigo-200 bg-indigo-50/60"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {s.label}
            </div>
            <div className={`mt-0.5 text-base font-bold ${toneText(s.tone ?? "neutral")}`}>
              {s.value}
            </div>
            {s.sub && <div className="text-[10px] text-slate-400">{s.sub}</div>}
          </div>
          {idx < steps.length - 1 && (
            <div className="flex items-center px-1 text-slate-300" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
