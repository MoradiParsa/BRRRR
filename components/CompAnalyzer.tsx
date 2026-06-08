"use client";

import {
  analyzeComps,
  fmtUSD,
  MAX_COMPS,
  type Comp,
  type RenoQuality,
  type Subject,
} from "@/lib/brrrr";
import { Field, PhaseCard, Segmented, TextField } from "@/components/ui";

const RENO_OPTIONS: { value: RenoQuality; label: string }[] = [
  { value: "Basic", label: "Basic" },
  { value: "Similar", label: "Similar" },
  { value: "Superior", label: "Superior" },
];

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {children}
    </span>
  );
}

export function CompAnalyzer({
  subject,
  onSubject,
  comps,
  onUpdate,
  onAdd,
  onRemove,
}: {
  subject: Subject;
  onSubject: (key: keyof Subject, v: number | null) => void;
  comps: Comp[];
  onUpdate: (id: string, patch: Partial<Comp>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const results = analyzeComps(subject, comps);
  const canEstimate = results.validCount > 0 && (subject.sqft ?? 0) > 0;

  const confTone =
    results.confidence === "High"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : results.confidence === "Medium"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <PhaseCard
      phase="≈"
      title="Comparable Sales / ARV"
      subtitle="Estimate ARV from recent comparable sales"
      accent="bg-sky-600"
    >
      <div className="space-y-5">
        {/* Subject property */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Subject Property
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Sq Ft"
              kind="number"
              placeholder="e.g. 1400"
              value={subject.sqft}
              onCommit={(v) => onSubject("sqft", v)}
            />
            <Field
              label="Beds"
              kind="number"
              placeholder="e.g. 3"
              value={subject.beds}
              onCommit={(v) => onSubject("beds", v)}
            />
            <Field
              label="Baths"
              kind="number"
              placeholder="e.g. 2"
              value={subject.baths}
              onCommit={(v) => onSubject("baths", v)}
            />
          </div>
        </div>

        {/* Comps */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comparable Sales
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {comps.length}/{MAX_COMPS}
              </span>
              <button
                type="button"
                onClick={onAdd}
                disabled={comps.length >= MAX_COMPS}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                + Add comp
              </button>
            </div>
          </div>

          {comps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No comps yet. Add up to {MAX_COMPS} recent comparable sales to
              estimate ARV.
            </div>
          ) : (
            <div className="space-y-3">
              {comps.map((c, idx) => {
                const row = results.rows[idx];
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex-1">
                        <TextField
                          value={c.address}
                          placeholder={`Comp ${idx + 1} address`}
                          onChange={(v) => onUpdate(c.id, { address: v })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(c.id)}
                        aria-label="Remove comp"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-400 transition hover:border-red-300 hover:text-red-500"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            d="M6 6l8 8M14 6l-8 8"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <Field
                        label="Sale Price"
                        kind="currency"
                        placeholder="$"
                        value={c.salePrice}
                        onCommit={(v) => onUpdate(c.id, { salePrice: v })}
                      />
                      <Field
                        label="Sq Ft"
                        kind="number"
                        placeholder="sq ft"
                        value={c.sqft}
                        onCommit={(v) => onUpdate(c.id, { sqft: v })}
                      />
                      <Field
                        label="Beds"
                        kind="number"
                        placeholder="beds"
                        value={c.beds}
                        onCommit={(v) => onUpdate(c.id, { beds: v })}
                      />
                      <Field
                        label="Baths"
                        kind="number"
                        placeholder="baths"
                        value={c.baths}
                        onCommit={(v) => onUpdate(c.id, { baths: v })}
                      />
                      <Field
                        label="Distance"
                        kind="number"
                        placeholder="mi"
                        value={c.distance}
                        onCommit={(v) => onUpdate(c.id, { distance: v })}
                      />
                      <Field
                        label="Days Since Sale"
                        kind="number"
                        placeholder="days"
                        value={c.daysSinceSale}
                        onCommit={(v) => onUpdate(c.id, { daysSinceSale: v })}
                      />
                    </div>

                    <div className="mt-2.5">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Renovation quality
                      </span>
                      <Segmented<RenoQuality>
                        value={c.reno}
                        options={RENO_OPTIONS}
                        onChange={(v) => onUpdate(c.id, { reno: v })}
                        size="sm"
                      />
                    </div>

                    {row?.valid ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Chip>{fmtUSD(row.pricePerSqft)}/sqft</Chip>
                        <Chip>Similarity {row.similarity}</Chip>
                        <Chip>Weight {(row.weight * 100).toFixed(0)}%</Chip>
                        <Chip>≈ {fmtUSD(row.impliedARV)}</Chip>
                      </div>
                    ) : (
                      <p className="mt-2.5 text-xs text-slate-400">
                        Enter sale price and square footage to include this comp.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Estimate */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800">
              Estimated ARV
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${confTone}`}
            >
              {results.confidence} confidence
            </span>
          </div>

          {canEstimate ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <ArvTile
                  label="Conservative"
                  value={fmtUSD(results.conservativeARV)}
                />
                <ArvTile
                  label="Average"
                  value={fmtUSD(results.averageARV)}
                  emphasis
                />
                <ArvTile
                  label="Aggressive"
                  value={fmtUSD(results.aggressiveARV)}
                />
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">
                Weighted price per sq ft:{" "}
                <span className="font-semibold text-slate-700">
                  {fmtUSD(results.weightedPpsf)}
                </span>{" "}
                · {results.validCount} comp
                {results.validCount === 1 ? "" : "s"} used
              </p>
            </>
          ) : (
            <p className="text-sm text-sky-800/80">
              Add the subject&apos;s square footage and at least one comp with a
              sale price and square footage to estimate ARV.
            </p>
          )}
        </div>
      </div>
    </PhaseCard>
  );
}

function ArvTile({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-3 ${
        emphasis ? "border-sky-300 bg-white" : "border-slate-200 bg-white/70"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 font-bold ${
          emphasis ? "text-lg text-sky-700" : "text-base text-slate-700"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
