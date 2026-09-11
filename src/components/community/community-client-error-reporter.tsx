"use client";

import { useEffect } from "react";
import { reportCommunityClientError } from "@/lib/community/client-error-reporting";

/** Temporary, Community-scoped production diagnostic. It deliberately sends
 * only browser error metadata and never reads browser storage or
 * credentials.
 *
 * Catches errors that escape React entirely — thrown from an event handler
 * or a Next router transition, not during render (window `error`/
 * `unhandledrejection`). Render-phase errors from the account menu
 * specifically are also covered, separately, by AccountMenuErrorBoundary —
 * see that file's doc comment for why both are needed. Redaction, the
 * stale-chunk self-heal, and the actual POST all live in
 * lib/community/client-error-reporting.ts, shared with that boundary. */
export function CommunityClientErrorReporter({
  saId,
  groupId,
}: {
  saId: string;
  groupId?: string;
}) {
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      reportCommunityClientError(saId, groupId, {
        name: event.error instanceof Error ? event.error.name : "Error",
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportCommunityClientError(saId, groupId, {
        name: reason instanceof Error ? reason.name : "UnhandledRejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [saId, groupId]);

  return null;
}
