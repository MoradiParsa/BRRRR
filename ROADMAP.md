# Roadmap

Status of the standalone **BRRRR AI — Local** tool. Everything stays free, local, and
offline — no paid APIs, no scraping, no backend.

## Done

- Single-file, offline, dependency-free app (`BRRRR_AI_Local.html`).
- **Light premium theme** — clean white/off-white financial-software look.
- Navigation: Dashboard · Import · Properties · Analyze · Compare · Settings.
- **Renovation Planner** — line items by category that feed the rehab cost (manual override).
- **Unit-level rent roll** for multifamily (units × rent/unit + other income, or manual total);
  each multifamily deal is underwritten as one total property.
- **Clear refinance-after-repair breakdown** (ARV, LTV, rate, term, refinance amount, original
  payoff, cash recovered, cash left, cash-out surplus, new monthly mortgage) for SF and MF.
- **Manual comp selection** — search/filter your properties and pick exactly which comps drive
  the ARV; optional lower/similar/higher suggestions you can keep, replace, or remove.
- **One master CSV import** — a broad property list, fuzzy header matching, and an
  `extraFields` catch-all so unrecognized columns are kept, not discarded.
- **Markets**: grouping + filtering (DFW, Houston, College Station, Austin,
  San Antonio, Other, plus custom labels); market taken from the CSV or inferred
  from the city. Dashboard shows a per-market breakdown.
- Property-type inference (single-family vs multifamily) from `units` / type text.
- Separate assumption profiles for single-family and multifamily, editable on a
  pre-import step and in Settings.
- BRRRR engine: grade, recommendation, cash flow, DSCR, cap rate, cash-on-cash,
  capital-recovery %, forced equity, break-even rent, sensitivity analysis.
- Comp scoring (market, city/zip, type, units, beds/baths, sqft, sold-price recency,
  condition, distance) powers the optional suggestions and the ranked picker.
- Rule-based renovation condition (word-boundary keyword matching).
- KPI dashboard, market filter chips, polished cards and empty states.
- Local backup: export / import / merge JSON (legacy comps-DB backups migrate into the
  master list); sample data loader.

## Next

- Exhaustive click-testing of every flow on the built file.
- Richer comps view: show the full ranked pool, not just the top 3.
- Weight sold comps over active-listing comps more strongly in the ARV range.
- More sample data (varied markets and property types).

## Later / ideas

- Optional online Leaflet tile map (would make *only* the map background need internet;
  keep the offline coordinate plot as the fallback).
- Print / PDF deal report.
- Cash-flow and equity-over-time charts (inline SVG, no libraries).
- CSV export of the analyzed portfolio.

## Out of scope (by design)

- Paid AI / OCR / extraction services.
- Zillow / Redfin / Realtor scraping, Playwright, or any backend / external database.
- Anything that requires Node or a server at runtime.

## Legacy

The original Next.js + Playwright scraping app (`app/`, `lib/`, `lib/providers/`) is
kept for reference only and is not part of the standalone tool. `lib/brrrr.ts` remains
the source of truth for the BRRRR math that `local-html/app.js` ports.
