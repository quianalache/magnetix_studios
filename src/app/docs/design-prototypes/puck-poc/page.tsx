"use client";

import dynamic from "next/dynamic";

/**
 * <Puck> cannot be server-rendered at all — not even for the initial HTML
 * shell. `export const dynamic = "force-dynamic"` alone was NOT enough:
 * `next build` still failed prerendering this route with "Cannot read
 * properties of null (reading 'position')" (Puck touches real browser
 * layout APIs during Next's build-time client-component render pass). The
 * fix that actually worked is `next/dynamic` with `ssr: false`, which skips
 * server rendering entirely and only ever mounts the editor in the browser.
 * A concrete integration finding — see the POC report's Risks/§12 sections.
 */
const PuckPocEditor = dynamic(() => import("./editor-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-gray-500">Loading Puck editor…</div>
  ),
});

export default function PuckPocPage() {
  return <PuckPocEditor />;
}
