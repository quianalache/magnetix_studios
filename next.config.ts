import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    // affected serverless function, confirmed via `vercel logs`. Scoped to
    // the Energetic Decoder feature's own routes (not a blanket "/**") so
    // this doesn't bloat every unrelated function's bundle — any future
    // route added under these same paths is covered automatically by the
    // wildcard, matching the CLAUDE.md-guide precedent just above.
    "/api/decoder/**": ["./node_modules/swisseph-wasm/wasm/*"],
    "/api/sub-accounts/[id]/energetic-decoder/**": ["./node_modules/swisseph-wasm/wasm/*"],
    "/decoder/**": ["./node_modules/swisseph-wasm/wasm/*"],
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
