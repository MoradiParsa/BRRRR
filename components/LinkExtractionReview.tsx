"use client";

import { useMemo, useState } from "react";
import {
  FIELD_LABELS,
  type ExtractedFields,
  type ExtractedKey,
} from "@/lib/extraction";
import {
  dealStateFromUrl,
  URL_FIELD_KEYS,
  type UrlExtractionResult,
} from "@/lib/urlImport";
import type { DealState } from "@/lib/deals";

const GROUPS: { title: string; keys: ExtractedKey[] }[] = [
  { title: "Location", keys: ["address", "city", "state", "zip"] },
  { title: "Details", keys: ["beds", "baths", "sqft", "lotSize", "yearBuilt"] },
  { title: "Price", keys: ["price"] },
  { title: "Description", keys: ["description"] },
];

export function LinkExtractionReview({
  result,
  onCreateExtracted,
  onCreateBlank,
  onCancel,
}: {
  result: UrlExtractionResult;
  onCreateExtracted: (deal: DealState) => void;
  onCreateBlank: () => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<ExtractedFields>(result.extracted);
  const set = (k: ExtractedKey, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const pct = Math.round(result.confidence * 100);
  const hasData = useMemo(
    () => URL_FIELD_KEYS.some((k) => fields[k].trim()),
    [fields],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">
          Review listing details
        </h3>
        {!result.limited && (
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

      {/* Transparency panel */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-slate-600">
            <span className="font-semibold text-slate-700">Source detected:</span>{" "}
            {result.sourceLabel}
          </span>
          <span className="text-slate-600">
            <span className="font-semibold text-slate-700">Confidence:</span>{" "}
            {pct}%
          </span>
        </div>
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate font-medium text-indigo-600 underline hover:text-indigo-700"
        >
          {result.url}
        </a>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="font-semibold text-emerald-700">
              Fields found ({result.fieldsFound.length})
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.fieldsFound.length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                result.fieldsFound.map((f) => (
                  <span
                    key={f}
                    className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700"
                  >
                    {f}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">
              Fields missing ({result.fieldsMissing.length})
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.fieldsMissing.length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                result.fieldsMissing.map((f) => (
                  <span
                    key={f}
                    className="rounded-md bg-slate-200 px-1.5 py-0.5 font-medium text-slate-600"
                  >
                    {f}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Failure notice */}
      {result.limited && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            We could not automatically extract this listing. You can still create
            a blank property with the link attached.
          </p>
        </div>
      )}

      {/* Warnings */}
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
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      {FIELD_LABELS[k]}
                    </label>
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
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      {FIELD_LABELS[k]}
                    </label>
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
          disabled={!hasData}
          onClick={() =>
            onCreateExtracted(
              dealStateFromUrl(fields, result.url, result.sourceLabel),
            )
          }
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition sm:flex-1 ${
            hasData
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "cursor-not-allowed bg-slate-300"
          }`}
        >
          Create Property from Extracted Data
        </button>
        <button
          type="button"
          onClick={onCreateBlank}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Create Blank Property with Link
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
