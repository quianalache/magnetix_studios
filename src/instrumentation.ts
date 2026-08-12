/**
 * Next.js instrumentation hook — runs once per server cold start. We use
 * it to fire a single liveness ping to gitpage so the upstream team knows
 * this deployment is alive, so the website-builder UI gets the
 * agency-subscription status cached for its first render, and to
 * auto-register the recurring QStash cron schedules.
 *
 * ROOT CAUSE FIX (2026-08-12): this file previously lived at the project
 * ROOT (`./instrumentation.ts`), but this is a `src/`-directory project
 * (middleware, app router, everything else lives under `src/`) — Next.js's
 * instrumentation-file convention only looks inside `src/` in that layout,
 * so this hook was silently never discovered/run, ever, since it was
 * first added. Confirmed live: the QStash schedule-registration marker
 * doc (`system/scheduleRegistration`) didn't exist at all, and QStash
 * itself had zero registered schedules — not "stale," never created.
 *
 * The actual Node-only work lives in `instrumentation-node.ts`, imported
 * dynamically ONLY on the Node.js runtime. Two things both mattered to
 * get a clean build once this file was actually discovered (it never
 * had been before, so this was never exercised): the runtime check has
 * to be the block-form `if (NEXT_RUNTIME === "nodejs") { await import(…) }`
 * — Next's dead-code elimination for the Edge bundle pattern-matches this
 * exact shape and prunes the import before webpack ever needs to resolve
 * it. A negated early-return (`if (NEXT_RUNTIME !== "nodejs") return;`)
 * looks equivalent but was NOT pruned, and webpack then tried to trace
 * firebase-admin's Node-only deps (`stream`, `crypto`) into the Edge
 * bundle and failed outright. Splitting the actual work into its own file
 * (rather than several separate dynamic imports inline here) also
 * mattered — inlining them here still failed even with the correct `if`
 * shape.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
