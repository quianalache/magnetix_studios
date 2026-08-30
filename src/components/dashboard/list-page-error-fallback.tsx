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
 * Never shows the raw error/digest to the customer. "Try again" forces a
 * real page reload rather than only calling Next's `reset()` — live-QA'd
 * both ways: `reset()` alone re-renders this route segment in place, but
 * the underlying corrupted client Firebase Auth/Firestore session (the
 * actual root cause) lives in that same browser tab's JS heap and often
 * survives a `reset()`, so it kept re-throwing; a genuine reload gets a
 * fresh JS context and reliably recovered in the same testing. `reset()`
 * is still called first (harmless, and instant when it happens to be
 * enough) before the reload fires.
 */
export function ListPageErrorFallback({
  label,
  reset,
}: {
  /** e.g. "Community" or "Courses" — used only in the heading copy. */
  label: string;
  reset: () => void;
}) {
  function tryAgain() {
    reset();
    window.location.reload();
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl p-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Couldn&apos;t load {label} right now</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong loading this page. Your data is safe — this is a
          temporary display issue, not a data problem.
        </p>
        <Button type="button" variant="outline" onClick={tryAgain}>
          <RotateCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
