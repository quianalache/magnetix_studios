"use client";

import dynamic from "next/dynamic";

// <Puck> cannot be server-rendered, even for the initial shell (master spec
// §3 — confirmed hard constraint, not something to retry with
// force-dynamic). Identical wrapper pattern to the POC's page.tsx.
const PagesFunnelsPuckFoundationEditor = dynamic(
  () => import("./editor-client"),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-dvh items-center justify-center text-sm">
        Loading Puck editor…
      </div>
    ),
  }
);

export default function PagesFunnelsPuckFoundationPage() {
  return <PagesFunnelsPuckFoundationEditor />;
}
