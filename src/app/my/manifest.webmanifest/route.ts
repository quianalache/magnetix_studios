import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/pwa/build-manifest";

/**
 * PWA web-app manifest for MyMagnetix — a distinct URL from the staff
 * CRM's `/manifest.webmanifest` so `start_url` can correctly be `/my`
 * without depending on the request's Referer (see `build-manifest.ts` for
 * why a single Referer-branching manifest was tried and reverted — it was
 * silently defeated by edge/browser caching keyed on URL alone). Linked
 * from `src/app/my/(app)/layout.tsx`, overriding the root layout's
 * manifest link for every page under `/my`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await buildManifest("/my");
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
