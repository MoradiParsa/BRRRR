/* -------------------------------------------------------------------------- */
/*  Playwright lifecycle helper (server-only, local, free).                    */
/*                                                                            */
/*  Playwright is loaded with a DYNAMIC import so it never enters the client   */
/*  bundle and is only pulled in when a browser scan actually runs. Combined   */
/*  with `serverComponentsExternalPackages` (next.config.mjs) and the          */
/*  `server-only` guard, the heavy native package + browser binary stay out of */
/*  the build. A normal desktop UA + viewport are used — no stealth, no        */
/*  bot-protection bypass.                                                     */
/* -------------------------------------------------------------------------- */

import "server-only";
import type { Browser, BrowserContext } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Launch Chromium. Headless unless SCANNER_BROWSER_HEADFUL=1 (to watch it). */
export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const headless = process.env.SCANNER_BROWSER_HEADFUL !== "1";
  return chromium.launch({ headless });
}

/** A context with a realistic UA + viewport (a normal browser, not a bot). */
export function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
  });
}

/** Close a browser without throwing (used in `finally`). */
export async function closeQuietly(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
}
