"use client";

import dynamic from "next/dynamic";

// <Puck> cannot be server-rendered even for the initial shell -- same
// finding as the main POC (editor-client.tsx); force-dynamic alone is not
// enough, next/dynamic({ssr:false}) is required.
const MinimalReproEditor = dynamic(() => import("./editor-client"), { ssr: false });

export default function MinimalReproPage() {
  return <MinimalReproEditor />;
}
