"use client";

import {
  arvForSource,
  fmtPct,
  fmtUSD,
  type ArvComparison,
  type ArvSource,
  type Level,
} from "@/lib/brrrr";

const SOURCES: { value: ArvSource; label: string; hint: string }[] = [
  { value: "manual", label: "Manual ARV", hint: "your entered value" },
  { value: "comp", label: "Comparable Sales ARV", hint: "from comps" },
  { value: "conservative", label: "Conservative", hint: "lower of the two" },
  { value: "average", label: "Average of the two", hint: "" },
  { value: "aggressive", label: "Aggressive", hint: "higher of the two" },
];

const confBadge: Record<Level, string> = {
  High: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function ArvSourceCard({
  manualArv,
  compArv,
  confidence,
  comparison,
  source,
  onChange,
  effectiveArv,
}: {
  manualArv: number;
  compArv: number;
  confidence: Level;
  comparison: ArvComparison | null;
  source: ArvSource;
  onChange: (s: ArvSource) => void;
  effectiveArv: number;
}) {
  const compReady = compArv > 0;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-800">
          ARV Source
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${confBadge[confidence]}`}
        >
          {confidence} confidence
        </span>
      </div>

      {/* At-a-glance stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Manual ARV" value={fmtUSD(manualArv)} />
        <Stat
          label="Comparable ARV"
          value={compReady ? fmtUSD(compArv) : "—"}
        />
        <Stat
          label="Difference"
          value={comparison ? signedPct(comparison.pctDiff) : "—"}
          tone={
            comparison
              ? comparison.tone === "good"
                ? "good"
                : "warn"
              : "neutral"
          }
        />
        <Stat label="Currently Using" value={fmtUSD(effectiveArv)} tone="use" />
      </div>

      {/* Comparison message */}
      {comparison && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            comparison.tone === "good"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          <span className="font-bold">{comparison.tone === "good" ? "✓" : "⚠"}</span>
          <span>
            {comparison.message}{" "}
            <span className="opacity-80">
              ({signedPct(comparison.pctDiff)},{" "}
              {comparison.dollarDiff >= 0 ? "+" : "−"}
              {fmtUSD(Math.abs(comparison.dollarDiff))} vs comps)
            </span>
          </span>
        </div>
      )}

      {/* Source selector */}
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-medium text-slate-600">
          Currently Using
        </div>
        <div className="space-y-1.5">
          {SOURCES.map((s) => {
            const val = arvForSource(s.value, manualArv, compArv);
            const selected = source === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange(s.value)}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                  selected
                    ? "border-violet-400 bg-white ring-2 ring-violet-200"
                    : "border-slate-200 bg-white/60 hover:border-slate-300"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                      selected ? "border-violet-500" : "border-slate-300"
                    }`}
                  >
                    {selected && (
                      <span className="h-2 w-2 rounded-full bg-violet-500" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {s.label}
                    {s.hint && (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        ({s.hint})
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    selected ? "text-violet-700" : "text-slate-500"
                  }`}
                >
                  {fmtUSD(val)}
                </span>
              </button>
            );
          })}
        </div>
        {!compReady && (
          <p className="mt-2 text-xs text-slate-500">
            Add comps below to unlock the comparable, conservative, average, and
            aggressive options. Until then they fall back to your manual ARV.
          </p>
        )}
      </div>
    </div>
  );
}

function signedPct(p: number) {
  return `${p >= 0 ? "+" : "−"}${fmtPct(Math.abs(p), 1)}`;
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "use";
}) {
  const color =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "use"
          ? "text-violet-700"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
