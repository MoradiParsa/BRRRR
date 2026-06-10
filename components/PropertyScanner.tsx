"use client";

import { useEffect, useRef, useState } from "react";
import { Field, TextField } from "@/components/ui";
import {
  fmtUSD,
  INVESTMENT_GRADES,
  type InvestmentGrade,
} from "@/lib/brrrr";
import {
  DEFAULT_ASSUMPTIONS,
  defaultBuyBox,
  loadBuyBoxes,
  MAX_SCAN_RESULTS,
  saveBuyBoxes,
  type AssumptionProfile,
  type BuyBox,
} from "@/lib/buyBox";
import { analyzeProperties, type ScanRow } from "@/lib/scanner";
import { csvProvider } from "@/lib/providers/csv";
import { pdfProvider } from "@/lib/providers/pdf";
import type {
  ProviderRunStatus,
  ProviderStatus,
  ScanResponse,
} from "@/lib/providers/types";

type Mode = "market" | "file";
type ScanSummary = {
  scanned: number;
  passed: number;
  hidden: number;
  gateReasons: { gate: string; count: number }[];
};

const STEPS = [
  "Searching listings",
  "Extracting property data",
  "Running BRRRR analysis",
  "Ranking opportunities",
];

export function PropertyScanner({
  onMergeScan,
  onGoToQueue,
  queueCount,
}: {
  onMergeScan: (rows: ScanRow[]) => void;
  onGoToQueue: () => void;
  queueCount: number;
}) {
  const [boxes, setBoxes] = useState<BuyBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<BuyBox>(defaultBuyBox);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [mode, setMode] = useState<Mode>("market");

  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0); // 0 idle, 1..4
  const [statuses, setStatuses] = useState<ProviderRunStatus[] | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadBuyBoxes();
    setBoxes(loaded);
    if (loaded[0]) {
      setForm({ ...loaded[0] });
      setSelectedId(loaded[0].id);
    }
  }, []);

  /* ----------------------------- form helpers ---------------------------- */

  const set = <K extends keyof BuyBox>(k: K, v: BuyBox[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setAssumption = (k: keyof AssumptionProfile, v: number | null) =>
    setForm((f) => ({
      ...f,
      assumptions: { ...f.assumptions, [k]: v ?? 0 },
    }));

  /* --------------------------- template actions -------------------------- */

  const selectTemplate = (bb: BuyBox) => {
    setForm({ ...bb });
    setSelectedId(bb.id);
    resetResults();
  };

  const newTemplate = () => {
    setForm(defaultBuyBox());
    setSelectedId(null);
    resetResults();
  };

  const persist = (next: BuyBox[]) => {
    setBoxes(next);
    saveBuyBoxes(next);
  };

  const saveTemplate = () => {
    const name = form.name.trim() || form.market.trim() || "Untitled buy box";
    if (selectedId) {
      const next = boxes.map((b) =>
        b.id === selectedId ? { ...form, name } : b,
      );
      persist(next);
      setForm((f) => ({ ...f, name }));
    } else {
      const created = { ...form, name };
      persist([created, ...boxes]);
      setSelectedId(created.id);
      setForm(created);
    }
  };

  const deleteTemplate = () => {
    if (!selectedId) return;
    const next = boxes.filter((b) => b.id !== selectedId);
    persist(next);
    if (next[0]) selectTemplate(next[0]);
    else newTemplate();
  };

  /* ------------------------------- scanning ------------------------------ */

  const resetResults = () => {
    setStatuses(null);
    setSummary(null);
    setError(null);
    setStage(0);
  };

  const finishWith = (rows: ScanRow[], analysis: ScanSummary) => {
    setStage(4);
    setSummary(analysis);
    onMergeScan(rows);
  };

  const runMarketScan = async () => {
    if (!form.market.trim()) {
      setError("Enter a market to scan (e.g. “Sherman, TX”).");
      return;
    }
    setScanning(true);
    resetResults();
    setStage(1);
    try {
      const res = await fetch("/api/property-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: {
            market: form.market.trim(),
            maxPrice: form.maxPrice,
            minBeds: form.minBeds,
            minBaths: form.minBaths,
            maxResults: form.maxResults,
          },
        }),
      });
      setStage(2);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError((d && d.error) || "The scan request failed.");
        return;
      }
      const data = (await res.json()) as ScanResponse;
      setStatuses(data.statuses);
      setStage(3);
      const analysis = analyzeProperties(data.properties, form);
      finishWith(analysis.rows, {
        scanned: analysis.scanned,
        passed: analysis.passed,
        hidden: analysis.hidden,
        gateReasons: analysis.gateReasons,
      });
    } catch {
      setError("We couldn't reach the scanner. Check your connection and try again.");
    } finally {
      setScanning(false);
    }
  };

  const runFileScan = async (file: File) => {
    setScanning(true);
    resetResults();
    setStage(2);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type.includes("csv");
      const provider = isCsv ? csvProvider : pdfProvider;
      const result = await provider.ingestFile(file);
      setStatuses([
        {
          providerId: result.providerId,
          label: provider.label,
          status: result.status,
          count: result.properties.length,
          warnings: result.warnings,
        },
      ]);
      setStage(3);
      const analysis = analyzeProperties(result.properties, form);
      finishWith(analysis.rows, {
        scanned: analysis.scanned,
        passed: analysis.passed,
        hidden: analysis.hidden,
        gateReasons: analysis.gateReasons,
      });
    } catch {
      setError("We couldn't read that file.");
    } finally {
      setScanning(false);
    }
  };

  const gradeOptions = INVESTMENT_GRADES;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-indigo-600">Find opportunities</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Universal Property Scanner
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Run a Buy Box against your providers, score every listing with your BRRRR
          engine, and send the best opportunities to the Deal Queue.
        </p>
      </div>

      {/* Template bar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {boxes.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => selectTemplate(b)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              selectedId === b.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {b.name || "Untitled"}
          </button>
        ))}
        <button
          type="button"
          onClick={newTemplate}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-dashed ring-indigo-300 transition hover:bg-indigo-50"
        >
          + New
        </button>
      </div>

      {/* Form */}
      <div className="mt-4 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Buy Box name"
            value={form.name}
            onChange={(v) => set("name", v)}
            placeholder="e.g. Sherman BRRRR"
          />
          <TextField
            label="Market / city"
            value={form.market}
            onChange={(v) => set("market", v)}
            placeholder="e.g. Sherman, TX"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Max purchase price" value={form.maxPrice} onCommit={(v) => set("maxPrice", v)} kind="currency" placeholder="No limit" />
          <Field label="Min beds" value={form.minBeds} onCommit={(v) => set("minBeds", v)} kind="number" placeholder="Any" />
          <Field label="Min baths" value={form.minBaths} onCommit={(v) => set("minBaths", v)} kind="number" placeholder="Any" />
          <Field label="Min monthly cash flow" value={form.minCashFlow} onCommit={(v) => set("minCashFlow", v)} kind="currency" placeholder="Any" />
          <Field label="Max cash left in deal" value={form.maxCashLeft} onCommit={(v) => set("maxCashLeft", v)} kind="currency" placeholder="Any" />
          <div className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Min investment grade
            </span>
            <select
              value={form.minGrade}
              onChange={(e) => set("minGrade", e.target.value as InvestmentGrade)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-[15px] text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            >
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g === "Pass" ? "Any grade" : g}
                </option>
              ))}
            </select>
          </div>
          <Field label="Default rehab estimate" value={form.defaultRehab} onCommit={(v) => set("defaultRehab", v)} kind="currency" placeholder="$0" />
          <Field label="Default rent estimate" value={form.defaultRent} onCommit={(v) => set("defaultRent", v)} kind="currency" placeholder="$0/mo" />
          <Field label="ARV multiplier" value={form.arvMultiplier} onCommit={(v) => set("arvMultiplier", v)} kind="number" placeholder="1.35" caption="ARV = price × multiplier" />
          <Field label="Max results to scan" value={form.maxResults} onCommit={(v) => set("maxResults", Math.max(1, Math.min(MAX_SCAN_RESULTS, v ?? 25)))} kind="number" placeholder="25" />
        </div>

        {/* Assumptions */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60">
          <button
            type="button"
            onClick={() => setShowAssumptions((s) => !s)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-slate-700">
              Analysis assumptions
            </span>
            <span className="text-xs font-medium text-slate-500">
              {showAssumptions ? "Hide" : "Financing & operating defaults"}
            </span>
          </button>
          {showAssumptions && (
            <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-3">
              <Field label="Down payment %" value={form.assumptions.downPaymentPct} onCommit={(v) => setAssumption("downPaymentPct", v)} kind="percent" placeholder="20" />
              <Field label="Purchase rate" value={form.assumptions.purchaseRate} onCommit={(v) => setAssumption("purchaseRate", v)} kind="percent" placeholder="9.5" />
              <Field label="Purchase term (yrs)" value={form.assumptions.purchaseTermYears} onCommit={(v) => setAssumption("purchaseTermYears", v)} kind="years" placeholder="30" />
              <Field label="Closing %" value={form.assumptions.closingPct} onCommit={(v) => setAssumption("closingPct", v)} kind="percent" placeholder="3" />
              <Field label="Holding %" value={form.assumptions.holdingPct} onCommit={(v) => setAssumption("holdingPct", v)} kind="percent" placeholder="2" />
              <Field label="Refinance LTV" value={form.assumptions.refinanceLTV} onCommit={(v) => setAssumption("refinanceLTV", v)} kind="percent" placeholder="75" />
              <Field label="Refi rate" value={form.assumptions.refiRate} onCommit={(v) => setAssumption("refiRate", v)} kind="percent" placeholder="7.25" />
              <Field label="Refi term (yrs)" value={form.assumptions.refiTermYears} onCommit={(v) => setAssumption("refiTermYears", v)} kind="years" placeholder="30" />
              <Field label="Property tax %/yr" value={form.assumptions.taxRatePct} onCommit={(v) => setAssumption("taxRatePct", v)} kind="percent" placeholder="1.5" />
              <Field label="Insurance $/yr" value={form.assumptions.insuranceAnnual} onCommit={(v) => setAssumption("insuranceAnnual", v)} kind="currency" placeholder="1200" />
              <Field label="Management %" value={form.assumptions.managementPct} onCommit={(v) => setAssumption("managementPct", v)} kind="percent" placeholder="8" />
              <Field label="Vacancy %" value={form.assumptions.vacancyPct} onCommit={(v) => setAssumption("vacancyPct", v)} kind="percent" placeholder="5" />
              <Field label="Maintenance %" value={form.assumptions.maintenancePct} onCommit={(v) => setAssumption("maintenancePct", v)} kind="percent" placeholder="5" />
              <Field label="CapEx reserve %" value={form.assumptions.capexPct} onCommit={(v) => setAssumption("capexPct", v)} kind="percent" placeholder="5" />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, assumptions: { ...DEFAULT_ASSUMPTIONS } }))}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Template save controls */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={saveTemplate}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {selectedId ? "Update template" : "Save as template"}
          </button>
          {selectedId && (
            <button
              type="button"
              onClick={deleteTemplate}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Source mode + run */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(["market", "file"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "market" ? "Search market" : "Import file (CSV / PDF)"}
              </button>
            ))}
          </div>

          {mode === "market" ? (
            <button
              type="button"
              disabled={scanning}
              onClick={runMarketScan}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {scanning ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Scanning…
                </>
              ) : (
                "Run Scan"
              )}
            </button>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runFileScan(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={scanning}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {scanning ? "Reading…" : "Choose CSV / PDF"}
              </button>
            </>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {mode === "market"
            ? "Searches public listing pages (Zillow, Redfin, Realtor). Many sites block automated requests — when that happens you'll see it below, and a browser-automation provider can be added next. CSV exports are the most reliable source today."
            : "Reads a CSV export (MLS / Zillow / Redfin) or a text-based PDF locally — no upload to any server, no paid service."}
        </p>

        {/* Progress / results */}
        {(scanning || statuses || summary || error) && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            {/* Stepper */}
            <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              {STEPS.map((label, i) => {
                const stepNo = i + 1;
                const done = stage > stepNo || (!scanning && summary && stage >= stepNo);
                const active = scanning && stage === stepNo;
                return (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                        done
                          ? "bg-emerald-100 text-emerald-700"
                          : active
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {done ? "✓" : stepNo}
                    </span>
                    <span className={done ? "text-slate-700" : active ? "text-indigo-700" : "text-slate-400"}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            {/* Provider statuses */}
            {statuses && statuses.length > 0 && (
              <div className="space-y-2">
                {statuses.map((s) => (
                  <div key={s.providerId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <StatusDot status={s.status} />
                        {s.label}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {statusText(s.status)} · {s.count} found
                      </span>
                    </div>
                    {s.warnings.map((w, i) => (
                      <p key={i} className="mt-1 text-xs text-slate-500">
                        {w}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {summary && (
              <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-700">
                  Scanned <strong>{summary.scanned}</strong> · matched your Buy Box{" "}
                  <strong className="text-indigo-700">{summary.passed}</strong> ·{" "}
                  {summary.hidden} filtered out.
                  {summary.passed === 0 && (
                    <span className="block text-xs text-slate-500">
                      No properties matched. Loosen the Buy Box, or try a CSV export if the
                      providers were blocked.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onGoToQueue}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  View Deal Queue ({queueCount})
                </button>
              </div>
            )}

            {/* Debug panel — provider, search URL, cards, filter reasons */}
            {(statuses || summary) && (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
                <div className="mb-2 flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wide text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Scan diagnostics
                </div>
                {statuses?.map((s) => (
                  <div key={s.providerId} className="mb-2">
                    <div>
                      <span className="text-slate-400">Provider used:</span> {s.label} —{" "}
                      {statusText(s.status)} · {s.count} found
                    </div>
                    {s.debug?.searchUrl && (
                      <div className="truncate">
                        <span className="text-slate-400">Search URL:</span>{" "}
                        <a
                          href={s.debug.searchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 underline"
                        >
                          {s.debug.searchUrl}
                        </a>
                      </div>
                    )}
                    {s.debug?.cardsFound != null && (
                      <div>
                        <span className="text-slate-400">Cards found:</span> {s.debug.cardsFound}
                      </div>
                    )}
                    {s.debug?.cardsConverted != null && (
                      <div>
                        <span className="text-slate-400">Cards converted:</span>{" "}
                        {s.debug.cardsConverted}
                      </div>
                    )}
                  </div>
                ))}
                {summary && (
                  <div className="mt-2 border-t border-slate-700 pt-2">
                    <div>
                      <span className="text-slate-400">Scanned:</span> {summary.scanned} ·{" "}
                      <span className="text-slate-400">Matched:</span> {summary.passed} ·{" "}
                      <span className="text-slate-400">Filtered out:</span> {summary.hidden}
                    </div>
                    {summary.gateReasons.length > 0 ? (
                      <div>
                        <span className="text-slate-400">Filtered because:</span>{" "}
                        {summary.gateReasons.map((r) => `${r.gate} (${r.count})`).join(" · ")}
                      </div>
                    ) : summary.hidden > 0 ? (
                      <div className="text-slate-400">
                        Filtered with no single gate (incomplete listing data).
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- status --------------------------------- */

function statusText(s: ProviderStatus): string {
  switch (s) {
    case "ok":
      return "OK";
    case "blocked":
      return "Blocked";
    case "empty":
      return "No results";
    case "error":
      return "Unreachable";
    case "unavailable":
      return "Not enabled";
  }
}

function StatusDot({ status }: { status: ProviderStatus }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "blocked"
        ? "bg-amber-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-slate-300";
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}
