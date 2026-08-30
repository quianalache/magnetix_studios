"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared fallback UI for the Community/Courses list pages' `error.tsx`
 * boundaries (2026-08-30 launch-hardening). Reached only if a client-render
 * throw still slips past the server-verified baseline data those pages now
 * use (`useResilientList`/`useResilientFeatureGate`) — a real, reproduced
 * failure mode of the underlying client Firebase Auth/Firestore session
 * (see the Build Log's "Application Error" root-cause entry), not a
 * generic catch-all: this is Next.js's own per-route-segment error
 * boundary convention, scoped to just these two routes, not the whole app.
 * Never shows the raw error/digest to the customer — `reset()` re-renders
 * this route segment from scratch (a fresh mount re-runs the server fetch
 * fallback too, not just the client listener that likely caused this).
 */
export function ListPageErrorFallback({
  label,
  reset,
}: {
  /** e.g. "Community" or "Courses" — used only in the heading copy. */
  label: string;
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl p-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Couldn&apos;t load {label} right now</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong loading this page. Your data is safe — this is a
          temporary display issue, not a data problem.
        </p>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
