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

/** Temporary, Community-scoped production diagnostic. It deliberately sends
 * only browser error metadata and never reads browser storage or credentials. */
export function CommunityClientErrorReporter({ saId }: { saId: string }) {
  useEffect(() => {
    const report = (input: {
      name?: string;
      message?: string;
      stack?: string;
    }) => {
      const body = JSON.stringify({
        name: redact(input.name || "Error"),
        message: redact(input.message || "Unknown client error"),
        stack: input.stack ? redact(input.stack) : undefined,
        pathname: window.location.pathname,
        userAgent: redact(navigator.userAgent),
        timestamp: new Date().toISOString(),
      });
      if (body.length > 12000) return;
      void fetch(`/api/community/${encodeURIComponent(saId)}/client-errors`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => undefined);
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
