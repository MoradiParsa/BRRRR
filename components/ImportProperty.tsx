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

type Method = "manual" | "csv" | "link" | "pdf";
type Status = "now" | "soon";

const METHODS: {
  key: Method;
  label: string;
  desc: string;
  icon: ReactNode;
  status: Status;
}[] = [
  { key: "manual", label: "Create Blank Property", desc: "Start from scratch", icon: <IconPencil />, status: "now" },
  { key: "csv", label: "Import CSV", desc: "Add multiple properties at once", icon: <IconTable />, status: "now" },
  { key: "link", label: "Paste Listing URL", desc: "Zillow, Redfin, Realtor, MLS", icon: <IconLink />, status: "soon" },
  { key: "pdf", label: "Upload PDF / Flyer", desc: "Listing sheet or flyer", icon: <IconDoc />, status: "soon" },
];

export function ImportProperty({
  onCreateDraft,
  onImportDeals,
}: {
  onCreateDraft: (deal: DealState) => void;
  onImportDeals: (deals: DealState[]) => void;
}) {
  const [method, setMethod] = useState<Method>("csv");

  const now = METHODS.filter((m) => m.status === "now");
  const soon = METHODS.filter((m) => m.status === "soon");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-medium text-indigo-600">New property</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Add Property
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create one property from scratch, or import several at once from a
          CSV.
        </p>
      </div>

      {/* Working now */}
      <MethodGroup
        title="Working now"
        tone="now"
        methods={now}
        active={method}
        onSelect={setMethod}
      />

      {/* Coming soon */}
      <MethodGroup
        title="Coming soon"
        tone="soon"
        methods={soon}
        active={method}
        onSelect={setMethod}
      />

      {/* Active panel */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {method === "manual" && <ManualPanel onCreateDraft={onCreateDraft} />}
        {method === "csv" && <CsvPanel onImportDeals={onImportDeals} />}
        {method === "link" && <LinkPanel onCreateDraft={onCreateDraft} />}
        {method === "pdf" && <PdfPanel onCreateDraft={onCreateDraft} />}
      </div>

      {/* Roadmap */}
      <Roadmap />
    </div>
  );
}

function MethodGroup({
  title,
  tone,
  methods,
  active,
  onSelect,
}: {
  title: string;
  tone: Status;
  methods: typeof METHODS;
  active: Method;
  onSelect: (m: Method) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${tone === "now" ? "bg-emerald-500" : "bg-slate-300"}`}
        />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {methods.map((m) => {
          const selected = active === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelect(m.key)}
              className={`relative flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  selected
                    ? "bg-indigo-600 text-white"
                    : tone === "now"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {m.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {m.label}
                  </span>
                  {tone === "soon" && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Soon
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {m.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- manual ----------------------------------- */

function ManualPanel({
  onCreateDraft,
}: {
  onCreateDraft: (deal: DealState) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <IconPencil />
      </span>
      <h3 className="text-base font-bold text-slate-800">
        Create a blank property
      </h3>
      <p className="max-w-sm text-sm text-slate-500">
        Open the Acquisition Workspace with empty fields and enter everything
        yourself.
      </p>
      <PrimaryButton onClick={() => onCreateDraft(emptyDealState())}>
        Create Blank Property
      </PrimaryButton>
    </div>
  );
}

/* --------------------------------- csv ------------------------------------ */

function CsvPanel({
  onImportDeals,
}: {
  onImportDeals: (deals: DealState[]) => void;
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
            "No rows found. Make sure the CSV has a header row with columns like address, price, beds, baths, sqft.",
          );
        } else {
          setRows(parsed);
        }
      } catch {
        setRows([]);
        setError("Could not read that file as CSV.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
        CSV import can create multiple properties if your file includes columns
        like <strong>address, price, beds, baths, sqft</strong>.
      </div>
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
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
          <IconTable />
        </span>
        <span className="text-sm font-semibold text-slate-700">
          {fileName ? "Choose a different CSV" : "Choose a CSV file"}
        </span>
        <span className="text-xs text-slate-400">
          Columns: address, price, beds, baths, sqft
        </span>
      </button>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Preview · {rows.length}{" "}
              {rows.length === 1 ? "property" : "properties"}
            </h3>
            <span className="text-xs text-slate-400">{fileName}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="p-2.5">Property</th>
                  <th className="p-2.5 text-right">Price</th>
                  <th className="p-2.5 text-right">Beds</th>
                  <th className="p-2.5 text-right">Baths</th>
                  <th className="p-2.5 text-right">Sq Ft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="p-2.5">
                      <div className="font-medium text-slate-800">
                        {r.name || r.address || "Untitled"}
                      </div>
                      {r.address && r.name !== r.address && (
                        <div className="text-xs text-slate-400">{r.address}</div>
                      )}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-slate-700">
                      {r.price != null ? fmtUSD(r.price) : "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-slate-700">
                      {r.beds ?? "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-slate-700">
                      {r.baths ?? "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-slate-700">
                      {r.sqft ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PrimaryButton
            onClick={() =>
              onImportDeals(
                rows.map((r) => csvRowToDealState(r, fileName ?? "import.csv")),
              )
            }
          >
            Import {rows.length} {rows.length === 1 ? "property" : "properties"}
          </PrimaryButton>
        </>
      )}
    </div>
  );
}

/* -------------------------------- link ------------------------------------ */

function LinkPanel({
  onCreateDraft,
}: {
  onCreateDraft: (deal: DealState) => void;
}) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const valid = url.trim().length > 0;

  return (
    <div className="space-y-4">
      <ComingSoonNotice>
        Link extraction is not active yet. This will save the listing link to
        your property workspace, but it will not automatically fill property
        details.
      </ComingSoonNotice>
      <Labeled label="Zillow / Redfin / Realtor / MLS link">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.zillow.com/homedetails/…"
          className={inputClass}
        />
      </Labeled>
      <Labeled label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything worth remembering about this listing…"
          className={`${inputClass} resize-y`}
        />
      </Labeled>
      <PrimaryButton
        disabled={!valid}
        onClick={() => onCreateDraft(linkDealState(url, notes))}
      >
        Save Link &amp; Create Blank Property
      </PrimaryButton>
    </div>
  );
}

/* --------------------------------- pdf ------------------------------------ */

function PdfPanel({
  onCreateDraft,
}: {
  onCreateDraft: (deal: DealState) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <ComingSoonNotice>
        PDF extraction is not active yet. This will save the file name/source
        reference only. Property details must be entered manually.
      </ComingSoonNotice>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFileName(f.name);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
          <IconDoc />
        </span>
        <span className="text-sm font-semibold text-slate-700">
          {fileName ? "Choose a different file" : "Choose a PDF or image"}
        </span>
        <span className="text-xs text-slate-400">PDF, PNG, or JPG</span>
      </button>
      {fileName && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <IconDoc />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {fileName}
          </span>
          <span className="text-xs font-medium text-emerald-600">Ready</span>
        </div>
      )}
      <PrimaryButton
        disabled={!fileName}
        onClick={() => fileName && onCreateDraft(pdfDealState(fileName))}
      >
        Save Source &amp; Create Blank Property
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------- roadmap ---------------------------------- */

const ROADMAP = [
  "Zillow / Redfin / Realtor link extraction",
  "MLS PDF extraction",
  "OCR from flyers",
  "AI rehab estimate from photos",
  "Rent comps import",
  "MLS / CSV batch scoring",
];

function Roadmap() {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 01.9.55l1.9 3.85 4.25.62a1 1 0 01.55 1.7l-3.07 3 .72 4.23a1 1 0 01-1.45 1.05L10 16.5l-3.8 2a1 1 0 01-1.45-1.05l.72-4.23-3.07-3a1 1 0 01.55-1.7l4.25-.62L9.1 2.55A1 1 0 0110 2z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h2 className="text-sm font-bold text-slate-900">
          Future extraction roadmap
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        What automated import will do in upcoming releases.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROADMAP.map((item) => (
          <li
            key={item}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5"
          >
            <span className="text-sm font-medium text-slate-700">{item}</span>
            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Planned
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------- shared --------------------------------- */

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function ComingSoonNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
        Soon
      </span>
      <span className="text-xs text-amber-800">{children}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${
        disabled
          ? "cursor-not-allowed bg-slate-300"
          : "bg-indigo-600 hover:bg-indigo-700"
      }`}
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
