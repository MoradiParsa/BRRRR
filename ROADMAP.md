# Roadmap

Status of the standalone **BRRRR AI — Local** tool. Everything stays free, local, and
offline — no paid APIs, no scraping, no backend.

## Done

- Single-file, offline, dependency-free app (`BRRRR_AI_Local.html`).
- Simplified navigation: Dashboard · Properties · Analyze · Compare · Settings.
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
- **Comps from the same list**: every other property is ranked as a comp (market,
  city/zip, type, units, beds/baths, sqft, sold-price recency, condition, distance)
  into a lower / similar / higher pick you can keep, replace, remove, or open — feeding
  a Conservative / Expected / Aggressive ARV range and the ARV-source toggle.
- Rule-based renovation condition (word-boundary keyword matching).
- Premium UI pass: refined dark theme, KPI dashboard, filter chips, polished cards
  and empty states.
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
