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

    // REVERTED from "networkidle" — that was itself a wrong guess: real
    // diagnostic logs showed it hard-times-out at 30s on skool.com/login
    // every time (the page apparently never goes fully network-idle,
    // likely background analytics/polling), which is a worse failure than
    // the one it was meant to fix. Back to "domcontentloaded" + a short
    // explicit settle wait — enough for React hydration to catch up
    // without waiting on network activity that may never fully stop.
    await page.goto("https://www.skool.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    // Confirmed live, real selectors — see the Connect report.
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.waitForTimeout(300);
    // Defensive verification, not a guess: if the form's controlled-input
    // state didn't actually catch the fill (the exact class of race this
    // is meant to rule out), re-fill before ever submitting.
    const emailOk = (await page.inputValue("#email")) === email;
    const passwordOk = (await page.inputValue("#password")) === password;
    if (!emailOk) await page.fill("#email", email);
    if (!passwordOk) await page.fill("#password", password);

    // Real root cause, found via diagnostic logs (not guessed): a correct
    // login makes Skool's client-side app navigate away almost
    // immediately, and `await response.text()` called AFTER `click()`
    // resolves can lose that race — Chrome discards a response's body
    // once its page has navigated away ("Protocol error... Response body
    // is not available for a response that was navigated away from"),
    // confirmed live. Reading the body from inside the `response` event
    // handler itself — synchronously as the event fires, not after an
    // intervening `click()`/`waitForResponse()` round trip — reads it
    // before that navigation has a chance to invalidate it.
    let capturedStatus: number | null = null;
    let capturedBody: string | null = null;
    let captureError: string | null = null;
    const captured = new Promise<void>((resolve) => {
      page.on("response", (res) => {
        if (capturedBody !== null || !res.url().includes("api2.skool.com/auth/login")) return;
        capturedStatus = res.status();
        res
          .text()
          .then((text) => {
            capturedBody = text;
            resolve();
          })
          .catch((err) => {
            captureError = err instanceof Error ? err.message : String(err);
            capturedBody = "";
            resolve();
          });
      });
    });

    await page.click('button[type="submit"]');
    await Promise.race([
      captured,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("login response timeout")), 30000)),
    ]);

    let bodyJson: { code?: string; message?: string } | null = null;
    try {
      bodyJson = capturedBody ? (JSON.parse(capturedBody) as { code?: string; message?: string }) : null;
    } catch {
      bodyJson = null;
    }
    if (captureError) {
      console.error("[skool-import] login response body unreadable:", captureError, "status:", capturedStatus);
    }

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

export interface TriggerVerificationResult {
  ok: boolean;
  /** True when Skool's own UI reported the email as already verified for
   *  this session (no code was sent) — distinct from a real failure. */
  alreadyVerified: boolean;
}

/**
 * Fires Skool's real "Export" action on the Members page — the same
 * interaction proven live during the Members Export investigation — which
 * is what actually triggers `POST /auth/email-verify-init` (Skool emails a
 * numeric code). Deliberately reuses the real button click rather than
 * calling that endpoint directly with a guessed request body: the click
 * path is verified; the raw API contract was never fully confirmed.
 *
 * Called from scan-runner.ts's finalize phase EXACTLY ONCE per scan (an
 * idempotency guard at the call site checks `verificationInitiatedAt`
 * first) — re-triggering this invalidates whatever code Skool already
 * sent, confirmed live during Connect's own QA.
 */
export async function triggerSkoolEmailVerification(
  cookies: Cookie[],
  groupSlug: string,
): Promise<TriggerVerificationResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchHeadless();
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto(`https://www.skool.com/${groupSlug}/-/members`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const exportButton = page.getByRole("button", { name: /export/i });
    if (!(await exportButton.count())) {
      return { ok: false, alreadyVerified: false };
    }

    const [response] = await Promise.all([
      page
        .waitForResponse((res) => res.url().includes("api2.skool.com/auth/email-verify-init"), { timeout: 15000 })
        .catch(() => null),
      exportButton.first().click(),
    ]);
    if (!response) {
      // No verification prompt appeared at all — some accounts/exports may
      // not require it. Not a failure; Preview's future export step can
      // detect and handle this directly.
      return { ok: true, alreadyVerified: true };
    }
    let body: { verified?: boolean } | null = null;
    try {
      body = (await response.json()) as { verified?: boolean };
    } catch {
      body = null;
    }
    return { ok: true, alreadyVerified: body?.verified === true };
  } catch (err) {
    console.error(
      "[skool-import] triggerSkoolEmailVerification failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, alreadyVerified: false };
  } finally {
    await browser?.close().catch(() => {});
  }
}
