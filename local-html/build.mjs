/* ---------------------------------------------------------------------- */
/*  Build step: inline styles.css + app.js into a single self-contained    */
/*  BRRRR_AI_Local.html that runs by double-click (no Node/server/network). */
/*  Node is required ONLY here at build time — never for the output file.   */
/* ---------------------------------------------------------------------- */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const html = readFileSync(join(here, "index.html"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const js = readFileSync(join(here, "app.js"), "utf8");

// A literal closing-script tag inside the inlined JS would terminate the
// <script> block early. Guard against it (we never write one, but be safe).
if (js.includes("</scr" + "ipt>")) {
  throw new Error("app.js contains a literal closing script tag — would break inlining.");
}

// Use function replacers so `$` sequences in the source aren't treated as
// regex replacement patterns.
let out = html
  .replace(/<link[^>]*href="styles\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(
    /<script[^>]*src="app\.js"[^>]*><\/script>/,
    () => "<script>\n" + js + "\n</scr" + "ipt>",
  );

// The shippable single file, plus a root index.html so GitHub Pages serves the
// app at the repo's clean URL (https://<user>.github.io/<repo>/). Both are the
// identical self-contained output.
const dest = join(here, "..", "BRRRR_AI_Local.html");
const indexDest = join(here, "..", "index.html");
writeFileSync(dest, out, "utf8");
writeFileSync(indexDest, out, "utf8");

console.log(`Built ${dest} (${(out.length / 1024).toFixed(1)} KB)`);
console.log(`Built ${indexDest} (Pages entry)`);
