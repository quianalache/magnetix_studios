#!/usr/bin/env node
/**
 * Start the app for LOCAL VISUAL QA with startup side effects disabled
 * (2026-10-14).
 *
 * Why: `.env.local` holds real QStash + Firebase credentials. A plain
 * `pnpm start` (NODE_ENV=production) runs src/instrumentation-node.ts, which
 * registers the QStash cron schedules against NEXT_PUBLIC_APP_URL and writes
 * the `system/scheduleRegistration` bookkeeping doc to PRODUCTION Firestore,
 * and sends the gitpage/mothership heartbeat. That happened once during
 * design-system Phase 1 QA (all registrations failed; only the bookkeeping
 * doc was written). Local QA must never do that.
 *
 * This launcher starts `next dev` or `next start` with the side-effect
 * switches off for THIS process only — it never edits `.env.local`, so normal
 * development is unchanged:
 *   MAGNETIX_LOCAL_QA=1      instrumentation-node.ts skips schedules + heartbeat
 *   QSTASH_* = ""            nothing can register or publish to QStash
 *   GITPAGE_TELEMETRY=off    heartbeat no-ops (belt and braces)
 *   NEXT_PUBLIC_APP_URL      localhost, so no URL points at a real host
 *
 * Next.js never overrides a variable already present in process.env with a
 * .env file value, so these win over `.env.local`.
 *
 * Usage:
 *   node scripts/qa/serve-local-qa.mjs dev   [--port 3300]
 *   node scripts/qa/serve-local-qa.mjs start [--port 3400]   (after `pnpm build`)
 *   node scripts/qa/serve-local-qa.mjs --print-env           (show the overrides; used by the check)
 *
 * Pair with scripts/qa/visual-pass.mjs (read-only browsing). Checked by
 * scripts/check-local-qa-safety.ts.
 */
import { spawn } from "node:child_process";

export const LOCAL_QA_ENV_OVERRIDES = (port) => ({
  MAGNETIX_LOCAL_QA: "1",
  GITPAGE_TELEMETRY: "off",
  QSTASH_TOKEN: "",
  QSTASH_URL: "",
  QSTASH_CURRENT_SIGNING_KEY: "",
  QSTASH_NEXT_SIGNING_KEY: "",
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
});

const args = process.argv.slice(2);
const mode = args[0];
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : mode === "start" ? 3400 : 3300;
const overrides = LOCAL_QA_ENV_OVERRIDES(port);

if (args.includes("--print-env")) {
  console.log(JSON.stringify(overrides));
  process.exit(0);
}
if (mode !== "dev" && mode !== "start") {
  console.error("usage: serve-local-qa.mjs dev|start [--port N]  (see header)");
  process.exit(2);
}

const nextArgs = mode === "dev" ? ["exec", "next", "dev", "--turbopack", "-p", String(port)] : ["exec", "next", "start", "-p", String(port)];
console.log(`[local-qa] ${mode} on :${port} — QStash, schedule registration and heartbeat disabled for this process.`);
const child = spawn("pnpm", nextArgs, { stdio: "inherit", env: { ...process.env, ...overrides } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
