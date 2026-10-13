# Agent instructions (Codex and other agents)

The full project guide is [CLAUDE.md](CLAUDE.md). These deployment rules are repeated here because breaking them costs real money.

## Vercel — one canonical project

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
