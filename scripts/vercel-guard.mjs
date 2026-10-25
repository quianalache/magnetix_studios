#!/usr/bin/env node
/**
 * Magnetix Vercel deployment guard (2026-10-13).
 *
 * Why this exists: `.vercel/` is gitignored, so every new Git worktree starts
 * UNLINKED. Running the raw Vercel CLI there (`vercel --prod --yes`) silently
 * creates a brand-new Vercel project named after the worktree folder and
 * connects it to the GitHub repo — after which every push builds the whole app
 * once more. That happened five times (Sept–Oct 2026) and roughly doubled the
 * build bill. A worktree is NOT a Vercel project.
 *
 * Commands (all fail closed):
 *   check            .vercel/project.json must exist and name the canonical
 *                    project + team from vercel.canonical.json.
 *   link             Writes the canonical .vercel/project.json directly —
 *                    never calls `vercel link`, so it can't create a project.
 *   sanity           Read-only account check: exactly one Vercel project may
 *                    be Git-connected to the Magnetix repo (the canonical one).
 *   deploy [--prod]  check + sanity (+ for --prod: on branch main, clean,
 *                    HEAD == origin/main, local main not behind), then runs
 *                    the pinned Vercel CLI with VERCEL_ORG_ID /
 *                    VERCEL_PROJECT_ID forced to the canonical ids, so the CLI
 *                    can only ever target that project.
 *   promote <deployment>
 *                    The production release step while production domains are
 *                    assigned manually (2026-10-23 rule, owner-approved). Same
 *                    checkout checks as deploy --prod, plus: the deployment
 *                    belongs to the canonical project + team, is READY, is a
 *                    production build of ref `main` whose SHA equals
 *                    origin/main, and the project still has the production-ref
 *                    build check and manual domain assignment. Then promotes
 *                    and verifies production points at it.
 *   rollback <deployment>
 *                    Emergency switch to an earlier production deployment of
 *                    the canonical project. Shows its SHA/ref first and refuses
 *                    anything outside the canonical project/team, not READY or
 *                    not a production build.
 *
 * Why promote exists (2026-10-23): five production deployments were uploaded
 * straight from a stale branch with the raw CLI. Production now only changes
 * through `promote` (or `rollback`), and the project's build command refuses
 * any production build whose Git ref isn't main (PRODUCTION_REF_CHECK below).
 *
 * Env: VERCEL_TOKEN (optional; falls back to the Vercel CLI's stored login),
 *      VERCEL_GUARD_DRY_RUN=1 (or the `--dry-run` flag on deploy / promote /
 *      rollback) runs every check and prints the CLI command instead of
 *      running it. Any other dry-run-looking flag, and any unknown flag on
 *      promote / rollback, is refused before Vercel is touched.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export class GuardError extends Error {}

function loadCanonical() {
  const file = join(REPO_ROOT, "vercel.canonical.json");
  if (!existsSync(file)) throw new GuardError(`Missing ${file} — the guard's canonical project config. Refusing.`);
  const c = JSON.parse(readFileSync(file, "utf8"));
  for (const k of ["projectName", "projectId", "orgId", "githubRepo", "vercelCliVersion"]) {
    if (!c[k]) throw new GuardError(`vercel.canonical.json is missing "${k}". Refusing.`);
  }
  return c;
}
export const CANONICAL = loadCanonical();

/**
 * The canonical project's Build Command (Vercel → Settings → Build and
 * Deployment), set 2026-10-23 with owner approval. It runs before every build
 * on Vercel — whatever code was uploaded, since it lives in the PROJECT, not
 * the repo — and fails a production build unless its Git ref is main. Preview
 * builds are unaffected. `promote` refuses if the live setting drifts from it.
 */
export const PRODUCTION_REF_CHECK =
  '[ "$VERCEL_ENV" != production ] || [ "$VERCEL_GIT_COMMIT_REF" = main ] || { echo "Magnetix: no production build from ref ${VERCEL_GIT_COMMIT_REF:-none}" >&2; exit 1; }; echo "ref ok: ${VERCEL_ENV:-local} ${VERCEL_GIT_COMMIT_REF:-none}"';
/** Vercel rejects a Build Command longer than 256 characters. */
export const BUILD_COMMAND_MAX = 256;
export const PROJECT_BUILD_COMMAND = `${PRODUCTION_REF_CHECK} && pnpm run build`;

/** Throws GuardError unless `dir/.vercel/project.json` names the canonical project + team. */
export function verifyLink(dir, canonical = CANONICAL) {
  const file = join(dir, ".vercel", "project.json");
  if (!existsSync(file)) {
    throw new GuardError(`No Vercel link at ${file}. This worktree is unlinked — run \`pnpm vercel:link\` (writes the canonical link; never creates a project).`);
  }
  let link;
  try {
    link = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new GuardError(`${file} is not valid JSON. Run \`pnpm vercel:link\`.`);
  }
  if (link.projectId !== canonical.projectId) {
    throw new GuardError(`Wrong Vercel project: ${file} links ${link.projectId ?? "(none)"}${link.projectName ? ` (${link.projectName})` : ""}, expected ${canonical.projectId} (${canonical.projectName}). Run \`pnpm vercel:link\`.`);
  }
  if (link.orgId !== canonical.orgId) {
    throw new GuardError(`Wrong Vercel team: ${file} links org ${link.orgId ?? "(none)"}, expected ${canonical.orgId}. Run \`pnpm vercel:link\`.`);
  }
  if (link.projectName && link.projectName !== canonical.projectName) {
    throw new GuardError(`Wrong Vercel project name: ${link.projectName}, expected ${canonical.projectName}. Run \`pnpm vercel:link\`.`);
  }
  return link;
}

/** Writes the canonical link file. Replaces a wrong link; never talks to Vercel. */
export function writeLink(dir, canonical = CANONICAL) {
  mkdirSync(join(dir, ".vercel"), { recursive: true });
  const file = join(dir, ".vercel", "project.json");
  writeFileSync(file, JSON.stringify({ projectId: canonical.projectId, orgId: canonical.orgId, projectName: canonical.projectName }, null, 2) + "\n");
  return file;
}

const REFRESH_HINT =
  "Run `npx vercel@latest whoami` — the Vercel CLI renews its stored login from the saved refresh token (no browser sign-in needed) — then retry.";

/**
 * The Vercel CLI's stored login. Current CLIs (64.x) save a short-lived access
 * token (`expiresAt`, about 8 hours) plus a refresh token; the CLI renews it
 * automatically whenever it runs, but this guard only reads the file — so an
 * expired login must be renewed by running the CLI once, not by `vercel login`.
 */
export function storedLogin(candidates = [
  join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
  join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
  join(homedir(), ".config", "com.vercel.cli", "auth.json"),
]) {
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    try {
      const d = JSON.parse(readFileSync(f, "utf8"));
      if (d.token) {
        const raw = typeof d.expiresAt === "number" ? d.expiresAt : null;
        const expiresAt = raw == null ? null : raw < 1e12 ? raw * 1000 : raw;
        return { token: d.token, expiresAt, file: f };
      }
    } catch {
      /* try the next location */
    }
  }
  return null;
}

function vercelToken({ now = Date.now(), login = storedLogin() } = {}) {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (!login) return null;
  if (login.expiresAt != null && login.expiresAt <= now) {
    throw new GuardError(`The Vercel CLI's stored login expired at ${new Date(login.expiresAt).toLocaleString()}. ${REFRESH_HINT}`);
  }
  return login.token;
}
export { vercelToken };

/** Pure classification of a team's project list against the canonical repo. */
export function classifyProjects(projects, canonical = CANONICAL) {
  const linked = projects.filter((p) => p.link?.repoId === canonical.githubRepoId || (p.link?.org && `${p.link.org}/${p.link.repo}` === canonical.githubRepo));
  const extra = linked.filter((p) => p.id !== canonical.projectId);
  const canonicalLinked = linked.some((p) => p.id === canonical.projectId);
  return { linked: linked.map((p) => p.name), extra: extra.map((p) => `${p.name} (${p.id})`), canonicalLinked, ok: canonicalLinked && extra.length === 0 };
}

/** Read-only: lists the team's projects and checks only the canonical one is Git-connected to the repo. */
export async function sanity({ fetchImpl = fetch, token = vercelToken(), canonical = CANONICAL } = {}) {
  if (!token) throw new GuardError("No Vercel token (set VERCEL_TOKEN or sign in with the Vercel CLI) — can't verify the account, refusing.");
  const res = await fetchImpl(`https://api.vercel.com/v9/projects?limit=100&teamId=${canonical.orgId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const auth = res.status === 401 || res.status === 403;
    throw new GuardError(`Vercel API ${res.status} listing projects — refusing.${auth ? ` The token was rejected (usually an expired CLI login). ${REFRESH_HINT}` : ""}`);
  }
  const body = await res.json();
  const result = classifyProjects(body.projects ?? [], canonical);
  if (body.pagination?.next) result.truncated = true;
  return result;
}

function git(args) {
  const r = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim() };
}

/**
 * Pure: problems with a checkout as the source of a production release.
 * `localMain` is the local `main` ref (null when absent). Empty list = OK.
 */
export function assessCheckout({ branch, head, originMain, localMain, dirty }) {
  const problems = [];
  if (!originMain) problems.push("origin/main could not be resolved.");
  if (dirty) problems.push("Uncommitted changes to tracked files — commit or stash first.");
  if (branch !== "main") problems.push(`Current branch is ${branch || "(detached HEAD)"}, not main. Production releases only from main.`);
  if (!head || head !== originMain) problems.push(`HEAD ${(head || "").slice(0, 7)} is not origin/main ${(originMain || "").slice(0, 7)}.`);
  if (localMain && localMain !== originMain) problems.push(`Local main ${localMain.slice(0, 7)} is not origin/main ${(originMain || "").slice(0, 7)} — update it (git pull) first.`);
  return problems;
}

/** For --prod / promote: on main, clean, and exactly at origin/main (Git is the record of what's live). */
export function verifyProductionCheckout() {
  if (!git(["fetch", "--quiet", "origin", "main"]).ok) throw new GuardError("git fetch origin main failed — refusing a production release.");
  const state = {
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]).out,
    head: git(["rev-parse", "HEAD"]).out,
    originMain: git(["rev-parse", "origin/main"]).out,
    localMain: git(["rev-parse", "--verify", "--quiet", "refs/heads/main"]).out || null,
    dirty: !!git(["status", "--porcelain", "--untracked-files=no"]).out,
  };
  const problems = assessCheckout(state);
  if (problems.length) throw new GuardError(`Not a production release checkout:\n  - ${problems.join("\n  - ")}`);
  return state.head;
}

/**
 * Pure: problems with a Vercel deployment (v13 deployment JSON) as the
 * target of `promote`. Empty list = OK.
 */
export function assessPromotionTarget(d, { originMain, canonical = CANONICAL }) {
  const problems = [];
  const meta = d?.meta ?? {};
  if (!d?.id) return ["Deployment not found."];
  if (d.projectId !== canonical.projectId) problems.push(`Deployment belongs to project ${d.projectId ?? "(unknown)"}, not ${canonical.projectName} (${canonical.projectId}).`);
  const team = d.team?.id ?? d.ownerId;
  if (team !== canonical.orgId) problems.push(`Deployment belongs to team ${team ?? "(unknown)"}, not ${canonical.orgId}.`);
  if (d.readyState !== "READY") problems.push(`Deployment is ${d.readyState ?? "(unknown)"}, not READY.`);
  if (d.target !== "production") problems.push(`Deployment target is ${d.target ?? "preview"}, not production.`);
  if (meta.githubCommitRef !== "main") problems.push(`Deployment was built from ref ${meta.githubCommitRef ?? "(none)"}, not main.`);
  if (!meta.githubCommitSha || meta.githubCommitSha !== originMain) problems.push(`Deployment SHA ${(meta.githubCommitSha ?? "(none)").slice(0, 7)} is not origin/main ${(originMain ?? "").slice(0, 7)}.`);
  const repo = meta.githubCommitOrg && meta.githubCommitRepo ? `${meta.githubCommitOrg}/${meta.githubCommitRepo}` : null;
  if (repo && repo !== canonical.githubRepo) problems.push(`Deployment came from repo ${repo}, not ${canonical.githubRepo}.`);
  return problems;
}

/** Pure: problems with a deployment as a `rollback` target (any earlier SHA is allowed). */
export function assessRollbackTarget(d, { canonical = CANONICAL }) {
  if (!d?.id) return ["Deployment not found."];
  const problems = [];
  if (d.projectId !== canonical.projectId) problems.push(`Deployment belongs to project ${d.projectId ?? "(unknown)"}, not ${canonical.projectName}.`);
  const team = d.team?.id ?? d.ownerId;
  if (team !== canonical.orgId) problems.push(`Deployment belongs to team ${team ?? "(unknown)"}, not ${canonical.orgId}.`);
  if (d.readyState !== "READY") problems.push(`Deployment is ${d.readyState ?? "(unknown)"}, not READY.`);
  if (d.target !== "production") problems.push(`Deployment target is ${d.target ?? "preview"}, not production.`);
  return problems;
}

/** Pure: problems with the project's production safety settings. */
export function assessProjectSettings(project) {
  const problems = [];
  if (project?.buildCommand !== PROJECT_BUILD_COMMAND) problems.push("The project's Build Command is not the production-ref check (PROJECT_BUILD_COMMAND). Restore it before promoting.");
  if (project?.autoAssignCustomDomains !== false) problems.push("Production domains are set to auto-assign; the release rule is manual promotion (autoAssignCustomDomains: false).");
  return problems;
}

export function describeDeployment(d) {
  const meta = d?.meta ?? {};
  return `${d?.id} · ${d?.url ?? ""} · ${d?.target ?? "preview"} · ${d?.readyState} · ref ${meta.githubCommitRef ?? "(none)"} · SHA ${(meta.githubCommitSha ?? "(none)").slice(0, 12)} · source ${d?.source ?? "?"} · created ${d?.createdAt ? new Date(d.createdAt).toISOString() : "?"}`;
}

async function api(path, { method = "GET", body, token = vercelToken(), fetchImpl = fetch } = {}) {
  if (!token) throw new GuardError("No Vercel token (set VERCEL_TOKEN or sign in with the Vercel CLI) — refusing.");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetchImpl(`https://api.vercel.com${path}${sep}teamId=${CANONICAL.orgId}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new GuardError(`Vercel API ${res.status} on ${method} ${path} — refusing.${res.status === 401 || res.status === 403 ? ` ${REFRESH_HINT}` : ""}`);
  return res.json();
}

function deploymentRef(arg) {
  if (!arg) throw new GuardError("Name the deployment: its id (dpl_…) or URL.");
  return encodeURIComponent(arg.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
}

/**
 * Runs the pinned Vercel CLI — or, when `dryRun`, only prints it. `dryRun` is
 * required (never read from the environment here) so no caller can reach a
 * live production action without having decided dry-run vs live.
 */
export function runPinnedCli(argv, { dryRun, spawnImpl = spawnSync, log = console.log, canonical = CANONICAL }) {
  if (typeof dryRun !== "boolean") throw new GuardError("Internal: runPinnedCli needs an explicit dryRun decision.");
  const line = `VERCEL_ORG_ID=${canonical.orgId} VERCEL_PROJECT_ID=${canonical.projectId} npx --yes vercel@${canonical.vercelCliVersion} ${argv.join(" ")}`;
  if (dryRun) {
    log(`[dry run] ${line}`);
    return 0;
  }
  log(`→ ${line}`);
  const run = spawnImpl("npx", ["--yes", `vercel@${canonical.vercelCliVersion}`, ...argv], { stdio: "inherit", env: { ...process.env, VERCEL_ORG_ID: canonical.orgId, VERCEL_PROJECT_ID: canonical.projectId } });
  return run.status ?? 1;
}

const DRY_RUN_USAGE = "For a dry run use `--dry-run` (e.g. `pnpm deploy:promote <deployment> --dry-run`) or `VERCEL_GUARD_DRY_RUN=1`.";
/** Anything that LOOKS like a dry-run request: --dryrun, --dry_run, -dry-run, --dry-run=…, -n, --simulate, --noop, --plan… */
const DRY_RUN_LOOKALIKE = /^-{1,2}(?:dry|simulate|noop|no-?op|plan|whatif|what-if|n$)/i;
const COMMAND_FLAGS = { promote: ["--dry-run"], rollback: ["--dry-run", "--confirm"] };

/**
 * Parses guard arguments BEFORE anything touches Vercel. `--dry-run` is an
 * alias for VERCEL_GUARD_DRY_RUN=1. Any other dry-run-looking flag fails
 * closed (it must never be silently ignored and followed by a live action),
 * and promote/rollback refuse every flag they don't know.
 */
export function parseGuardArgs(command, args, env = process.env) {
  const flagDryRun = args.includes("--dry-run");
  for (const a of args) {
    if (a !== "--dry-run" && DRY_RUN_LOOKALIKE.test(a)) throw new GuardError(`Unsupported flag "${a}" — refusing rather than risk a live action. ${DRY_RUN_USAGE}`);
  }
  if (env.VERCEL_GUARD_DRY_RUN !== undefined && env.VERCEL_GUARD_DRY_RUN !== "" && env.VERCEL_GUARD_DRY_RUN !== "1" && env.VERCEL_GUARD_DRY_RUN !== "0") {
    throw new GuardError(`VERCEL_GUARD_DRY_RUN="${env.VERCEL_GUARD_DRY_RUN}" is ambiguous — use 1 for a dry run. ${DRY_RUN_USAGE}`);
  }
  const dryRun = flagDryRun || env.VERCEL_GUARD_DRY_RUN === "1";
  const rest = args.filter((a) => a !== "--dry-run");
  const allowed = COMMAND_FLAGS[command];
  if (allowed) {
    const unknown = rest.filter((a) => a.startsWith("-") && !allowed.includes(a));
    if (unknown.length) throw new GuardError(`Unknown flag(s) for ${command}: ${unknown.join(", ")} — refusing. Allowed: ${allowed.join(", ")}. ${DRY_RUN_USAGE}`);
    const positionals = rest.filter((a) => !a.startsWith("-"));
    if (positionals.length > 1) throw new GuardError(`${command} takes one deployment; got ${positionals.join(", ")}.`);
  }
  return { dryRun, args: rest };
}

const FORBIDDEN_ARGS = ["--project", "--name", "--scope", "--team", "-S", "-T", "--cwd", "link"];

/** Builds the CLI invocation; pins the canonical ids in the env so the CLI cannot pick or create another project. */
export function buildDeployCommand(args, canonical = CANONICAL) {
  const bad = args.find((a) => FORBIDDEN_ARGS.includes(a.split("=")[0]));
  if (bad) throw new GuardError(`"${bad}" is not allowed — the guard always deploys to ${canonical.projectName}.`);
  const prod = args.includes("--prod");
  const extra = args.filter((a) => a !== "--prod" && a !== "--yes");
  return {
    cmd: "npx",
    argv: ["--yes", `vercel@${canonical.vercelCliVersion}`, "deploy", ...(prod ? ["--prod"] : []), ...extra],
    env: { VERCEL_ORG_ID: canonical.orgId, VERCEL_PROJECT_ID: canonical.projectId },
    prod,
  };
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { dryRun, args } = parseGuardArgs(command, rawArgs);
  if (dryRun) console.log("DRY RUN — no deployment, promotion or rollback will be performed.");
  const cwd = process.cwd();
  switch (command) {
    case "check": {
      const link = verifyLink(cwd);
      console.log(`✓ Linked to canonical Vercel project ${CANONICAL.projectName} (${link.projectId}) in team ${link.orgId}.`);
      return;
    }
    case "link": {
      const file = writeLink(cwd);
      verifyLink(cwd);
      console.log(`✓ Wrote ${file} → ${CANONICAL.projectName} (${CANONICAL.projectId}). No Vercel project was created or changed.`);
      return;
    }
    case "sanity": {
      const r = await sanity();
      console.log(`Vercel projects Git-connected to ${CANONICAL.githubRepo}: ${r.linked.join(", ") || "(none)"}`);
      if (r.truncated) console.log("(project list truncated at 100 — check the dashboard too)");
      if (!r.canonicalLinked) throw new GuardError(`Canonical project ${CANONICAL.projectName} is NOT Git-connected — production pushes won't deploy. Investigate before deploying.`);
      if (r.extra.length) throw new GuardError(`Extra Vercel projects are building this repo (each push rebuilds the app once per project): ${r.extra.join(", ")}. Disconnect their Git integration (owner approval) before deploying.`);
      console.log("✓ Exactly one project (the canonical one) builds this repo.");
      return;
    }
    case "deploy": {
      const plan = buildDeployCommand(args);
      verifyLink(cwd);
      const r = await sanity();
      if (!r.ok) throw new GuardError(`Account sanity check failed (canonical linked: ${r.canonicalLinked}; extra: ${r.extra.join(", ") || "none"}). Run \`pnpm vercel:sanity\`.`);
      if (plan.prod) verifyProductionCheckout();
      const line = `VERCEL_ORG_ID=${plan.env.VERCEL_ORG_ID} VERCEL_PROJECT_ID=${plan.env.VERCEL_PROJECT_ID} ${plan.cmd} ${plan.argv.join(" ")}`;
      if (dryRun) {
        console.log(`[dry run] ${line}`);
        return;
      }
      console.log(`→ ${line}`);
      const run = spawnSync(plan.cmd, plan.argv, { stdio: "inherit", env: { ...process.env, ...plan.env } });
      process.exitCode = run.status ?? 1;
      return;
    }
    case "promote": {
      verifyLink(cwd);
      const r = await sanity();
      if (!r.ok) throw new GuardError(`Account sanity check failed (canonical linked: ${r.canonicalLinked}; extra: ${r.extra.join(", ") || "none"}). Run \`pnpm vercel:sanity\`.`);
      const originMain = verifyProductionCheckout();
      const project = await api(`/v9/projects/${CANONICAL.projectId}`);
      const settings = assessProjectSettings(project);
      if (settings.length) throw new GuardError(`Project safety settings:\n  - ${settings.join("\n  - ")}`);
      const d = await api(`/v13/deployments/${deploymentRef(args[0])}`);
      console.log(`Target: ${describeDeployment(d)}`);
      console.log(`origin/main: ${originMain}`);
      const problems = assessPromotionTarget(d, { originMain });
      if (problems.length) throw new GuardError(`Refusing to promote:\n  - ${problems.join("\n  - ")}`);
      const status = runPinnedCli(["promote", d.id, "--yes"], { dryRun });
      if (status !== 0) throw new GuardError(`vercel promote exited ${status}.`);
      if (dryRun) {
        console.log("✓ Dry run passed every promotion check. Re-run without --dry-run to promote.");
        return;
      }
      const after = await api(`/v9/projects/${CANONICAL.projectId}`);
      if (after.targets?.production?.id !== d.id) throw new GuardError(`Promote finished but production points at ${after.targets?.production?.id ?? "(unknown)"}, not ${d.id}. Investigate.`);
      if (after.autoAssignCustomDomains !== false) {
        await api(`/v9/projects/${CANONICAL.projectId}`, { method: "PATCH", body: { autoAssignCustomDomains: false } });
        console.log("Re-set production domains to manual assignment (autoAssignCustomDomains: false).");
      }
      console.log(`✓ Production now serves ${d.id} (SHA ${d.meta.githubCommitSha.slice(0, 12)}, main). Domains stay on manual assignment.`);
      return;
    }
    case "rollback": {
      verifyLink(cwd);
      const d = await api(`/v13/deployments/${deploymentRef(args[0])}`);
      console.log(`Target: ${describeDeployment(d)}`);
      const problems = assessRollbackTarget(d, {});
      if (problems.length) throw new GuardError(`Refusing to roll back:\n  - ${problems.join("\n  - ")}`);
      git(["fetch", "--quiet", "origin", "main"]);
      const originMain = git(["rev-parse", "origin/main"]).out;
      if (d.meta?.githubCommitSha !== originMain) console.log(`⚠ This deployment is SHA ${(d.meta?.githubCommitSha ?? "(none)").slice(0, 12)} (ref ${d.meta?.githubCommitRef ?? "(none)"}), not origin/main ${originMain.slice(0, 12)} — production will run older code until the next promote.`);
      if (!args.includes("--confirm")) throw new GuardError("Check the target above, then re-run with --confirm.");
      const status = runPinnedCli(["rollback", d.id, "--yes"], { dryRun });
      if (status !== 0) throw new GuardError(`vercel rollback exited ${status}.`);
      if (dryRun) {
        console.log("✓ Dry run passed every rollback check. Re-run without --dry-run to roll back.");
        return;
      }
      const after = await api(`/v9/projects/${CANONICAL.projectId}`);
      if (after.targets?.production?.id !== d.id) throw new GuardError(`Rollback finished but production points at ${after.targets?.production?.id ?? "(unknown)"}. Investigate.`);
      console.log(`✓ Production rolled back to ${d.id}. Production domains are now assigned manually; release forward with \`pnpm deploy:promote\`.`);
      return;
    }
    default:
      throw new GuardError("Usage: vercel-guard.mjs <check|link|sanity|deploy [--prod] [--dry-run]|promote <deployment> [--dry-run]|rollback <deployment> [--confirm] [--dry-run]>");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof GuardError ? err.message : err?.stack || err}`);
    process.exit(1);
  });
}
