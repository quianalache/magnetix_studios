/**
 * Local-QA side-effect safety (2026-10-14). A local `next start` loads the real
 * .env.local credentials; without guards its startup hook registers PRODUCTION
 * QStash schedules, writes system/scheduleRegistration to production Firestore
 * and sends the heartbeat. This checks the guards that stop that.
 *
 * Network- and Firestore-safe: fetch is stubbed and Firebase Admin credentials
 * are blanked in this process, so even a regression can't reach production.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/check-local-qa-safety.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}

// Never let this process touch real services.
for (const k of ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]) process.env[k] = "";
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  throw new Error("network disabled in check-local-qa-safety");
}) as typeof fetch;

async function main() {
  // 1. Source order: the guard comes before both side-effect paths.
  const src = readFileSync("src/instrumentation-node.ts", "utf8");
  const guard = src.indexOf('process.env.MAGNETIX_LOCAL_QA === "1") return;');
  check("startup hook has the MAGNETIX_LOCAL_QA guard", guard > 0);
  check("guard runs before schedule registration", guard > 0 && guard < src.indexOf("ensureSchedulesRegistered"));
  check("guard runs before the heartbeat", guard > 0 && guard < src.indexOf("sendHeartbeat"));

  // 2. The launcher's overrides.
  const env = JSON.parse(execFileSync("node", ["scripts/qa/serve-local-qa.mjs", "start", "--port", "3400", "--print-env"], { encoding: "utf8" }));
  check("launcher sets MAGNETIX_LOCAL_QA=1", env.MAGNETIX_LOCAL_QA === "1");
  check("launcher blanks every QStash credential", ["QSTASH_TOKEN", "QSTASH_URL", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"].every((k) => env[k] === ""));
  check("launcher turns the heartbeat off", env.GITPAGE_TELEMETRY === "off");
  check("launcher points the app URL at localhost", /^http:\/\/localhost:\d+$/.test(env.NEXT_PUBLIC_APP_URL));

  // 3. Behaviour: with the guard on, a production-mode boot does nothing external.
  Object.assign(process.env, { NODE_ENV: "production", MAGNETIX_LOCAL_QA: "1", QSTASH_TOKEN: "would-be-real", NEXT_PUBLIC_APP_URL: "https://example.invalid", GITPAGE_TELEMETRY: "" });
  const { registerNode } = await import("../src/instrumentation-node");
  await registerNode();
  await new Promise((r) => setTimeout(r, 300));
  check("guarded production boot makes no network calls", fetchCalls === 0);

  // 4. Defense in depth: blank QStash credentials alone stop registration before Firestore.
  process.env.QSTASH_TOKEN = "";
  const { ensureSchedulesRegistered } = await import("../src/lib/qstash/register-schedules");
  let threw = false;
  try {
    await ensureSchedulesRegistered();
  } catch {
    threw = true;
  }
  check("blank QSTASH_TOKEN returns before any Firestore/QStash access", !threw && fetchCalls === 0);

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
