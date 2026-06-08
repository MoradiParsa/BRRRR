"use client";

import { fmtNum, type Property, type Recommendation } from "@/lib/brrrr";
import { Field, Stars, TextField } from "@/components/ui";

const recColor: Record<Recommendation, string> = {
  Buy: "text-emerald-300",
  "Buy with Caution": "text-amber-300",
  Pass: "text-red-300",
};

export function PropertyHeader({
  property,
  onText,
  onNum,
  recommendation,
  stars,
  hasDeal,
  lastUpdated,
}: {
  property: Property;
  onText: (key: "name" | "address" | "cityState", v: string) => void;
  onNum: (key: "beds" | "baths" | "sqft", v: number | null) => void;
  recommendation: Recommendation;
  stars: number;
  hasDeal: boolean;
  lastUpdated: number | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Identity bar */}
      <div className="flex flex-col gap-4 bg-gradient-to-br from-slate-900 to-slate-800 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Property
          </div>
          <div className="mt-1 truncate text-xl font-bold">
            {property.name.trim() || "Untitled property"}
          </div>
          <div className="mt-0.5 truncate text-sm text-slate-300">
            {[property.address.trim(), property.cityState.trim()]
              .filter(Boolean)
              .join(" · ") || "No address yet"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-300">
            <Fact label="Beds" value={property.beds} />
            <Fact label="Baths" value={property.baths} />
            <Fact label="Sq Ft" value={property.sqft} />
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <div
            className={`text-lg font-extrabold ${
              hasDeal ? recColor[recommendation] : "text-slate-500"
            }`}
          >
            {hasDeal ? recommendation : "—"}
          </div>
          <div className="mt-1 flex items-center gap-2 sm:justify-end">
            {hasDeal ? (
              <>
                <Stars value={stars} size="sm" />
                <span className="text-sm font-bold">{fmtNum(stars, 1)}</span>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not rated</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : "Not saved yet"}
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Property Name"
          value={property.name}
          placeholder="e.g. Maple Street Rental"
          onChange={(v) => onText("name", v)}
        />
        <TextField
          label="Address"
          value={property.address}
          placeholder="e.g. 742 Maple St"
          onChange={(v) => onText("address", v)}
        />
        <TextField
          label="City / State"
          value={property.cityState}
          placeholder="e.g. Springfield, IL"
          onChange={(v) => onText("cityState", v)}
        />
        <Field
          label="Beds"
          kind="number"
          placeholder="e.g. 3"
          value={property.beds}
          onCommit={(v) => onNum("beds", v)}
        />
        <Field
          label="Baths"
          kind="number"
          placeholder="e.g. 2"
          value={property.baths}
          onCommit={(v) => onNum("baths", v)}
        />
        <Field
          label="Square Footage"
          kind="number"
          placeholder="e.g. 1400"
          value={property.sqft}
          onCommit={(v) => onNum("sqft", v)}
        />
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5">
      <span className="font-semibold text-white">
        {value == null ? "—" : fmtNum(value, value % 1 === 0 ? 0 : 1)}
      </span>
      {label}
    </span>
  );
}
