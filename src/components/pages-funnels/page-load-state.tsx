import React from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

export type PageLoadState =
  | "loading"
  | "ready"
  | "not-found"
  | "access-denied"
  | "error";

export function classifyPageLoadError(
  error: unknown
): Exclude<PageLoadState, "loading" | "ready" | "not-found"> {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message =
    typeof candidate?.message === "string" ? candidate.message : "";
  const normalized = `${code} ${message}`.toLowerCase();
  return normalized.includes("permission-denied") ||
    normalized.includes("permission denied")
    ? "access-denied"
    : "error";
}

export function PageLoadStateView({
  state,
  backHref,
}: {
  state: PageLoadState;
  backHref: string;
}) {
  if (state === "loading") {
    return (
      <div
        className="flex h-dvh items-center justify-center"
        role="status"
        aria-label="Loading page"
      >
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  const accessDenied = state === "access-denied";
  const notFound = state === "not-found";
  const title = accessDenied
    ? "You don’t have access to this page."
    : notFound
      ? "Page not found."
      : "This page couldn’t be loaded.";
  const detail = accessDenied
    ? "Ask your workspace administrator for access to this page."
    : notFound
      ? "The page may have been removed or the link may be incorrect."
      : "Please try again. If the problem continues, contact your workspace administrator.";

  return (
    <div className="bg-background flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      {accessDenied ? (
        <ShieldAlert className="text-primary h-7 w-7" aria-hidden="true" />
      ) : (
        <AlertTriangle
          className="text-muted-foreground h-7 w-7"
          aria-hidden="true"
        />
      )}
      <p className="text-foreground text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{detail}</p>
      <a href={backHref} className="text-primary text-sm font-medium underline">
        Back to Pages &amp; Funnels
      </a>
    </div>
  );
}
