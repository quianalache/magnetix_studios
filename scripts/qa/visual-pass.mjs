#!/usr/bin/env node
/**
 * Magnetix visual QA harness (design-system Phase 0, 2026-10-13).
 *
 * Loads a list of routes at several widths in the system Chrome (via the
 * repo's own playwright-core — no browser download, no new dependency) and
 * reports layout problems the owner should never be the first to see:
 *
 *   - unexpected document overflow (the CRM shell is h-dvh with a scrolling
 *     <main>; a scrolling DOCUMENT means something escaped it — e.g. the
 *     2026-10-13 Chart Designs sr-only bug)
 *   - horizontal overflow
 *   - content hidden behind the phone bottom tab bar
 *   - missing sidebar / tab bar where the shell should show them
 *   - console errors, page errors, failed document loads, Next error overlays
 *   - the internal-CRM theme class on <html> and whether a dark-mode toggle is visible
 *   - optional axe-core accessibility violations (`--axe`; skipped if axe-core
 *     isn't resolvable)
 *
 * READ-ONLY BY DEFAULT: every non-GET request is aborted (and reported) except
 * /api/login and allow-listed read endpoints (`allowPost` in the routes file),
 * and the Firestore Write channel is blocked, so a QA pass can't change data.
 *
 * Usage:
 *   node scripts/qa/visual-pass.mjs run --base http://localhost:3000 \
 *     --routes scripts/qa/routes.example.json --vars sa=<subAccountId>,slug=<bookingSlug> \
 *     [--widths 390,820,1024,1280,1440] [--out /tmp/qa-run] [--token-file /tmp/qa-token.json] [--axe] [--only key1,key2]
 *   node scripts/qa/visual-pass.mjs compare <beforeDir> <afterDir> [--threshold 0.5]
 *
 * --token-file holds {"idToken": "..."} from scripts/qa/mint-qa-session.ts (keep it OUTSIDE the repo; delete after).
 * Exit code 1 when any check fails (run) or any screenshot differs past the threshold (compare).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const DEFAULT_WIDTHS = [390, 820, 1024, 1280, 1440];
const CHROME_PATHS = [
  process.env.QA_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function fillVars(path, vars) {
  return path.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`Route ${path} needs --vars ${k}=…`);
    return vars[k];
  });
}

async function run(args) {
  const { chromium } = require("playwright-core");
  const base = String(args.base ?? "http://localhost:3000").replace(/\/$/, "");
  const cfg = JSON.parse(readFileSync(resolve(args.routes ?? "scripts/qa/routes.example.json"), "utf8"));
  const vars = Object.fromEntries(String(args.vars ?? "").split(",").filter(Boolean).map((kv) => kv.split("=")));
  const widths = args.widths ? String(args.widths).split(",").map(Number) : DEFAULT_WIDTHS;
  const only = args.only ? new Set(String(args.only).split(",")) : null;
  const outDir = resolve(args.out ?? `qa-visual-${Date.now()}`);
  const settleMs = Number(args.settle ?? cfg.settleMs ?? 4000);
  mkdirSync(outDir, { recursive: true });
  const allowPost = (cfg.allowPost ?? []).map((p) => new RegExp(p));

  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome found — set QA_CHROME_PATH.");
  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({ viewport: { width: widths[0], height: 900 } });

  if (args["token-file"]) {
    const tok = JSON.parse(readFileSync(resolve(args["token-file"]), "utf8"));
    const res = await ctx.request.post(`${base}/api/login`, { headers: { Authorization: `Bearer ${tok.idToken}` } });
    if (!res.ok()) throw new Error(`/api/login failed: ${res.status()}`);
    // Also sign the browser's Firebase client SDK in (its default IndexedDB
    // persistence), so client-side Firestore reads — the agency theme, live
    // lists — behave as in a real signed-in browser. Without this only the
    // server session exists and client reads fail silently.
    if (tok.refreshToken && tok.uid && tok.apiKey) {
      const seed = await ctx.newPage();
      await seed.goto(`${base}/robots.txt`);
      await seed.evaluate(
        (t) =>
          new Promise((done, fail) => {
            const open = indexedDB.open("firebaseLocalStorageDb", 1);
            open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
            open.onerror = () => fail(open.error);
            open.onsuccess = () => {
              const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
              tx.objectStore("firebaseLocalStorage").put({
                fbase_key: `firebase:authUser:${t.apiKey}:[DEFAULT]`,
                value: {
                  uid: t.uid,
                  email: t.email,
                  emailVerified: true,
                  isAnonymous: false,
                  providerData: [],
                  stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: t.expiresAt },
                  createdAt: String(Date.now()),
                  lastLoginAt: String(Date.now()),
                  apiKey: t.apiKey,
                  appName: "[DEFAULT]",
                },
              });
              tx.oncomplete = () => done(true);
              tx.onerror = () => fail(tx.error);
            };
          }),
        tok,
      );
      await seed.close();
    }
  }

  // Read-only guard.
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (/google\.firestore\.v1\.Firestore\/Write\//.test(url)) {
      blocked.push(`${method} ${url.split("?")[0]}`);
      return route.abort();
    }
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return route.continue();
    if (/\/api\/login$/.test(url) || /google\.firestore\.v1\.Firestore\/Listen\//.test(url) || /identitytoolkit|securetoken/.test(url)) return route.continue();
    if (allowPost.some((re) => re.test(url))) return route.continue();
    blocked.push(`${method} ${url.split("?")[0]}`);
    return route.abort();
  });

  const results = [];
  const routes = cfg.routes.filter((r) => !only || only.has(r.key));
  const page = await ctx.newPage();
  for (const r of routes) {
    let url;
    try {
      url = base + fillVars(r.path, vars);
    } catch (e) {
      results.push({ key: r.key, skipped: String(e.message) });
      continue;
    }
    for (const w of widths) {
      const consoleErrors = [];
      const onConsole = (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300));
      const onPageError = (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`);
      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      const blockedBefore = blocked.length;
      await page.setViewportSize({ width: w, height: 900 });
      let status = 0;
      try {
        const resp = await page.goto(url, { waitUntil: "load", timeout: 180000 });
        status = resp?.status() ?? 0;
      } catch (e) {
        consoleErrors.push(`navigation: ${e.message}`);
      }
      await page.waitForTimeout(r.settleMs ?? settleMs);
      const m = await page.evaluate(
        ({ mode }) => {
          const se = document.scrollingElement;
          const main = document.querySelector("main");
          const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
          const tabBar = document.querySelector('nav[aria-label="Primary"]');
          const sidebar = document.querySelector("aside.app-sidebar");
          const out = {
            title: document.title,
            htmlClass: document.documentElement.className,
            docOverflowY: se.scrollHeight - innerHeight,
            docOverflowX: se.scrollWidth - innerWidth,
            mainOverflowX: main ? main.scrollWidth - main.clientWidth : null,
            sidebarVisible: vis(sidebar),
            tabBarVisible: vis(tabBar),
            errorOverlay: !!document.querySelector("nextjs-portal") && /Unhandled Runtime Error|Application error/i.test(document.body.innerText),
            // Includes Chrome's own error page (a 5xx after a redirect shows "This page isn't working / HTTP ERROR 500").
            appError: /Application error: a client-side exception|This page couldn.t load|This page isn.t working|HTTP ERROR \d{3}/i.test(document.body.innerText),
            themeToggleVisible: [...document.querySelectorAll("header button, [data-theme-toggle]")].some(
              (b) => vis(b) && /toggle theme|dark mode|light mode|appearance/i.test(`${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""} ${b.textContent ?? ""} ${b.getAttribute("data-theme-toggle") ?? ""}`),
            ),
            hiddenBehindTabBar: null,
          };
          if (mode === "shell" && main && vis(tabBar)) {
            main.scrollTop = main.scrollHeight;
            const barTop = tabBar.getBoundingClientRect().top;
            let maxBottom = 0;
            for (const el of main.querySelectorAll("*")) {
              if (!el.children.length && vis(el)) maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom);
            }
            out.hiddenBehindTabBar = Math.round(maxBottom - barTop);
            main.scrollTop = 0;
          }
          return out;
        },
        { mode: r.mode ?? "shell" },
      );
      let axe = null;
      if (args.axe) {
        try {
          const axePath = require.resolve("axe-core/axe.min.js", { paths: [process.cwd(), join(process.cwd(), "node_modules/.pnpm/node_modules")] });
          await page.addScriptTag({ path: axePath });
          axe = await page.evaluate(async () => {
            const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
            return res.violations.map((v) => `${v.id}(${v.nodes.length})`);
          });
        } catch (e) {
          axe = [`axe unavailable: ${e.message.split("\n")[0]}`];
        }
      }
      const shot = `${r.key}@${w}.png`;
      // The Next.js dev-mode indicator isn't part of the app — keep it out of diffs.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
      await page.screenshot({ path: join(outDir, shot) });
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      const failures = [];
      if (status >= 400) failures.push(`HTTP ${status}`);
      if (m.errorOverlay || m.appError) failures.push("error screen");
      if (m.docOverflowX > 1) failures.push(`horizontal overflow ${m.docOverflowX}px`);
      if ((r.mode ?? "shell") === "shell" && m.docOverflowY > 1) failures.push(`document scrolls ${m.docOverflowY}px past the shell`);
      if ((r.mode ?? "shell") === "shell" && w >= 768 && !r.noSidebar && !m.sidebarVisible) failures.push("sidebar missing");
      if (r.tabBar && w < 768 && !m.tabBarVisible) failures.push("bottom tab bar missing");
      if (m.hiddenBehindTabBar !== null && m.hiddenBehindTabBar > 2) failures.push(`content ${m.hiddenBehindTabBar}px behind tab bar`);
      if (cfg.expectHtmlClass && (r.mode ?? "shell") === "shell" && !m.htmlClass.split(/\s+/).includes(cfg.expectHtmlClass)) failures.push(`html class "${m.htmlClass}" lacks ${cfg.expectHtmlClass}`);
      if (cfg.forbidThemeToggle && m.themeToggleVisible) failures.push("dark-mode toggle visible");
      results.push({ key: r.key, url, width: w, status, ...m, consoleErrors, blockedWrites: blocked.slice(blockedBefore), axe, screenshot: shot, failures });
      process.stdout.write(`${failures.length ? "FAIL" : "ok  "} ${r.key}@${w}${failures.length ? " — " + failures.join("; ") : ""}${consoleErrors.length ? ` [${consoleErrors.length} console error(s)]` : ""}\n`);
    }
  }
  await browser.close();
  writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.failures?.length);
  const lines = [`# Visual pass — ${new Date().toISOString()}`, `base: ${base}`, `checks: ${results.length}, failed: ${failed.length}`, ""];
  for (const r of results) lines.push(`- ${r.failures?.length ? "FAIL" : r.skipped ? "SKIP" : "ok"} ${r.key}${r.width ? "@" + r.width : ""} ${r.skipped ?? r.failures?.join("; ") ?? ""}`);
  writeFileSync(join(outDir, "summary.md"), lines.join("\n") + "\n");
  console.log(`\n${results.length} checks, ${failed.length} failed → ${outDir}`);
  return failed.length ? 1 : 0;
}

async function compare(args) {
  // sharp ships with Next (no extra dependency); pnpm keeps it under .pnpm.
  const sharp = require(require.resolve("sharp", { paths: [process.cwd(), join(process.cwd(), "node_modules/.pnpm/node_modules")] }));
  const [a, b] = args._.slice(1).map((p) => resolve(p));
  const threshold = Number(args.threshold ?? 0.5); // % of pixels allowed to differ
  const files = readdirSync(a).filter((f) => f.endsWith(".png"));
  let worst = 0;
  const rows = [];
  for (const f of files) {
    if (!existsSync(join(b, f))) {
      rows.push({ f, pct: null, note: "missing in after" });
      continue;
    }
    const [ra, rb] = await Promise.all([join(a, f), join(b, f)].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) {
      rows.push({ f, pct: 100, note: "size changed" });
      worst = 100;
      continue;
    }
    let diff = 0;
    const px = ra.info.width * ra.info.height;
    for (let i = 0; i < ra.data.length; i += 4) {
      if (Math.abs(ra.data[i] - rb.data[i]) + Math.abs(ra.data[i + 1] - rb.data[i + 1]) + Math.abs(ra.data[i + 2] - rb.data[i + 2]) > 24) diff++;
    }
    const pct = (diff / px) * 100;
    worst = Math.max(worst, pct);
    rows.push({ f, pct });
  }
  rows.sort((x, y) => (y.pct ?? 101) - (x.pct ?? 101));
  for (const r of rows) console.log(`${r.pct === null || r.pct > threshold ? "DIFF" : "same"} ${r.f} ${r.pct === null ? r.note : r.pct.toFixed(2) + "%"}${r.note && r.pct !== null ? " " + r.note : ""}`);
  const over = rows.filter((r) => r.pct === null || r.pct > threshold).length;
  console.log(`\n${rows.length} screenshots, ${over} over ${threshold}% (worst ${worst.toFixed(2)}%)`);
  return over ? 1 : 0;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const fn = cmd === "compare" ? compare : cmd === "run" ? run : null;
if (!fn) {
  console.error("usage: visual-pass.mjs run|compare … (see header)");
  process.exit(2);
}
fn(args).then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(1);
});
