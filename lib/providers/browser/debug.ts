/* -------------------------------------------------------------------------- */
/*  TEMPORARY scanner debugging (stabilization).                               */
/*                                                                            */
/*  Gated by SCANNER_DEBUG=1. When on, the Redfin browser scan logs each step  */
/*  to the server console and dumps the rendered HTML of any listing it can't  */
/*  parse into .debug/redfin/ (gitignored) so the page can be inspected later. */
/*  This is diagnostic scaffolding, not a feature — safe to remove later.      */
/* -------------------------------------------------------------------------- */

import "server-only";

export const DEBUG = process.env.SCANNER_DEBUG === "1";

export function dbg(...args: unknown[]): void {
  if (DEBUG) console.log("[scan:redfin]", ...args);
}

/** Write rendered HTML to .debug/redfin/<timestamp>__<name>.html (debug only). */
export async function dumpHtml(
  subdir: string,
  name: string,
  html: string,
): Promise<string | null> {
  if (!DEBUG) return null;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), ".debug", subdir);
    await fs.mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = (name || "page").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    const file = path.join(dir, `${ts}__${safe}.html`);
    await fs.writeFile(file, html, "utf8");
    return file;
  } catch (e) {
    if (DEBUG) console.log("[scan:redfin] dumpHtml failed:", e);
    return null;
  }
}
