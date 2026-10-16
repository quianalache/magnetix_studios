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
import { CANONICAL, GuardError, buildDeployCommand, classifyProjects, sanity, storedLogin, vercelToken, verifyLink, writeLink } from "./vercel-guard.mjs";

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
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log(`\nvercel-guard: ${passed} checks passed`);
