import "server-only";

import { chromium, type Browser, type BrowserContext, type Cookie } from "playwright-core";
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

export interface ConnectToSkoolResult {
  ok: boolean;
  cookies: Cookie[] | null;
  communityName: string | null;
  /** Product-facing, never a raw Skool/browser error string — see the
   *  Connect route for how this maps to the approved copy. */
  errorKind: "invalid-credentials" | "not-found-or-inaccessible" | "browser-failure" | null;
}

/**
 * Performs the real login against Skool's own login form AND confirms the
 * authenticated account can see the requested community — in ONE Chromium
 * lifecycle. Previously these were two separate functions, each launching
 * its own headless browser (`loginToSkool` then `validateSkoolCommunityAccess`
 * on a second, freshly-launched instance). Real production evidence (see
 * docs/debug/skool-connect-diagnostic.md) showed that second launch is the
 * actual failure point — `page.goto` throwing "Target page, context or
 * browser has been closed" on a real attempt where login itself had
 * already succeeded. There's no architectural reason Connect needs two
 * browsers: the same authenticated context that just logged in can
 * navigate straight to the community page before ever closing. (Scan,
 * later, legitimately launches its OWN fresh cookie-seeded browser in a
 * SEPARATE request via `CookieSeededHeadlessTransport` — that's a
 * different call, at a different time, and is unaffected by this change.)
 *
 * The password is read once, used once, and never leaves this function's
 * stack — never logged, never written anywhere, never returned to the
 * caller. Cookies are only returned once BOTH login and community access
 * are confirmed — the caller only ever persists a session that's already
 * fully proven, never a partial one.
 */
export async function connectToSkool(
  email: string,
  password: string,
  groupSlug: string,
): Promise<ConnectToSkoolResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchHeadless();
    const context = await browser.newContext();
    const page = await context.newPage();

    // "domcontentloaded" + a short explicit settle wait — enough for React
    // hydration to catch up without waiting on network activity that may
    // never fully stop ("networkidle" was tried and hard-times-out at 30s
    // on this page every time, confirmed live — see the diagnostic report).
    await page.goto("https://www.skool.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    // Confirmed live, real selectors — see the Connect report.
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.waitForTimeout(300);
    // Defensive verification, not a guess: if the form's controlled-input
    // state didn't actually catch the fill, re-fill before ever submitting.
    const emailOk = (await page.inputValue("#email")) === email;
    const passwordOk = (await page.inputValue("#password")) === password;
    if (!emailOk) await page.fill("#email", email);
    if (!passwordOk) await page.fill("#password", password);

    // Real root cause, found via diagnostic logs (not guessed): a correct
    // login makes Skool's client-side app navigate away almost
    // immediately, and `await response.text()` called AFTER `click()`
    // resolves can lose that race — Chrome discards a response's body
    // once its page has navigated away. Reading the body from inside the
    // `response` event handler itself, registered before the click, reads
    // it before that navigation can invalidate it.
    let capturedBody: string | null = null;
    const captured = new Promise<void>((resolve) => {
      page.on("response", (res) => {
        if (capturedBody !== null || !res.url().includes("api2.skool.com/auth/login")) return;
        res
          .text()
          .then((text) => {
            capturedBody = text;
            resolve();
          })
          .catch(() => {
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

    // The response body's `code` field is NOT a trustworthy success/failure
    // signal on its own — confirmed live, Skool returns opaque codes
    // ("AUTH-LG-503", "AUTH-LG-002", "AUTH-LG-502", ...) that don't map 1:1
    // to real outcome. Most notably, "AUTH-LG-002" has been confirmed live
    // to appear on logins that go on to fully authenticate (normal
    // authenticated requests fire and the app navigates in, unprompted, no
    // verification UI of any kind ever appears) — see the diagnostic
    // report. So `code` is logged for ops visibility only and is NEVER used
    // to decide success or failure, and is never shown to the user or
    // interpreted as a verification challenge.
    let bodyJson: { code?: string } | null = null;
    try {
      bodyJson = capturedBody ? (JSON.parse(capturedBody) as { code?: string }) : null;
    } catch {
      bodyJson = null;
    }
    if (bodyJson?.code) {
      console.log("[skool-import] login response included code (informational only):", bodyJson.code);
    }

    // The one signal confirmed reliable across every real attempt: whether
    // Skool's own client app actually navigates away from /login. A
    // rejected login (wrong password, confirmed live) leaves the user on
    // /login with an inline error and creates no real session. A login
    // that truly succeeds redirects into the app within ~2s regardless of
    // whether a `code` was present. Check the URL first — before ever
    // trusting cookies, since Skool sets baseline WAF/analytics cookies
    // regardless of whether login succeeded.
    await page.waitForTimeout(2500);

    if (page.url().includes("/login")) {
      return { ok: false, cookies: null, communityName: null, errorKind: "invalid-credentials" };
    }

    const cookies = await context.cookies("https://www.skool.com");
    if (cookies.length === 0) {
      return { ok: false, cookies: null, communityName: null, errorKind: "browser-failure" };
    }

    // Authenticated — now confirm the SAME account can actually see the
    // requested community, in the SAME browser/context, before it ever
    // closes. Reads the community's own feed page's real `__NEXT_DATA__`
    // (`currentGroup.name`), the same structured source the rest of the
    // importer already relies on (skool-client.ts).
    const communityResponse = await page.goto(`https://www.skool.com/${groupSlug}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!communityResponse || !communityResponse.ok()) {
      return { ok: false, cookies: null, communityName: null, errorKind: "not-found-or-inaccessible" };
    }

    const html = await page.content();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      return { ok: false, cookies: null, communityName: null, errorKind: "not-found-or-inaccessible" };
    }
    const parsed = JSON.parse(match[1]) as {
      props?: { pageProps?: { currentGroup?: { name?: string } } };
    };
    const name = parsed.props?.pageProps?.currentGroup?.name?.trim();
    if (!name) {
      return { ok: false, cookies: null, communityName: null, errorKind: "not-found-or-inaccessible" };
    }

    return { ok: true, cookies, communityName: name, errorKind: null };
  } catch (err) {
    // Sanitized ops log only — Playwright's own errors (timeouts, nav
    // failures) never embed form field VALUES, only selectors/URLs/status
    // codes, so this is safe. Never logs `email`/`password` themselves.
    console.error("[skool-import] connectToSkool failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, cookies: null, communityName: null, errorKind: "browser-failure" };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * The reusable transport Scan (and future Verify/Preview steps) consumes —
 * implements the SAME `SkoolTransport` interface `CdpBrowserTransport`
 * does, so `skool-client.ts`/`skool-extract.ts` need zero changes to work
 * against a self-service session instead of a manually-bridged dev tab.
 *
 * ONE Chromium process per transport INSTANCE, reused across every
 * `fetchText` call made through it — NOT one process per call. That used
 * to be the design (launch, use once, close, repeat), and real production
 * evidence proved it unsafe the moment a phase needed more than a couple
 * of fetches: `extractAllMembers` fetches four membership tabs
 * CONCURRENTLY (`Promise.all`), each internally paginated — with a fresh
 * Chromium launch per fetch, that meant multiple `chromium.launch()` calls
 * racing to spawn/extract the SAME cached binary at the SAME time, which
 * is exactly what `browserType.launch: spawn ETXTBSY` ("text file busy")
 * means: two launches contending for the same executable file. A separate
 * failure, `page.goto: Target page, context or browser has been closed`,
 * came from the same root cause — a browser torn down by one in-flight
 * call while another call sharing timing assumptions was still using it.
 *
 * The fix: launch the browser+context ONCE, lazily, memoized so concurrent
 * callers racing in before it's ready all await the SAME launch instead of
 * triggering their own. Every `fetchText` call then just opens (and
 * closes) its own `page` within that ALREADY-RUNNING browser — Playwright
 * fully supports many concurrent pages in one context, so the existing
 * concurrent-fetch call patterns in skool-extract.ts need no changes at
 * all. Callers own the transport's lifecycle explicitly via `close()` —
 * this class never closes itself between calls, and the caller (see
 * scan-runner.ts) is responsible for exactly one `close()` per QStash
 * step, in a `finally`, matching Part 1's "one browser lifecycle per
 * scan-step request" requirement.
 */
export class CookieSeededHeadlessTransport implements SkoolTransport {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private ready: Promise<void> | null = null;

  constructor(private readonly cookies: Cookie[]) {}

  private async ensureReady(): Promise<void> {
    if (this.context) return;
    if (!this.ready) {
      this.ready = (async () => {
        const browser = await launchHeadless();
        const context = await browser.newContext();
        await context.addCookies(this.cookies);
        this.browser = browser;
        this.context = context;
      })();
    }
    await this.ready;
  }

  async fetchText(url: string): Promise<string> {
    await this.ensureReady();
    const page = await this.context!.newPage();
    try {
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
      await page.close().catch(() => {});
    }
  }

  /** Closes the ONE underlying Chromium process. Safe to call even if
   *  `fetchText` was never called (no-op) or already failed. Must be
   *  called exactly once per transport instance, in the caller's
   *  `finally`, so no browser process ever outlives its scan-step. */
  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.ready = null;
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
