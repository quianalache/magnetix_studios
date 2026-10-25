#!/usr/bin/env node
/**
 * Local, offline checks for scripts/vercel-guard.mjs — no Vercel API calls,
 * no deployments. Run: `node scripts/check-vercel-guard.mjs`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_COMMAND_MAX, CANONICAL, GuardError, PRODUCTION_REF_CHECK, PROJECT_BUILD_COMMAND, assessCheckout, assessProjectSettings, assessPromotionTarget, assessRollbackTarget, buildDeployCommand, classifyProjects, parseGuardArgs, runPinnedCli, sanity, storedLogin, vercelToken, verifyLink, writeLink } from "./vercel-guard.mjs";

const GUARD = resolve(dirname(fileURLToPath(import.meta.url)), "vercel-guard.mjs");
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const tmp = () => mkdtempSync(join(tmpdir(), "vercel-guard-"));
const link = (dir, body) => {
  mkdirSync(join(dir, ".vercel"), { recursive: true });
  writeFileSync(join(dir, ".vercel", "project.json"), typeof body === "string" ? body : JSON.stringify(body));
};
const runGuard = (cwd, args, env = {}) => spawnSync(process.execPath, [GUARD, ...args], { cwd, encoding: "utf8", env: { ...process.env, VERCEL_TOKEN: "", ...env } });

const dirs = [];
try {
  await test("canonical link passes", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: CANONICAL.projectId, orgId: CANONICAL.orgId, projectName: CANONICAL.projectName });
    assert.equal(verifyLink(d).projectId, CANONICAL.projectId);
  });
  await test("CLI-written canonical link (settings, no projectName) passes", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: CANONICAL.projectId, orgId: CANONICAL.orgId, settings: { framework: "nextjs" } });
    verifyLink(d);
  });
  await test("missing .vercel fails", () => {
    const d = tmp();
    dirs.push(d);
    assert.throws(() => verifyLink(d), (e) => e instanceof GuardError && /unlinked/.test(e.message));
  });
  await test("malformed project.json fails", () => {
    const d = tmp();
    dirs.push(d);
    link(d, "{not json");
    assert.throws(() => verifyLink(d), GuardError);
  });
  await test("wrong project id fails (the stray-project case)", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: "prj_o9Sj80xUA4zqSb17p3kvcyuDwtBV", orgId: CANONICAL.orgId, projectName: "magnetix-report-builder-parity" });
    assert.throws(() => verifyLink(d), (e) => e instanceof GuardError && /Wrong Vercel project/.test(e.message));
  });
  await test("wrong org id fails", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: CANONICAL.projectId, orgId: "team_someoneElse" });
    assert.throws(() => verifyLink(d), (e) => e instanceof GuardError && /Wrong Vercel team/.test(e.message));
  });
  await test("canonical id under a different name fails", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: CANONICAL.projectId, orgId: CANONICAL.orgId, projectName: "magnetix-pipelines" });
    assert.throws(() => verifyLink(d), GuardError);
  });
  await test("link writes the canonical file and replaces a wrong link", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: "prj_wrong", orgId: "team_wrong" });
    writeLink(d);
    const written = JSON.parse(readFileSync(join(d, ".vercel", "project.json"), "utf8"));
    assert.deepEqual(written, { projectId: CANONICAL.projectId, orgId: CANONICAL.orgId, projectName: CANONICAL.projectName });
  });
  await test("deploy command pins canonical ids, drops --yes, uses the pinned CLI", () => {
    const p = buildDeployCommand(["--prod", "--yes"]);
    assert.equal(p.env.VERCEL_PROJECT_ID, CANONICAL.projectId);
    assert.equal(p.env.VERCEL_ORG_ID, CANONICAL.orgId);
    assert.ok(!p.argv.includes("--yes") || p.argv.indexOf("--yes") === 0, "only npx's own --yes may remain");
    assert.deepEqual(p.argv.slice(1), [`vercel@${CANONICAL.vercelCliVersion}`, "deploy", "--prod"]);
    assert.ok(!buildDeployCommand([]).prod);
  });
  await test("deploy refuses arguments that could target or create another project", () => {
    for (const a of ["--project", "--project=magnetix-x", "--name", "--scope", "--team", "link"]) {
      assert.throws(() => buildDeployCommand([a, "x"]), GuardError, a);
    }
  });
  await test("classifier: only canonical linked → ok", () => {
    const r = classifyProjects([
      { id: CANONICAL.projectId, name: CANONICAL.projectName, link: { repoId: CANONICAL.githubRepoId } },
      { id: "prj_other", name: "ross-family-app", link: { repoId: 1 } },
      { id: "prj_unlinked", name: "magnetix_studios-pipelines", link: null },
    ]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.linked, [CANONICAL.projectName]);
  });
  await test("classifier: a second project on the repo is flagged", () => {
    const r = classifyProjects([
      { id: CANONICAL.projectId, name: CANONICAL.projectName, link: { repoId: CANONICAL.githubRepoId } },
      { id: "prj_dup", name: "magnetix-report-builder", link: { org: "quianalache", repo: "magnetix_studios" } },
    ]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.extra, ["magnetix-report-builder (prj_dup)"]);
  });
  await test("classifier: canonical disconnected is flagged", () => {
    assert.equal(classifyProjects([{ id: CANONICAL.projectId, name: CANONICAL.projectName, link: null }]).ok, false);
  });
  await test("expired CLI login: refuses with the refresh instruction (no re-login); valid login returns its token", async () => {
    const saved = process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_TOKEN;
    try {
      assert.throws(() => vercelToken({ now: 2_000, login: { token: "t", expiresAt: 1_000 } }), (e) => e instanceof GuardError && /expired/.test(e.message) && /vercel@latest whoami/.test(e.message));
      assert.equal(vercelToken({ now: 1_000, login: { token: "t", expiresAt: 2_000 } }), "t");
      assert.equal(vercelToken({ now: 1_000, login: { token: "t", expiresAt: null } }), "t");
      assert.equal(storedLogin([]), null);
    } finally {
      if (saved !== undefined) process.env.VERCEL_TOKEN = saved;
    }
  });
  await test("sanity refuses without a token and on API errors (fail closed)", async () => {
    await assert.rejects(sanity({ token: null }), GuardError);
    await assert.rejects(sanity({ token: "t", fetchImpl: async () => ({ ok: false, status: 403 }) }), GuardError);
  });
  await test("CLI: deploy from an unlinked worktree exits 1 and never runs the Vercel CLI", () => {
    const d = tmp();
    dirs.push(d);
    const r = runGuard(d, ["deploy", "--prod"], { VERCEL_GUARD_DRY_RUN: "1" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unlinked/);
    assert.doesNotMatch(r.stdout, /dry run|vercel@/);
  });
  await test("CLI: deploy from a stray-linked worktree exits 1", () => {
    const d = tmp();
    dirs.push(d);
    link(d, { projectId: "prj_pbJUAvAiHw7X9H81tKiEOJc7D4Ke", orgId: CANONICAL.orgId, projectName: "magnetix_studios-pipelines" });
    const r = runGuard(d, ["deploy"], { VERCEL_GUARD_DRY_RUN: "1" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Wrong Vercel project/);
  });
  await test("CLI: canonical link but no token → deploy still refuses (sanity is fail-closed)", () => {
    const d = tmp();
    dirs.push(d);
    writeLink(d);
    const r = runGuard(d, ["deploy"], { VERCEL_GUARD_DRY_RUN: "1", HOME: d });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No Vercel token/);
  });
  await test("CLI: check passes on canonical link, link command is offline", () => {
    const d = tmp();
    dirs.push(d);
    assert.equal(runGuard(d, ["link"]).status, 0);
    const r = runGuard(d, ["check"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /canonical Vercel project magnetix-studios/);
  });

  // ── Production release rule (2026-10-23) ────────────────────────────────
  const MAIN = "c72ba883a9244f5aa46a550600dc08c6fefb198e";
  const okCheckout = { branch: "main", head: MAIN, originMain: MAIN, localMain: MAIN, dirty: false };
  await test("checkout: on main at origin/main, clean → OK", () => {
    assert.deepEqual(assessCheckout(okCheckout), []);
  });
  await test("checkout: a stale branch is refused even at the same commit (branch is not main)", () => {
    assert.match(assessCheckout({ ...okCheckout, branch: "codex/production-content-sets-reading-integration" }).join(" "), /not main/);
  });
  await test("checkout: HEAD behind origin/main, local main behind, dirty, detached → each refused", () => {
    assert.match(assessCheckout({ ...okCheckout, head: "f8534f93df7e" }).join(" "), /is not origin\/main/);
    assert.match(assessCheckout({ ...okCheckout, localMain: "245e0df1234" }).join(" "), /Local main/);
    assert.match(assessCheckout({ ...okCheckout, dirty: true }).join(" "), /Uncommitted/);
    assert.match(assessCheckout({ ...okCheckout, branch: "HEAD" }).join(" "), /not main/);
  });
  const goodDeployment = { id: "dpl_good", projectId: CANONICAL.projectId, ownerId: CANONICAL.orgId, readyState: "READY", target: "production", source: "git",
    meta: { githubCommitRef: "main", githubCommitSha: MAIN, githubCommitOrg: "quianalache", githubCommitRepo: "magnetix_studios" } };
  await test("promote target: READY production build of main at origin/main → OK", () => {
    assert.deepEqual(assessPromotionTarget(goodDeployment, { originMain: MAIN }), []);
  });
  await test("promote target: the stale-branch CLI upload (dpl_9eaF6…, f8534f9) is refused", () => {
    const codex = { ...goodDeployment, id: "dpl_9eaF6Wtd5udZ1VCQwRXrYa3KKHEQ", source: "cli", meta: { githubCommitRef: "codex/production-content-sets-reading-integration", githubCommitSha: "f8534f93df7e6cd7bf3cb68e2662b52accd006ef" } };
    const p = assessPromotionTarget(codex, { originMain: MAIN }).join(" ");
    assert.match(p, /not main/);
    assert.match(p, /is not origin\/main/);
  });
  await test("promote target: other project / other team / not READY / preview / other repo → each refused", () => {
    assert.match(assessPromotionTarget({ ...goodDeployment, projectId: "prj_other" }, { originMain: MAIN }).join(" "), /belongs to project/);
    assert.match(assessPromotionTarget({ ...goodDeployment, ownerId: "team_other" }, { originMain: MAIN }).join(" "), /belongs to team/);
    assert.match(assessPromotionTarget({ ...goodDeployment, readyState: "ERROR" }, { originMain: MAIN }).join(" "), /not READY/);
    assert.match(assessPromotionTarget({ ...goodDeployment, target: null }, { originMain: MAIN }).join(" "), /not production/);
    assert.match(assessPromotionTarget({ ...goodDeployment, meta: { ...goodDeployment.meta, githubCommitOrg: "someone", githubCommitRepo: "fork" } }, { originMain: MAIN }).join(" "), /came from repo/);
  });
  await test("rollback target: an older canonical production deployment is allowed; other projects / previews are not", () => {
    assert.deepEqual(assessRollbackTarget({ ...goodDeployment, meta: { githubCommitRef: "main", githubCommitSha: "65611f0" } }, {}), []);
    assert.match(assessRollbackTarget({ ...goodDeployment, projectId: "prj_other" }, {}).join(" "), /belongs to project/);
    assert.match(assessRollbackTarget({ ...goodDeployment, target: null }, {}).join(" "), /not production/);
  });
  await test("project settings: promote refuses without the build check or with auto-assigned domains", () => {
    assert.deepEqual(assessProjectSettings({ buildCommand: PROJECT_BUILD_COMMAND, autoAssignCustomDomains: false }), []);
    assert.match(assessProjectSettings({ buildCommand: null, autoAssignCustomDomains: false }).join(" "), /Build Command/);
    assert.match(assessProjectSettings({ buildCommand: PROJECT_BUILD_COMMAND, autoAssignCustomDomains: true }).join(" "), /auto-assign/);
  });
  const runCheck = (env) => spawnSync("sh", ["-c", PRODUCTION_REF_CHECK], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  await test("build check: production from a non-main ref FAILS the build", () => {
    const r = runCheck({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "codex/production-content-sets-reading-integration" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no production build from ref codex\/production-content-sets-reading-integration/);
  });
  await test("build check: production with no Git ref (e.g. a non-Git upload) FAILS the build", () => {
    const r = runCheck({ VERCEL_ENV: "production" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /from ref none/);
  });
  await test("build check: production from main, previews from any branch, and local builds pass", () => {
    assert.equal(runCheck({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }).status, 0);
    assert.equal(runCheck({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/reconcile-codex-consolidation" }).status, 0);
    assert.equal(runCheck({}).status, 0);
  });
  await test("build check: the project command runs the check BEFORE the real build", () => {
    assert.ok(PROJECT_BUILD_COMMAND.startsWith(PRODUCTION_REF_CHECK + " && "));
    assert.ok(PROJECT_BUILD_COMMAND.endsWith("pnpm run build"));
    assert.ok(PROJECT_BUILD_COMMAND.length <= BUILD_COMMAND_MAX, `Build Command is ${PROJECT_BUILD_COMMAND.length} chars; Vercel allows ${BUILD_COMMAND_MAX}`);
  });
  await test("dry run: --dry-run is an alias for VERCEL_GUARD_DRY_RUN=1 on deploy / promote / rollback", () => {
    for (const [cmd, args] of [["promote", ["dpl_x", "--dry-run"]], ["rollback", ["dpl_x", "--confirm", "--dry-run"]], ["deploy", ["--prod", "--dry-run"]]]) {
      const r = parseGuardArgs(cmd, args, {});
      assert.equal(r.dryRun, true, cmd);
      assert.ok(!r.args.includes("--dry-run"), `${cmd}: --dry-run is consumed, never forwarded to the Vercel CLI`);
    }
    assert.ok(!buildDeployCommand(parseGuardArgs("deploy", ["--prod", "--dry-run"], {}).args).argv.includes("--dry-run"));
  });
  await test("dry run: the existing VERCEL_GUARD_DRY_RUN=1 still works; unset/0 means live", () => {
    assert.equal(parseGuardArgs("promote", ["dpl_x"], { VERCEL_GUARD_DRY_RUN: "1" }).dryRun, true);
    assert.equal(parseGuardArgs("promote", ["dpl_x"], {}).dryRun, false);
    assert.equal(parseGuardArgs("promote", ["dpl_x"], { VERCEL_GUARD_DRY_RUN: "0" }).dryRun, false);
    assert.throws(() => parseGuardArgs("promote", ["dpl_x"], { VERCEL_GUARD_DRY_RUN: "true" }), /ambiguous/);
  });
  await test("dry run: a dry run never spawns the Vercel CLI; a live run does", () => {
    let spawned = 0;
    const spawnImpl = () => { spawned++; return { status: 0 }; };
    const lines = [];
    assert.equal(runPinnedCli(["promote", "dpl_x", "--yes"], { dryRun: true, spawnImpl, log: (l) => lines.push(l) }), 0);
    assert.equal(spawned, 0);
    assert.match(lines[0], /^\[dry run\] .*vercel@.* promote dpl_x --yes$/);
    assert.equal(runPinnedCli(["promote", "dpl_x", "--yes"], { dryRun: false, spawnImpl, log: () => {} }), 0);
    assert.equal(spawned, 1);
    assert.throws(() => runPinnedCli(["promote", "dpl_x", "--yes"], { spawnImpl }), /explicit dryRun/);
  });
  await test("live: a normal explicit invocation parses as live with its arguments intact", () => {
    assert.deepEqual(parseGuardArgs("promote", ["dpl_abc"], {}), { dryRun: false, args: ["dpl_abc"] });
    assert.deepEqual(parseGuardArgs("rollback", ["dpl_abc", "--confirm"], {}), { dryRun: false, args: ["dpl_abc", "--confirm"] });
    assert.deepEqual(parseGuardArgs("deploy", ["--prod"], {}), { dryRun: false, args: ["--prod"] });
  });
  await test("fail closed: dry-run look-alikes and unknown promote/rollback flags are refused", () => {
    for (const flag of ["--dryrun", "--dry_run", "-dry-run", "--dry-run=true", "--DRY-RUN", "-n", "--simulate", "--noop", "--plan", "--what-if"]) {
      for (const cmd of ["promote", "rollback", "deploy"]) {
        assert.throws(() => parseGuardArgs(cmd, ["dpl_x", flag], {}), /Unsupported flag.*--dry-run/, `${cmd} ${flag}`);
      }
    }
    assert.throws(() => parseGuardArgs("promote", ["dpl_x", "--force"], {}), /Unknown flag/);
    assert.throws(() => parseGuardArgs("promote", ["dpl_x", "--confirm"], {}), /Unknown flag/);
    assert.throws(() => parseGuardArgs("rollback", ["dpl_x", "--yes"], {}), /Unknown flag/);
    assert.throws(() => parseGuardArgs("promote", ["dpl_x", "dpl_y"], {}), /one deployment/);
  });
  await test("CLI: a look-alike flag is refused before any Vercel call, with the correct invocation", () => {
    const d = tmp();
    dirs.push(d);
    writeLink(d);
    const r = runGuard(d, ["promote", "dpl_x", "--dryrun"], { HOME: d });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unsupported flag "--dryrun".*--dry-run/);
    assert.doesNotMatch(r.stderr, /No Vercel token/);
  });
  await test("CLI: promote --dry-run announces a dry run, then still runs the safety checks", () => {
    const d = tmp();
    dirs.push(d);
    writeLink(d);
    const r = runGuard(d, ["promote", "dpl_x", "--dry-run"], { HOME: d });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /DRY RUN/);
    assert.match(r.stderr, /No Vercel token/);
  });
  await test("CLI: promote / rollback with no token refuse before touching Vercel", () => {
    const d = tmp();
    dirs.push(d);
    writeLink(d);
    for (const args of [["promote", "dpl_x"], ["rollback", "dpl_x", "--confirm"]]) {
      const r = runGuard(d, args, { VERCEL_GUARD_DRY_RUN: "1", HOME: d });
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.stderr, /No Vercel token/);
    }
  });
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log(`\nvercel-guard: ${passed} checks passed`);
