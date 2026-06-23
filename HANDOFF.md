# BRRRR App — Project Handoff Report (post local-HTML pivot)

> Point-in-time snapshot written 2026-06-17. The app pivoted to a standalone single-file
> local HTML tool. Verify file/line claims against current code before relying on them.

## What this project is now
A **standalone, single-file, dependency-free real-estate (BRRRR) analyzer** that runs by
double-clicking one HTML file. No server, no Node at runtime, no network, no APIs, no
database. Data persists in browser `localStorage`. This **replaced** the previous Next.js +
Playwright scraping app (now legacy, see below).

**Deliverable:** `BRRRR_AI_Local.html` (~111 KB) at the repo root. A copy was also placed on
the user's Desktop (`C:\Users\parsa\Desktop\BRRRR_AI_Local.html`). It is fully self-contained
(inline CSS + JS, **zero external/CDN dependencies**) and works offline. Share it by sending
the single file; move data between people via Settings → Export/Import Backup (JSON).

**Repo:** `C:\Users\parsa\Desktop\BRRRR`
**Branch:** `feature/pdf-property-extraction` (last commit `51f21dd` — pre-pivot)
**Git status:** pivot work is **uncommitted** — untracked `BRRRR_AI_Local.html`, untracked
`local-html/`, untracked `HANDOFF.md`; modified `package.json` (added `build:local` script)
and `.claude/launch.json` (added `local` static-server config).

## Hard constraints (must keep)
- No paid APIs, no Anthropic/OpenAI, no paid AI/OCR.
- No Zillow/Redfin/Realtor scraping, no Playwright, no backend, no external DB.
- No Node required after build; output HTML must run from `file://` by double-click.
- **Do not modify `lib/brrrr.ts`** — it remains the BRRRR engine source of truth. The
  standalone's engine is a **verbatim JS port** of it; keep them in sync if either changes.
- Property import stays free/local.

## Architecture
```
local-html/                 ← editable source
  index.html                ← minimal shell (<link styles.css> + <script app.js>)
  styles.css                ← all styling (dark theme, CSS vars)
  app.js                    ← ENTIRE app in one IIFE: engine + data model + UI, zero deps
  build.mjs                 ← inlines css+js into ../BRRRR_AI_Local.html (Node, build-time only)
  serve.mjs                 ← tiny static server for local testing only (NOT shipped)
BRRRR_AI_Local.html         ← built deliverable (generated; do not hand-edit)
```
- **Build:** `npm run build:local` (= `node local-html/build.mjs`). Replaces the
  `<link>`/`<script src>` tags with inline `<style>`/`<script>` and writes
  `BRRRR_AI_Local.html`. Guards against a literal closing-script tag in `app.js`.
- **localStorage key:** `brrrr-local-v1`. Backup JSON shape = the whole `STATE`
  (`{version, properties[], assumptions, compareIds[]}`).
- `app.js` sections (numbered in comments): 1 Engine (ported), 2 Data model/defaults,
  3 Renovation detection, 4 Comp suggestions + ARV range, 5 CSV import (fuzzy matching),
  6 Store, 7 Utilities, 8 Router/shell, 9–16 Views, 17 bootstrap.
- **Views / nav:** Dashboard · Properties (list + CSV import) · Map · Deal Queue · Pipeline ·
  Compare · Settings; plus per-property Workspace (`#/property/:id`).

## Engine port (faithful to `lib/brrrr.ts`)
`analyze`, `summarize` (score/grade/recommendation/risk/confidence + strengths/weaknesses),
`sensitivity` (rent/rate/rehab/ARV stress + combined worst case), `analyzeComps`,
`arvForSource`, `investmentGrade`/`gradeRank`, formatters. Hand-verified one deal end-to-end
(Maple St: refi $172.5k @ 7.25% → ~$1,177/mo, NOI $1,118 → −$59 CF, DSCR 0.95) — matches
original exactly.

## Features implemented (all requested)
- Manual property entry; CSV import with **fuzzy header matching** across all 25 requested
  columns (specific-first so "sold price" beats "price"); dedupe/merge on re-import by
  listing link or address.
- BRRRR calculator (3 phases), Deal Queue (Watch/Analyze/Pipeline/Ignore), Acquisition
  Pipeline (6-stage kanban), Compare (up to 4, side-by-side table), Sensitivity analysis.
- **Map:** offline SVG **coordinate plot** (pins by lat/lng on a scaled grid, colored by
  grade, hover tooltip, click-to-open). No tiles/Leaflet/Google — chosen for offline
  reliability. Shows "lat/lng required" empty state.
- **Listing links:** Open Listing / Photos / Source buttons in workspace + comps.
- **Renovation detection:** local keyword rules → Recently Renovated / Updated / Light
  Updates / Needs Renovation / Unknown, with High/Med/Low confidence + matched keywords.
  (Conflicting "needs work" signals win, conservatively.)
- **Comp suggestions:** best 3 from local data (lower / similar / higher); each card shows
  address, sold/list price, $/sqft, beds/baths, condition, distance (haversine if lat/lng),
  sold date, link, and "why". Keep / exclude / remove / open.
- **ARV range:** Conservative / Expected / Aggressive + confidence + $/sqft range
  (reno-adjusted ppsf × subject sqft). Calculator ARV source toggles
  Manual / Conservative / Expected / Aggressive.
- **Backup:** Export/Import JSON (merge or replace), Clear-all, Load-sample-data; editable
  default assumptions (seed new/imported props only).

## Verified working (against the built single file via static server, no console errors)
Dashboard stats + top-opportunities ranking; Properties list + reno badges; Workspace full
analysis + strengths/weaknesses + comp suggestions + ARV range + all 4 ARV-source buttons +
sensitivity; Map (4 pins); "Load sample properties". Screenshots of Dashboard + Map confirmed.
**Not exhaustively click-tested** (same proven render/bind patterns, no errors): Deal Queue
action buttons, Pipeline stage moves, Compare checkboxes, CSV *file* drop/import, Backup
export/import.

## Example/format reference
User's prior `C:\Users\parsa\Downloads\cre-dashboard 2.html` is the target format (single
self-contained HTML, double-click). It uses CDN Leaflet + Leaflet-heat + PapaParse (needs
internet). Ours intentionally has no CDN deps. User may later want a real Leaflet tile map
*when online* matching that example — would make only the map background require internet.

## Windows / preview-harness gotchas
- Node at `C:\Program Files\nodejs\` — prepend to PATH; `.claude/launch.json` configs use
  full paths.
- `local` launch config = `local-html/serve.mjs` static server on port 3100
  (`/` → `BRRRR_AI_Local.html`); no HMR, so `preview_screenshot` works there (the Next `dev`
  server times out screenshots).
- `preview_eval` that changes `location.hash` / navigates **inside async `setTimeout`/Promise**
  gets discarded (returns `{}`, nav reverts). Change hash synchronously and read DOM in the
  *next* eval; seed by writing `localStorage` + `location.reload()`. `preview_click` appears
  to reload the page.

## Outstanding / next steps (only if asked)
1. **Legacy cleanup** — old Next.js stack (`app/`, `app/api/`, `lib/providers/`, Playwright
   dep in `package.json`) is unused by the standalone, still on disk. Offered to delete; not
   yet done.
2. **Commit** the pivot (and maybe rename branch to reflect it). Nothing committed yet.
3. Optional: Leaflet tile map (online) per the example; exhaustive click-test of
   queue/pipeline/compare/CSV-file/backup; more sample data.

## Memory (already saved, persists across chats)
`local-html-pivot.md` (the pivot + build/deliverable model), `brrrr-env-setup.md`
(Windows/preview quirks incl. the items above), `no-paid-extraction.md` (free/local).
