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
 *   deploy [--prod]  check + sanity (+ clean tree and HEAD == origin/main for
 *                    --prod), then runs the pinned Vercel CLI with
 *                    VERCEL_ORG_ID / VERCEL_PROJECT_ID forced to the canonical
 *                    ids, so the CLI can only ever target that project.
 *
 * Env: VERCEL_TOKEN (optional; falls back to the Vercel CLI's stored login),
 *      VERCEL_GUARD_DRY_RUN=1 prints the deploy command instead of running it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CANONICAL = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.canonical.json"), "utf8"));

export class GuardError extends Error {}

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

/** For --prod: the worktree must be clean and exactly at origin/main (Git is the record of what's live). */
export function verifyProductionCheckout() {
  if (!git(["fetch", "--quiet", "origin", "main"]).ok) throw new GuardError("git fetch origin main failed — refusing a production deploy.");
  if (git(["status", "--porcelain", "--untracked-files=no"]).out) throw new GuardError("Uncommitted changes to tracked files — commit or stash before a production deploy.");
  const head = git(["rev-parse", "HEAD"]).out;
  const main = git(["rev-parse", "origin/main"]).out;
  if (!head || head !== main) throw new GuardError(`HEAD ${head.slice(0, 7)} is not origin/main ${main.slice(0, 7)}. Production ships from main: push to main (the canonical project's Git integration deploys it), or check out origin/main first.`);
  return head;
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
  const [command, ...args] = process.argv.slice(2);
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
      if (process.env.VERCEL_GUARD_DRY_RUN === "1") {
        console.log(`[dry run] ${line}`);
        return;
      }
      console.log(`→ ${line}`);
      const run = spawnSync(plan.cmd, plan.argv, { stdio: "inherit", env: { ...process.env, ...plan.env } });
      process.exitCode = run.status ?? 1;
      return;
    }
    default:
      throw new GuardError("Usage: vercel-guard.mjs <check|link|sanity|deploy [--prod]>");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof GuardError ? err.message : err?.stack || err}`);
    process.exit(1);
  });
}
