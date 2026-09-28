"use client";

import { AssetsTab } from "@/components/projects/assets-tab";

/**
 * Assets — the existing Projects → Assets tab, unchanged, on its own route.
 *
 * The approved Projects redesign (Sept 2026) removes Assets from Projects
 * (no in-page tab, not nested in the Projects sidebar section); Assets will
 * become its own top-level module in a separate, not-yet-approved redesign.
 * Until then this page keeps the current functionality, records, bundles
 * and affiliate links reachable exactly as they were.
 */
export default function AssetsPage() {
  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
        <p className="text-muted-foreground text-sm">
          Your digital assets, offer bundles, and affiliate links.
        </p>
      </div>
      <AssetsTab />
    </div>
  );
}
