# BRRRR AI — Local

A **standalone, single-file, offline** real-estate analyzer for the BRRRR strategy
(Buy, Rehab, Rent, Refinance, Repeat). The whole app is one HTML file you open by
double-clicking — no server, no Node at runtime, no network calls, no accounts, and
no paid APIs. All data stays in your browser's `localStorage`.

It's a light, clean interface meant to feel like modern financial software. CSV import is
the main workflow: drop in **one master CSV** of properties and every deal is scored with
an investment grade, cash-flow projection, ARV range, and sensitivity analysis. Works for
both single-family and multifamily (each multifamily deal is underwritten as one total
property, with an optional per-unit rent roll). When you analyze a property, you **pick**
which of your other properties to use as comps — no second file to manage.

## Run it

**Option A — just open the file (recommended).**

1. Open `BRRRR_AI_Local.html` in any modern browser (double-click it).
2. That's it. Your data is saved locally in that browser.

To share the tool, send the single `BRRRR_AI_Local.html` file. To move your *data*
between browsers or people, use **Settings → Export / Import Backup** (a JSON file).

**Option B — local static server (for development).**

```bash
npm run build:local     # rebuild BRRRR_AI_Local.html from local-html/ source
node local-html/serve.mjs   # serves the built file at http://localhost:3100
```

The app has six screens: **Dashboard · Import · Properties · Analyze · Compare · Settings**.

## Using it

1. **Import** — drop in one master CSV of properties (or add one by hand). Column headers
   are matched fuzzily, so most exports (MLS, Redfin, Zillow, spreadsheets) work as-is.
   Recognized fields include address, city/state/zip, **market/submarket**, price,
   **list price**, **sold price**, beds/baths/sqft, units, property type, rent,
   **rent per unit**, taxes, insurance, rehab estimate, ARV, listing & photo links, notes,
   description, renovation notes, sold date, lat/lng. Unrecognized columns are preserved
   (not discarded). Property type (single-family vs multifamily) is inferred from a `units`
   count and/or a `property type` column, and a **market** is inferred from the city when
   the CSV doesn't supply one. A pre-import step lets you confirm separate Single-Family
   and Multifamily assumption profiles.

2. **Properties** — every imported/added deal with its grade, condition, market, and
   cash flow, filterable by market (DFW, Houston, College Station, Austin, San Antonio,
   or any custom label).

3. **Analyze** — the per-property underwriting page (also reached by clicking any
   property). It has the subject details, a 3-phase BRRRR calculator, a **Renovation
   Planner** (line items by category that feed the rehab cost unless you override it),
   a unit-level **rent roll** for multifamily (units × rent/unit + other income, or a
   manual total), a clear **Refinance-after-repair** breakdown (ARV, LTV, rate, term,
   refinance amount, original payoff, cash recovered, cash left in deal, cash-out surplus,
   new monthly mortgage), a sensitivity table, and a **comps selector**: search/filter your
   other properties and pick exactly which to use — only the comps you select drive the
   Conservative / Expected / Aggressive ARV range. Optional lower / similar / higher
   suggestions are one click away; keep, replace, or remove each.

4. **Compare** — line up to four deals side by side.

5. **Settings** — edit default assumptions, load sample data, and export/import backups.

## Privacy

Everything runs locally in your browser. No property data, CSV, or backup ever leaves
your machine. Uploaded CSVs and exported backups are git-ignored and should never be
committed.

## Project layout

```
local-html/          ← editable source (build from here)
  index.html         ← minimal shell
  styles.css         ← all styling (dark theme)
  app.js             ← the entire app in one IIFE: engine + data model + UI
  build.mjs          ← inlines css + js into ../BRRRR_AI_Local.html
  serve.mjs          ← tiny static server for local testing (not shipped)
BRRRR_AI_Local.html  ← the built, shippable deliverable (generated)
```

The BRRRR math in `app.js` is a faithful port of `lib/brrrr.ts` (the legacy Next.js
app, kept for reference). If either changes, keep them in sync.

## Build

```bash
npm run build:local
```

This inlines `styles.css` and `app.js` into a single self-contained
`BRRRR_AI_Local.html` at the repo root. No build step is required to *use* the app.

See [ROADMAP.md](ROADMAP.md) for what's planned next.
