import React from "react";
import { AlertTriangle, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/system/empty-state";

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

  // Shared empty-state card (Visual Direction 2, 2026-10-24) on the plain
  // canvas — same states, copy and back link as before.
  return (
    <div className="bg-background flex h-dvh items-center justify-center px-4">
      <EmptyState
        className="w-full max-w-md"
        icon={accessDenied ? ShieldAlert : AlertTriangle}
        title={title}
        description={detail}
        action={
          <Button variant="outline" render={<a href={backHref} />}>
            <ArrowLeft />
            Back to Pages &amp; Funnels
          </Button>
        }
      />
    </div>
  );
}
