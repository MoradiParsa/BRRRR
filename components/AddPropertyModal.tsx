"use client";

import { useRef, useState, type ReactNode } from "react";
import { fmtUSD } from "@/lib/brrrr";
import {
  csvRowToDealState,
  csvToPreviewRows,
  emptyDealState,
  linkDealState,
  pdfDealState,
  type CsvRow,
  type DealState,
} from "@/lib/deals";
import { IMPORT_SOURCES } from "@/lib/importers";
import {
  ACCEPTED_FILE_TYPES,
  extractProperty,
  type PropertyExtractionResult,
} from "@/lib/extraction";
import { ExtractionReview } from "@/components/ExtractionReview";

/**
 * Premium "Add Property" modal. The methods are driven by the IMPORT_SOURCES
 * registry (lib/importers.ts) so new sources can be added later without
 * touching this layout or the Property model. PDF/flyer uploads run the local
 * extractor (lib/extraction.ts) and open an editable review.
 */
export function AddPropertyModal({
  open,
  onClose,
  onCreateDraft,
  onImportDeals,
}: {
  open: boolean;
  onClose: () => void;
  onCreateDraft: (deal: DealState) => void;
  onImportDeals: (deals: DealState[]) => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [review, setReview] = useState<PropertyExtractionResult | null>(null);

  if (!open) return null;

  const working = IMPORT_SOURCES.filter((s) => s.status === "working");
  const soon = IMPORT_SOURCES.filter((s) => s.status === "coming-soon");

  const close = () => {
    setReview(null);
    setExtracting(false);
    onClose();
  };

  const runExtraction = async (file: File) => {
    setExtracting(true);
    try {
      const result = await extractProperty(file);
      setReview(result);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Add Property
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {review
                ? "Review the details we found before creating the property."
                : "Choose how you want to add a property."}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-5">
          {review ? (
            <ExtractionReview
              result={review}
              onBack={() => setReview(null)}
              onCreate={(deal) => {
                onCreateDraft(deal);
                close();
              }}
              onCreateBlank={() => {
                onCreateDraft(pdfDealState(review.fileName));
                close();
              }}
            />
          ) : (
            <>
              <Section title="Working now" tone="now">
                {working.map((src) =>
                  src.kind === "manual" ? (
                    <ManualCard
                      key={src.id}
                      description={src.description}
                      onCreate={() => {
                        onCreateDraft(emptyDealState());
                        close();
                      }}
                    />
                  ) : src.kind === "csv" ? (
                    <CsvCard
                      key={src.id}
                      description={src.description}
                      onImport={(deals) => {
                        onImportDeals(deals);
                        close();
                      }}
                    />
                  ) : (
                    <PdfCard
                      key={src.id}
                      description={src.description}
                      extracting={extracting}
                      onFile={runExtraction}
                    />
                  ),
                )}
              </Section>

              <Section title="Coming soon" tone="soon">
                {soon.map((src) => (
                  <LinkCard
                    key={src.id}
                    description={src.description}
                    onCreate={(deal) => {
                      onCreateDraft(deal);
                      close();
                    }}
                  />
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- sections -------------------------------- */

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "now" | "soon";
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${tone === "now" ? "bg-emerald-500" : "bg-slate-300"}`}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Card({
  icon,
  title,
  description,
  badge,
  children,
  primary,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: { label: string; tone: "working" | "soon" };
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        primary ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            primary ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900">{title}</h4>
            {badge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  badge.tone === "working"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {badge.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- cards ---------------------------------- */

function ManualCard({
  description,
  onCreate,
}: {
  description: string;
  onCreate: () => void;
}) {
  return (
    <Card icon={<IconPencil />} title="Create Blank Property" description={description} primary>
      <PrimaryButton onClick={onCreate}>Create Blank Property</PrimaryButton>
    </Card>
  );
}

function CsvCard({
  description,
  onImport,
}: {
  description: string;
  onImport: (deals: DealState[]) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = csvToPreviewRows(String(reader.result ?? ""));
        if (parsed.length === 0) {
          setRows([]);
          setError(
            "No rows found. Add a header row with columns like address, price, beds, baths, sqft.",
          );
        } else setRows(parsed);
      } catch {
        setRows([]);
        setError("Could not read that file as CSV.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <Card
      icon={<IconTable />}
      title="Import CSV"
      description={description}
      badge={{ label: "Working", tone: "working" }}
    >
      <p className="mb-2 text-xs text-slate-500">
        Supported columns: <strong>Address</strong>, <strong>Price</strong>,{" "}
        <strong>Beds</strong>, <strong>Baths</strong>,{" "}
        <strong>Square Feet</strong>.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <IconTable />
        {fileName ? "Choose a different CSV" : "Choose a CSV file"}
      </button>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Preview · {rows.length}{" "}
              {rows.length === 1 ? "property" : "properties"}
            </span>
            <span className="text-xs text-slate-400">{fileName}</span>
          </div>
          <div className="max-h-44 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="p-2">Property</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2 text-right">Beds</th>
                  <th className="p-2 text-right">Baths</th>
                  <th className="p-2 text-right">Sq Ft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="p-2 font-medium text-slate-800">
                      {r.name || r.address || "Untitled"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700">
                      {r.price != null ? fmtUSD(r.price) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700">
                      {r.beds ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700">
                      {r.baths ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700">
                      {r.sqft ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PrimaryButton
            onClick={() =>
              onImport(
                rows.map((r) => csvRowToDealState(r, fileName ?? "import.csv")),
              )
            }
          >
            Import {rows.length} {rows.length === 1 ? "property" : "properties"}
          </PrimaryButton>
        </div>
      )}
    </Card>
  );
}

function LinkCard({
  description,
  onCreate,
}: {
  description: string;
  onCreate: (deal: DealState) => void;
}) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const valid = url.trim().length > 0;

  return (
    <Card
      icon={<IconLink />}
      title="Paste Listing URL"
      description={description}
      badge={{ label: "Soon", tone: "soon" }}
    >
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.zillow.com/homedetails/…"
        className={inputClass}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (optional)…"
        className={`${inputClass} mt-2 resize-y`}
      />
      <p className="mt-2 text-xs font-medium text-amber-700">
        Automatic extraction coming soon.
      </p>
      <PrimaryButton
        className="mt-2"
        disabled={!valid}
        onClick={() => onCreate(linkDealState(url, notes))}
      >
        Save Link &amp; Create Property
      </PrimaryButton>
    </Card>
  );
}

function PdfCard({
  description,
  extracting,
  onFile,
}: {
  description: string;
  extracting: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card
      icon={<IconDoc />}
      title="Upload PDF / Flyer"
      description={description}
      badge={{ label: "Beta", tone: "working" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={extracting}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {extracting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
            Reading file…
          </>
        ) : (
          <>
            <IconDoc />
            Choose a PDF, flyer, or image
          </>
        )}
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Local text extraction from PDFs. Scanned files &amp; images need OCR
        (coming soon) — you can still review and edit before creating.
      </p>
    </Card>
  );
}

/* --------------------------------- shared --------------------------------- */

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
        disabled
          ? "cursor-not-allowed bg-slate-300"
          : "bg-indigo-600 hover:bg-indigo-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* --------------------------------- icons ---------------------------------- */

function IconLink() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M8.5 5.5a3 3 0 014.24 0l1.76 1.76a3 3 0 010 4.24l-1 1a1 1 0 01-1.42-1.42l1-1a1 1 0 000-1.4L11.3 6.9a1 1 0 00-1.4 0l-1 1A1 1 0 017.5 6.5l1-1z" />
      <path d="M11.5 14.5a3 3 0 01-4.24 0L5.5 12.74a3 3 0 010-4.24l1-1a1 1 0 011.42 1.42l-1 1a1 1 0 000 1.4l1.78 1.78a1 1 0 001.4 0l1-1a1 1 0 011.42 1.42l-1 1z" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7.41a2 2 0 00-.59-1.41l-3.41-3.41A2 2 0 0011.59 2H5zm6 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 10a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function IconTable() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v3h4V5H5zm6 0v3h4V5h-4zM5 10v2h4v-2H5zm6 0v2h4v-2h-4zM5 14v1h4v-1H5zm6 0v1h4v-1h-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M13.59 3.41a2 2 0 012.83 0l.17.17a2 2 0 010 2.83l-8.6 8.6a2 2 0 01-.88.51l-3.3.94a1 1 0 01-1.24-1.24l.94-3.3a2 2 0 01.51-.88l8.6-8.6z" />
    </svg>
  );
}
