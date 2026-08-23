import "server-only";

import { chromium, type Browser, type Cookie } from "playwright-core";
import type { SkoolTransport } from "./cdp-browser-transport";

/**
 * Programmatic Skool authentication — the piece the original importer
 * (skool-session.ts's `createBrowserBridgedSkoolSession`) explicitly left
 * as a future seam: "A future self-service `PasswordSkoolSessionProvider`
 * would perform its own login... hand back a `SkoolSession` with a
 * different `SkoolTransport` implementation." This module IS that provider.
 *
 * Architecture (verified live before writing a line of this file — see the
 * Skool Import Connect report):
 *  - Skool's CloudFront/WAF blocks a bare Node `fetch()`, even with a valid
 *    cookie, but does NOT specifically block a headless (non-interactive)
 *    Chromium instance — confirmed by extracting real cookies from a live
 *    authenticated session and successfully fetching an authenticated page
 *    through a completely separate, freshly-launched headless browser with
 *    no prior interactive history at all.
 *  - That means NO long-lived browser process needs to survive across
 *    separate HTTP requests (which a Vercel serverless deployment cannot
 *    provide anyway — see the Connect report's hosting section). The
 *    "session" is really just securely-stored cookies (session-store.ts);
 *    every request that needs Skool launches its OWN short-lived headless
 *    browser, injects those cookies, does its work, and closes.
 *  - `@sparticuz/chromium-min` supplies a Lambda/Vercel-compatible Chromium
 *    binary, fetched from a pinned GitHub Release tarball at cold start
 *    (kept `-min`, not the ~50MB+ bundled variant, specifically to stay
 *    inside Vercel's per-function deployment size limit — see the report).
 *    Local dev (no `VERCEL` env) falls back to a real desktop Chrome
 *    install instead, since the Lambda-built binary doesn't run on macOS.
 */

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

/** Best-effort local-dev fallback — never relied on in production. */
const LOCAL_DEV_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
];

async function resolveExecutablePath(): Promise<string | undefined> {
  if (process.env.VERCEL) {
    const chromiumMin = await import("@sparticuz/chromium-min");
    return chromiumMin.default.executablePath(CHROMIUM_PACK_URL);
  }
  const fs = await import("node:fs");
  for (const p of LOCAL_DEV_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return undefined; // let Playwright try its own default — local dev only
}

async function launchHeadless(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();
  if (process.env.VERCEL) {
    const chromiumMin = (await import("@sparticuz/chromium-min")).default;
    return chromium.launch({
      args: chromiumMin.args,
      executablePath,
      headless: true,
    });
  }
  return chromium.launch({ executablePath, headless: true });
}

export interface SkoolLoginResult {
  ok: boolean;
  cookies: Cookie[] | null;
  /** Product-facing, never a raw Skool/browser error string — see the
   *  Connect route for how this maps to the approved copy. */
  errorKind: "invalid-credentials" | "browser-failure" | null;
}

/**
 * Performs the real login against Skool's own login form, in a fresh
 * headless browser instance. The password is read once, used once, and
 * never leaves this function's stack — never logged, never written
 * anywhere, never returned to the caller.
 */
export async function loginToSkool(email: string, password: string): Promise<SkoolLoginResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchHeadless();
    const context = await browser.newContext();
    const page = await context.newPage();

    // TEMPORARY diagnostic (2026-08-24) — logs ONLY Skool's own generic
    // response shape (status + its own `code`/`message` strings, e.g.
    // "AUTH-LG-503") for every request to api2.skool.com/auth/* during
    // this call, to see exactly what a REAL correct-credential attempt
    // gets back. Never logs email/password/cookies. Remove once the real
    // login path is confirmed working end-to-end.
    page.on("response", async (res) => {
      if (!res.url().includes("api2.skool.com/auth/")) return;
      try {
        const ct = res.headers()["content-type"] ?? "";
        const body = ct.includes("json") ? await res.json().catch(() => null) : null;
        console.log("[skool-import][diag] auth response:", res.url(), res.status(), JSON.stringify(body));
      } catch {
        /* diagnostic only */
      }
    });

    await page.goto("https://www.skool.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Confirmed live, real selectors — see the Connect report.
    await page.fill("#email", email);
    await page.fill("#password", password);

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("api2.skool.com/auth/login"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);

    let bodyJson: { code?: string; message?: string } | null = null;
    try {
      bodyJson = (await response.json()) as { code?: string; message?: string };
    } catch {
      bodyJson = null;
    }
    console.log(
      "[skool-import][diag] login response status:",
      response.status(),
      "bodyJson:",
      JSON.stringify(bodyJson),
    );

    // Confirmed live: a failed login still returns HTTP 200 with a `code`
    // field (e.g. "AUTH-LG-503") — status code alone can't distinguish
    // success from failure here, the response body must be inspected.
    if (bodyJson?.code) {
      return { ok: false, cookies: null, errorKind: "invalid-credentials" };
    }

    // Give the client-side redirect a moment to land before harvesting
    // cookies, so we capture the fully-settled authenticated session.
    await page.waitForTimeout(1500);
    const cookies = await context.cookies("https://www.skool.com");
    if (cookies.length === 0) {
      return { ok: false, cookies: null, errorKind: "browser-failure" };
    }
    return { ok: true, cookies, errorKind: null };
  } catch (err) {
    // Sanitized ops log only — Playwright's own errors (timeouts, nav
    // failures) never embed form field VALUES, only selectors/URLs/status
    // codes, so this is safe. Never logs `email`/`password` themselves.
    console.error("[skool-import] loginToSkool failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, cookies: null, errorKind: "browser-failure" };
  } finally {
    await browser?.close().catch(() => {});
  }
}

export interface CommunityAccessResult {
  ok: boolean;
  communityName: string | null;
  errorKind: "not-found-or-inaccessible" | "browser-failure" | null;
}

/**
 * Confirms the just-authenticated account can actually see the requested
 * Skool community (not just that login succeeded) — a fresh headless
 * browser, seeded with the cookies from `loginToSkool`, fetching the
 * community's own feed page and reading its real `__NEXT_DATA__`
 * (`currentGroup.name`), the same structured source the rest of the
 * importer already relies on (skool-client.ts).
 */
export async function validateSkoolCommunityAccess(
  cookies: Cookie[],
  groupSlug: string,
): Promise<CommunityAccessResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchHeadless();
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    const response = await page.goto(`https://www.skool.com/${groupSlug}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!response || !response.ok()) {
      return { ok: false, communityName: null, errorKind: "not-found-or-inaccessible" };
    }

    const html = await page.content();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      return { ok: false, communityName: null, errorKind: "not-found-or-inaccessible" };
    }
    const parsed = JSON.parse(match[1]) as {
      props?: { pageProps?: { currentGroup?: { name?: string } } };
    };
    const name = parsed.props?.pageProps?.currentGroup?.name?.trim();
    if (!name) {
      return { ok: false, communityName: null, errorKind: "not-found-or-inaccessible" };
    }
    return { ok: true, communityName: name, errorKind: null };
  } catch (err) {
    console.error(
      "[skool-import] validateSkoolCommunityAccess failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, communityName: null, errorKind: "browser-failure" };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * The reusable transport future Scan/Verify/Preview steps will consume —
 * implements the SAME `SkoolTransport` interface `CdpBrowserTransport`
 * does, so `skool-client.ts`/`skool-extract.ts` need zero changes to work
 * against a self-service session instead of a manually-bridged dev tab.
 * Launches a fresh headless browser per `fetchText` call (see this
 * module's header comment for why that's the correct, not a compromised,
 * design for this hosting environment), seeded with the session's stored
 * cookies. NOT used by the Connect step itself — exported here as the
 * foundation Step 2 (Scan) will build on.
 */
export class CookieSeededHeadlessTransport implements SkoolTransport {
  constructor(private readonly cookies: Cookie[]) {}

  async fetchText(url: string): Promise<string> {
    const browser = await launchHeadless();
    try {
      const context = await browser.newContext();
      await context.addCookies(this.cookies);
      const page = await context.newPage();
      // Land on skool.com first so an in-page `fetch` below has a real
      // same-origin document to run from — then fetch the ACTUAL target
      // through the page's own `fetch`, same as CdpBrowserTransport. This
      // (not `page.goto` + `page.content()`) is what correctly handles
      // BOTH SSR HTML pages (__NEXT_DATA__) and api2.skool.com's raw JSON
      // responses identically — a JSON `page.goto` would come back
      // wrapped in Chrome's own JSON-viewer markup instead of raw text.
      await page.goto("https://www.skool.com", { waitUntil: "domcontentloaded", timeout: 30000 });
      const result = await page.evaluate(async (targetUrl) => {
        const res = await fetch(targetUrl, { credentials: "include" });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      }, url);
      if (!result.ok) {
        throw new Error(`Skool request failed (${url}): HTTP ${result.status}`);
      }
      return result.text;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
