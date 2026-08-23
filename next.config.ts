import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core does dynamic/native `require()`s Turbopack can't
  // statically bundle (confirmed live: bundling it produced "Failed to
  // load external module playwright-core... Cannot find module
  // .../browsers.json" in the deployed function even with an explicit
  // outputFileTracingIncludes entry for that exact file below — the
  // include alone wasn't enough because the package needs to be excluded
  // from bundling altogether, not just have one extra file traced in).
  // This is Next's own documented mechanism for exactly that class of
  // package: keep it unbundled, require() it from the real node_modules
  // directory at runtime, which Vercel then traces/deploys as a whole.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min"],
  // The AI "where do I get this key" guide route reads these docs from disk at
  // runtime. They aren't imported by code, so trace them into that function's
  // bundle explicitly — otherwise readFileSync 404s on Vercel.
  outputFileTracingIncludes: {
    "/api/agency/setup/guide": ["./CLAUDE.md", "./SETUP.md", "./.env.example"],
    // swisseph-wasm's binary ephemeris files (2026-08-12 root-cause fix).
    // swiss-ephemeris.ts's getSwissEph() loads these at runtime via the
    // package's own `locateFile` (a `new URL(...)`/`__dirname` join
    // computed at call time, not a static `import`/`require` of the
    // binary) — Next's tracer can't see that as a real dependency, so
    // every route below deployed with the .wasm/.data files missing:
    // computeHumanDesignVariables/chironPlacement threw ENOENT in every
    // affected serverless function, confirmed via `vercel logs`.
    //
    // First attempt at this fix (same day) used only the pnpm SYMLINK
    // path (`./node_modules/swisseph-wasm/wasm/*`) — that traced and
    // deployed fine, but the actual runtime error path is the REAL pnpm
    // store location the symlink points at
    // (`/var/task/node_modules/.pnpm/swisseph-wasm@0.1.0/node_modules/
    // swisseph-wasm/wasm/swisseph.wasm`), confirmed via `vercel logs`
    // AFTER that first attempt was live — Vercel's packaging materializes
    // whatever literal path the trace manifest lists, and doesn't also
    // duplicate that content at the symlink's real target. Both globs are
    // included below so this survives either pnpm's real store layout or
    // a future non-pnpm/hoisted install (npm/yarn) without a `.pnpm`
    // directory at all.
    //
    // Scoped to the Energetic Decoder feature's own routes (not a blanket
    // "/**") so this doesn't bloat every unrelated function's bundle; any
    // future route added under these same paths is covered automatically
    // by the wildcard, matching the CLAUDE.md-guide precedent above.
    "/api/decoder/**": [
      "./node_modules/swisseph-wasm/wasm/*",
      "./node_modules/.pnpm/swisseph-wasm@*/node_modules/swisseph-wasm/wasm/*",
    ],
    "/api/sub-accounts/[id]/energetic-decoder/**": [
      "./node_modules/swisseph-wasm/wasm/*",
      "./node_modules/.pnpm/swisseph-wasm@*/node_modules/swisseph-wasm/wasm/*",
    ],
    "/decoder/**": [
      "./node_modules/swisseph-wasm/wasm/*",
      "./node_modules/.pnpm/swisseph-wasm@*/node_modules/swisseph-wasm/wasm/*",
    ],
    // Skool Import (2026-08-24) — same root-cause CLASS as swisseph-wasm
    // above (playwright-core's `lib/coreBundle.js` reads its own
    // `browsers.json` off disk at runtime, not via a static import Next's
    // tracer can see — confirmed live via `vercel logs`: "Cannot find
    // module '.../playwright-core/browsers.json'"), but a DIFFERENT and
    // more surprising root cause on the KEY side: a key containing route
    // params in bracket syntax — e.g. the shape
    // "/api/community/[saId]/[groupId]/skool-import/**", matching this
    // exact folder structure — silently matched NOTHING under this
    // project's Turbopack build (confirmed by inspecting the built
    // route's own .next/**/route.js.nft.json — zero effect across three
    // different glob variants). A bracket-free prefix key does work
    // (verified: browsers.json present in the trace manifest after
    // switching to this exact key shape) — Turbopack's key matcher
    // apparently doesn't handle `[param]` segments in
    // outputFileTracingIncludes keys the way its VALUE globs do. This
    // means the pre-existing
    // "/api/sub-accounts/[id]/energetic-decoder/**" key above likely has
    // the same latent bug and may only be "working" in production because
    // "/api/decoder/**" already covers the wasm files some other route
    // needs — NOT verified/fixed here (out of scope for this pass), flagged
    // for a future look.
    "/api/community/**": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/browsers.json",
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
  async headers() {
    return [
      {
        // The web-chat embed iframe target — must be loadable cross-
        // origin from any buyer's site. CSP frame-ancestors '*' is the
        // explicit way to allow that; without it, some hosts (and the
        // Vercel default in certain configs) inject X-Frame-Options
        // DENY/SAMEORIGIN which would block third-party iframes.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
          // Suppress the legacy header in case anything upstream tries
          // to add it. (Vercel doesn't by default but belt-and-braces.)
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        // Widget loader: long-cache and serve to any origin so the
        // <script> tag works on any buyer's site.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
