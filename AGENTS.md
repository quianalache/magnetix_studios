# Agent instructions (Codex and other agents)

The full project guide is [CLAUDE.md](CLAUDE.md). These deployment rules are repeated here because breaking them costs real money.

## Vercel — one canonical project

**NO NEW VERCEL PROJECT MAY BE CREATED FOR MAGNETIX STUDIOS WITHOUT EXPLICIT PRIOR OWNER APPROVAL.** This applies to worktrees, branches, CLI deployments, previews, feature/module work, testing environments, temporary QA environments and any other workflow. The canonical default is always `magnetix-studios`; a feature inside the CRM does NOT get its own Vercel project. If a worktree is not linked to the canonical project, deployment MUST FAIL CLOSED — it must never fall back to project creation. (The four strays created this way were deleted 2026-10-13.)

- Magnetix Studios deploys to ONE Vercel project: `magnetix-studios` (ids in [vercel.canonical.json](vercel.canonical.json)). Creating another Magnetix Vercel project requires owner approval. A CRM module (Pipelines, Report Builder, Community, …) never gets its own project.
- A Git worktree is NOT a Vercel project. `.vercel/` is gitignored, so every worktree starts unlinked — never assume it is linked.
- NEVER run the raw Vercel CLI to deploy or link (`vercel`, `vercel deploy`, `vercel --prod`, `vercel link`, `npx vercel …`, `pnpm dlx vercel …`, especially with `--yes`). In an unlinked folder it silently creates a new project named after the folder and connects it to the repo; every later push then builds the whole app again. This happened five times in Sept–Oct 2026.
- Production = merge to `main` and push (the canonical project's Git integration deploys it).
- Guarded commands only:
  - `pnpm vercel:link` — writes the canonical `.vercel/project.json` (offline; cannot create a project)
  - `pnpm vercel:check` — verifies the link
  - `pnpm vercel:sanity` — read-only: exactly one project may be Git-connected to the repo; run it at the start of any deploy/release task and report any extra project to the owner
  - `pnpm deploy:preview` / `pnpm deploy:production` — guarded CLI deploys (production requires a clean tree at `origin/main`)
- Local QA first, batch related corrections, one intentional preview for remote authenticated QA, production only when materially ready, one production deployment at a time.

## Design system — Magnetix Visual Direction 2

Full rules: CLAUDE.md → "Magnetix design system". In short: one fixed Magnetix visual system for the internal CRM (agency + sub-account; no app-theme picker); tokens in `src/styles/magnetix/` (no new inline hex); white-first surfaces, deep plum primary, color in chips/tags/statuses, no lavender-on-lavender blocks; system sans for operational UI, DM Serif Display only on approved moment pages; shared components before new ones; never add `.momentum-scope` to new pages; tenant branding only inside `.tenant-surface`; specialized surfaces need a justified drift-script exception; light mode only for now; mobile bottom nav = Home / Inbox / Calendar / Projects / More. `pnpm lint` enforces the design-drift ratchet; run `scripts/qa/visual-pass.mjs` before design-touching releases.
