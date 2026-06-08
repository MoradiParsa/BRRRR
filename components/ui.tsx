"use client";

import { useState, type ReactNode } from "react";
import { fmtUSD, type CostMode } from "@/lib/brrrr";

/* --------------------------------- Stars ---------------------------------- */

function StarIcon({ fill }: { fill: number }) {
  // fill: 0..1 fraction of this star that is gold
  const clamped = Math.max(0, Math.min(1, fill));
  return (
    <span className="relative inline-block h-5 w-5 shrink-0">
      <svg
        viewBox="0 0 20 20"
        className="absolute inset-0 h-5 w-5 text-slate-300"
        fill="currentColor"
        aria-hidden
      >
        <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.98 4.8 17.5l.99-5.79-4.21-4.1 5.82-.85L10 1.5z" />
      </svg>
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${clamped * 100}%` }}
      >
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 text-amber-400"
          style={{ minWidth: "1.25rem" }}
          fill="currentColor"
          aria-hidden
        >
          <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.98 4.8 17.5l.99-5.79-4.21-4.1 5.82-.85L10 1.5z" />
        </svg>
      </span>
    </span>
  );
}

export function Stars({
  value,
  size = "md",
}: {
  value: number;
  size?: "sm" | "md";
}) {
  const scale = size === "sm" ? "scale-90" : "";
  return (
    <span className={`inline-flex items-center gap-0.5 ${scale}`}>
      {[0, 1, 2, 3, 4].map((idx) => (
        <StarIcon key={idx} fill={value - idx} />
      ))}
    </span>
  );
}

/* --------------------------------- Field ---------------------------------- */
/* Premium numeric input:                                                     */
/*  - stores a raw number (or null = empty) in the parent                     */
/*  - shows a formatted value when idle, raw value while editing             */
/*  - commits only on Enter / blur (never on keystroke)                       */
/*  - Enter -> next field, Shift+Enter -> previous field, Tab native          */
/*  - selects all on focus, validates, shows inline errors                    */

export type FieldKind = "currency" | "percent" | "years" | "number";

function trimNumber(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function formatField(kind: FieldKind, n: number) {
  switch (kind) {
    case "currency":
      return fmtUSD(n);
    case "percent":
      return `${trimNumber(n)}%`;
    case "years":
      return `${trimNumber(n)} ${n === 1 ? "yr" : "yrs"}`;
    default:
      return trimNumber(n);
  }
}

function focusAdjacent(current: HTMLInputElement, dir: 1 | -1) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-nav="1"]'),
  ).filter((el) => !el.disabled);
  const i = nodes.indexOf(current);
  if (i < 0) return;
  const next = nodes[i + dir];
  if (next) next.focus();
}

export function Field({
  label,
  value,
  onCommit,
  kind = "number",
  placeholder,
  hint,
  headerRight,
  caption,
  disabled,
  allowNegative = false,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  kind?: FieldKind;
  placeholder: string;
  hint?: string;
  headerRight?: ReactNode;
  caption?: ReactNode;
  disabled?: boolean;
  allowNegative?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display =
    draft !== null
      ? draft
      : value === null || value === undefined
        ? ""
        : formatField(kind, value);

  const runCommit = (): boolean => {
    if (draft === null) return true; // nothing was typed
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(null);
      setDraft(null);
      setError(null);
      return true;
    }
    const cleaned = trimmed.replace(/[,$%\s]/g, "");
    const n = Number(cleaned);
    if (cleaned === "" || !isFinite(n)) {
      setError("Enter a valid number");
      return false;
    }
    if (!allowNegative && n < 0) {
      setError("Must be 0 or more");
      return false;
    }
    onCommit(n);
    setDraft(null);
    setError(null);
    return true;
  };

  const border = disabled
    ? "border-slate-200 bg-slate-100"
    : error
      ? "border-red-400 ring-4 ring-red-100"
      : focused
        ? "border-indigo-500 ring-4 ring-indigo-200/70 shadow-sm"
        : "border-slate-300 bg-white hover:border-slate-400";

  return (
    <div className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
        <span>{label}</span>
        {headerRight
          ? headerRight
          : hint && (
              <span className="text-xs font-normal text-slate-400">{hint}</span>
            )}
      </span>
      <div className={`flex items-center rounded-xl border transition ${border}`}>
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          data-nav="1"
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          aria-invalid={!!error}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onFocus={(e) => {
            setFocused(true);
            if (draft === null) {
              setDraft(value === null || value === undefined ? "" : String(value));
            }
            // Select the raw value after it renders (and after the click's
            // mouseup), so the first keystroke replaces the whole value.
            // setTimeout(0) runs after mouseup and works in background tabs.
            const el = e.currentTarget;
            setTimeout(() => {
              try {
                el.select();
              } catch {
                /* element may have unmounted */
              }
            }, 0);
          }}
          onBlur={() => {
            setFocused(false);
            runCommit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const ok = runCommit();
              if (ok) {
                setFocused(false);
                focusAdjacent(e.currentTarget, e.shiftKey ? -1 : 1);
              }
            }
          }}
          className="w-full bg-transparent px-3.5 py-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:text-slate-500"
        />
      </div>
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">
          {error}
        </span>
      ) : (
        caption && (
          <span className="mt-1 block text-xs text-slate-500">{caption}</span>
        )
      )}
    </div>
  );
}

/* -------------------------------- CostField ------------------------------- */
/* A Field with a Dollar / % toggle. In percent mode the value is a % of the   */
/* purchase price and the resolved dollar amount is shown beneath the field.   */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CostMode;
  onChange: (m: CostMode) => void;
}) {
  return (
    <span className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
      {(["dollar", "percent"] as const).map((m) => (
        <button
          key={m}
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            onChange(m);
          }}
          className={`rounded-md px-2.5 py-1 transition ${
            mode === m
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
          aria-pressed={mode === m}
          aria-label={m === "dollar" ? "Dollar amount" : "Percent of purchase price"}
        >
          {m === "dollar" ? "$" : "%"}
        </button>
      ))}
    </span>
  );
}

export function CostField({
  label,
  value,
  onCommit,
  mode,
  onModeChange,
  purchasePrice,
  effectiveDollar,
  placeholderDollar,
  placeholderPercent,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  mode: CostMode;
  onModeChange: (m: CostMode) => void;
  purchasePrice: number;
  effectiveDollar: number;
  placeholderDollar: string;
  placeholderPercent: string;
}) {
  return (
    <Field
      label={label}
      value={value}
      onCommit={onCommit}
      kind={mode === "dollar" ? "currency" : "percent"}
      placeholder={mode === "dollar" ? placeholderDollar : placeholderPercent}
      headerRight={<ModeToggle mode={mode} onChange={onModeChange} />}
      caption={
        mode === "percent" ? (
          <>
            {trimNumber(value ?? 0)}% of {fmtUSD(purchasePrice)} ={" "}
            <span className="font-semibold text-slate-700">
              {fmtUSD(effectiveDollar)}
            </span>
          </>
        ) : undefined
      }
    />
  );
}

/* -------------------------------- ReadOut --------------------------------- */
/* A computed, read-only value styled to sit inline with the input fields.    */

export function ReadOut({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
        {label}
        {hint && (
          <span className="text-xs font-normal text-slate-400">{hint}</span>
        )}
      </span>
      <div className="flex items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3">
        <span className={`font-semibold ${toneText(tone)}`}>{value}</span>
      </div>
    </div>
  );
}

/* -------------------------------- TextField ------------------------------- */

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </span>
      )}
      <div className="flex items-center rounded-xl border border-slate-300 bg-white transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-200/70 hover:border-slate-400">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3.5 py-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}

/* ------------------------------- Segmented -------------------------------- */
/* A generic segmented control used for small enum choices (e.g. reno level). */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <span className="inline-flex w-full rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange(o.value);
          }}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-md font-semibold transition ${pad} ${
            value === o.value
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/* --------------------------------- Card ----------------------------------- */

export function PhaseCard({
  phase,
  title,
  subtitle,
  accent,
  children,
}: {
  phase: string;
  title: string;
  subtitle?: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${accent}`}
        >
          {phase}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* -------------------------------- Metric ---------------------------------- */

export type Tone = "neutral" | "good" | "bad" | "warn";

export function toneText(tone: Tone) {
  switch (tone) {
    case "good":
      return "text-emerald-600";
    case "bad":
      return "text-red-600";
    case "warn":
      return "text-amber-600";
    default:
      return "text-slate-900";
  }
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneText(tone)}`}>{value}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

/* --------------------------------- Pill ----------------------------------- */

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const map: Record<Tone, string> = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    bad: "bg-red-50 text-red-700 ring-red-200",
    warn: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}
