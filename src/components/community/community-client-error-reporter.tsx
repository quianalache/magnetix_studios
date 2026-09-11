"use client";

import { useEffect } from "react";

const MAX_FIELD_LENGTH = 4000;

function redact(value: string): string {
  return value
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(
      /([?&](?:token|key|secret|authorization)=)[^&#\s]+/gi,
      "$1[REDACTED]"
    )
    .slice(0, MAX_FIELD_LENGTH);
}

// Signature of a stale-build asset mismatch, not a real app bug: the
// browser tab was open across a newer production deploy (this repo ships
// to prod many times a day — see AUTO_DEPLOY in CLAUDE.md) and then tried
// to fetch a JS chunk/RSC payload by a hash the CURRENT deployment no
// longer serves. Every browser/Next version phrases this differently
// ("Loading chunk N failed", "Failed to fetch dynamically imported
// module", "error loading dynamically imported module", a bare
// ChunkLoadError name), but they're all the same non-bug: nothing is
// wrong with the code, the tab is just holding an old asset manifest.
// Left unhandled this surfaces as Next's generic "Application error: a
// client-side exception has occurred" — which also unmounts the
// authenticated shell, reading to the member as an unexplained sign-out.
function isStaleChunkError(name: string, message: string): boolean {
  const text = `${name} ${message}`.toLowerCase();
  return (
    text.includes("chunkloaderror") ||
    text.includes("loading chunk") ||
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("importing a module script failed")
  );
}

const RELOAD_GUARD_KEY = "community-stale-chunk-reload";

/** Temporary, Community-scoped production diagnostic. It deliberately sends
 * only browser error metadata and never reads browser storage or credentials.
 *
 * Also self-heals the one class of crash this route sees repeatedly in a
 * repo that deploys to prod continuously: a stale-chunk load failure (see
 * isStaleChunkError above) gets ONE automatic reload instead of leaving the
 * member stranded on Next's generic crash screen. Guarded via
 * sessionStorage so a genuinely broken deploy still fails visibly (and
 * still gets reported below) instead of reload-looping forever. */
export function CommunityClientErrorReporter({ saId }: { saId: string }) {
  useEffect(() => {
    const report = (input: {
      name?: string;
      message?: string;
      stack?: string;
    }) => {
      const name = input.name || "Error";
      const message = input.message || "Unknown client error";
      const body = JSON.stringify({
        name: redact(name),
        message: redact(message),
        stack: input.stack ? redact(input.stack) : undefined,
        pathname: window.location.pathname,
        userAgent: redact(navigator.userAgent),
        timestamp: new Date().toISOString(),
      });
      if (body.length <= 12000) {
        void fetch(`/api/community/${encodeURIComponent(saId)}/client-errors`, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body,
        }).catch(() => undefined);
      }

      if (isStaleChunkError(name, message)) {
        let alreadyReloaded = false;
        try {
          alreadyReloaded =
            window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
          if (!alreadyReloaded) {
            window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
          }
        } catch {
          // Storage unavailable (private mode, quota) — fall through and
          // reload once anyway; worst case is a single extra reload.
        }
        if (!alreadyReloaded) window.location.reload();
      }
    };
    const onError = (event: ErrorEvent) =>
      report({
        name: event.error instanceof Error ? event.error.name : "Error",
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report({
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
  }, [saId]);

  return null;
}
