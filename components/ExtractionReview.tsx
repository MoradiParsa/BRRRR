"use client";

import { useState, type ReactNode } from "react";
import {
  dealStateFromExtracted,
  FIELD_LABELS,
  type ExtractedFields,
  type ExtractedKey,
  type FieldConfidence,
  type PropertyExtractionResult,
} from "@/lib/extraction";
import type { DealState } from "@/lib/deals";

const GROUPS: { title: string; keys: ExtractedKey[] }[] = [
  { title: "Property", keys: ["name", "address", "city", "state", "zip"] },
  { title: "Details", keys: ["beds", "baths", "sqft", "lotSize", "yearBuilt"] },
  { title: "Financials", keys: ["price", "taxes", "hoa"] },
  {
    title: "Listing & agent",
    keys: ["mlsNumber", "agentName", "agentPhone", "agentEmail", "description"],
  },
];

export function ExtractionReview({
  result,
  onCreate,
  onCreateBlank,
  onBack,
}: {
  result: PropertyExtractionResult;
  onCreate: (deal: DealState) => void;
  onCreateBlank: () => void;
  onBack: () => void;
}) {
  const [fields, setFields] = useState<ExtractedFields>(result.extracted);
  const conf: FieldConfidence = result.fieldConfidence;

  const set = (k: ExtractedKey, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const pct = Math.round(result.confidence * 100);
  const lowConfidence = result.limited || result.confidence < 0.25;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
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
        {!lowConfidence && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              result.confidence >= 0.6
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {pct}% confidence
          </span>
        )}
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900">
          Review extracted details
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          From <span className="font-medium">{result.fileName}</span>. Edit
          anything before creating the property.
        </p>
      </div>

      {/* Limited / low confidence notice */}
      {lowConfidence && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            We could not confidently extract this file. You can still create a
            blank property with the file attached, or enter the details
            manually below.
          </p>
          <button
            type="button"
            onClick={onCreateBlank}
            className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            Create blank property with file attached
          </button>
        </div>
      )}

      {result.warnings.length > 0 && (
        <ul className="space-y-1">
          {result.warnings.map((w, i) => (
            <li key={i} className="text-xs text-slate-500">
              • {w}
            </li>
          ))}
        </ul>
      )}

      {/* Editable fields */}
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {g.title}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.keys.map((k) =>
                k === "description" ? (
                  <div key={k} className="sm:col-span-2">
                    <FieldLabel label={FIELD_LABELS[k]} confidence={conf[k]} onClear={() => set(k, "")} hasValue={!!fields[k]} />
                    <textarea
                      value={fields[k]}
                      onChange={(e) => set(k, e.target.value)}
                      rows={3}
                      placeholder="Not found"
                      className={`${inputClass} resize-y`}
                    />
                  </div>
                ) : (
                  <div key={k}>
                    <FieldLabel label={FIELD_LABELS[k]} confidence={conf[k]} onClear={() => set(k, "")} hasValue={!!fields[k]} />
                    <input
                      type="text"
                      value={fields[k]}
                      onChange={(e) => set(k, e.target.value)}
                      placeholder="Not found"
                      className={inputClass}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row-reverse">
        <button
          type="button"
          onClick={() => onCreate(dealStateFromExtracted(fields, result.fileName))}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:flex-1"
        >
          Create Property
        </button>
        <button
          type="button"
          onClick={onCreateBlank}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Skip — create blank
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function FieldLabel({
  label,
  confidence,
  onClear,
  hasValue,
}: {
  label: string;
  confidence?: number;
  onClear: () => void;
  hasValue: boolean;
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        {label}
        {confidence !== undefined && (
          <ConfidenceDot confidence={confidence} />
        )}
      </span>
      {hasValue && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-medium text-slate-400 transition hover:text-red-500"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }): ReactNode {
  const tone =
    confidence >= 0.75
      ? "bg-emerald-500"
      : confidence >= 0.5
        ? "bg-amber-500"
        : "bg-slate-400";
  return (
    <span
      title={`${Math.round(confidence * 100)}% confidence`}
      className={`inline-block h-1.5 w-1.5 rounded-full ${tone}`}
    />
  );
}
