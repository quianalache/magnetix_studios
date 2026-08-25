import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/pwa/build-manifest";

/**
 * PWA web-app manifest for the STAFF CRM — served as a dynamic route (not
 * the static `app/manifest.ts` convention) so branding reflects live
 * state. Linked site-wide from root-layout metadata (custom-branded
 * deployments only; see layout.tsx).
 *
 * `start_url: /dashboard` — the legacy flat route redirects authenticated
 * users to their first-membership sub-account; unauthenticated opens land
 * on /login via middleware.
 *
 * MyMagnetix has its OWN manifest at `/my/manifest.webmanifest` (linked
 * from `src/app/my/(app)/layout.tsx`) rather than branching this one on
 * Referer — see `build-manifest.ts` for why that was tried and reverted.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await buildManifest("/dashboard");
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Brand renames are rare — cache briefly so every page load doesn't
      // trigger a Firestore read, but changes still land within minutes.
      "Cache-Control": "public, max-age=300",
    },
  });
}
