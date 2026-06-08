"use client";

import { Fragment } from "react";
import {
  fmtNum,
  fmtUSD,
  type Sensitivity as SensitivityData,
  type StressRow,
  type Verdict,
} from "@/lib/brrrr";

const verdictStyle: Record<Verdict, { badge: string; bar: string; dot: string }> =
  {
    "Still Works": {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      bar: "bg-emerald-400",
      dot: "bg-emerald-500",
    },
    Tight: {
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      bar: "bg-amber-400",
      dot: "bg-amber-500",
    },
    Fails: {
      badge: "bg-red-50 text-red-700 ring-red-200",
      bar: "bg-red-400",
      dot: "bg-red-500",
    },
  };

function cfClass(v: number) {
  return v >= 150 ? "text-emerald-600" : v >= 0 ? "text-amber-600" : "text-red-600";
}
function dscrClass(v: number) {
  return !isFinite(v) || v >= 1.2
    ? "text-emerald-600"
    : v >= 1
      ? "text-amber-600"
      : "text-red-600";
}

function Row({ row, emphasis }: { row: StressRow; emphasis?: boolean }) {
  const st = verdictStyle[row.verdict];
  return (
    <tr className={emphasis ? "bg-slate-50" : "hover:bg-slate-50/60"}>
      <td className="py-2.5 pl-4 pr-3">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
          <span
            className={`text-sm ${emphasis ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}
          >
            {row.label}
          </span>
        </span>
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${cfClass(row.monthlyCashFlow)}`}
      >
        {fmtUSD(row.monthlyCashFlow)}
        <span className="font-normal text-slate-400">/mo</span>
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${dscrClass(row.dscr)}`}
      >
        {fmtNum(row.dscr)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-medium tabular-nums">
        {row.cashOutSurplus > 0 ? (
          <span className="text-emerald-600">+{fmtUSD(row.cashOutSurplus)}</span>
        ) : (
          <span className="text-slate-700">{fmtUSD(row.cashLeftInDeal)}</span>
        )}
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}
        >
          {row.verdict}
        </span>
      </td>
    </tr>
  );
}

export function Sensitivity({ data }: { data: SensitivityData }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sensitivity Analysis
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            How the deal holds up when key assumptions move against you.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Still Works
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Tight
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Fails
          </span>
        </div>
      </div>

      {/* Investor summary */}
      <div
        className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
          data.resilient
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
            data.resilient ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          {data.resilient ? (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.2 3-1.74 3H3.72c-1.54 0-2.5-1.67-1.74-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </span>
        <div>
          <div
            className={`text-sm font-bold ${
              data.resilient ? "text-emerald-800" : "text-red-800"
            }`}
          >
            {data.headline}
          </div>
          <p
            className={`mt-0.5 text-xs leading-relaxed ${
              data.resilient ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {data.summary}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="border-b border-slate-200 py-2 pl-4 pr-3 text-left">
                Scenario
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">
                Cash Flow
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">
                DSCR
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">
                Cash Left / Out
              </th>
              <th className="border-b border-slate-200 py-2 pl-3 pr-4 text-right">
                Verdict
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.groups.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td
                    colSpan={5}
                    className="bg-slate-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {g.title}
                  </td>
                </tr>
                {g.rows.map((row) => (
                  <Row key={row.label} row={row} />
                ))}
              </Fragment>
            ))}
            <tr>
              <td
                colSpan={5}
                className="bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
              >
                Combined worst case · rent −10% · rate +1% · rehab +20% · ARV −10%
              </td>
            </tr>
            <Row row={data.worstCase} emphasis />
          </tbody>
        </table>
      </div>
    </section>
  );
}
