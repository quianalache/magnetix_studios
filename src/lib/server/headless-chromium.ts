import "server-only";

import { chromium, type Browser } from "playwright-core";

/**
 * Short-lived headless Chromium for server work — the ONE launcher, shared by
 * the Skool importer (skool-import/headless-browser.ts, which keeps its own
 * login, cookies, navigation and extraction) and Pages & Funnels thumbnails
 * (pages-funnels/page-thumbnail-service.ts). Infrastructure only: no
 * feature logic, no shared browser, context or session state. On Vercel,
 * `@sparticuz/chromium-min` downloads its pinned Chromium pack at cold start;
 * locally it falls back to a desktop Chrome install. Both packages are kept
 * unbundled via `serverExternalPackages` in next.config.ts, and any route
 * that calls this needs a bracket-free `outputFileTracingIncludes` key for
 * playwright-core's browsers.json (next.config.ts).
 *
 * Every caller launches, does one job and closes — no long-lived browser.
 */
const CHROMIUM_PACK_URL = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const LOCAL_DEV_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
];

export async function launchHeadlessChromium(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromiumMin = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await chromiumMin.executablePath(CHROMIUM_PACK_URL);
    return chromium.launch({ args: chromiumMin.args, executablePath, headless: true });
  }
  const fs = await import("node:fs");
  const executablePath = LOCAL_DEV_CHROME_PATHS.find((p) => fs.existsSync(p));
  return chromium.launch({ executablePath, headless: true });
}
