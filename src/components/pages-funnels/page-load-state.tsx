import React from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
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

/**
 * Unknown-block safety guard (2026-11-04): the page holds block types this
 * build of the builder doesn't know (a newer build saved them). The editor
 * is never mounted — no canvas, no autosave, no Save Draft / Publish — so the
 * page stays exactly as stored. When this build isn't running on the
 * canonical app URL (a stale preview, an old deployment), it points to the
 * current builder; it never redirects on its own.
 */
export function PageCompatibilityView({
  pageName,
  unknownTypes,
  backHref,
  currentBuilderHref,
}: {
  pageName: string;
  unknownTypes: readonly string[];
  backHref: string;
  /** Same page in the canonical builder, or null when this already is it. */
  currentBuilderHref: string | null;
}) {
  return (
    <div className="bg-background flex h-dvh items-center justify-center px-4" data-page-compatibility-guard="">
      <EmptyState
        className="w-full max-w-lg"
        icon={ShieldAlert}
        title="This page can’t be edited in this version of the builder."
        description={
          <span className="space-y-2">
            <span className="block">
              “{pageName}” includes newer content that this version of the builder can’t safely edit. To protect it, editing, Save Draft and Publish are turned off here.
            </span>
            <span className="block font-medium">Nothing on this page has been changed.</span>
            <span className="block text-xs">Newer content: {unknownTypes.join(", ")}</span>
            <span className="block">
              {currentBuilderHref ? "Open this page in the current builder to edit it." : "Reload to load the latest version of the builder, then try again."}
            </span>
          </span>
        }
        action={
          <span className="flex flex-wrap justify-center gap-2">
            {currentBuilderHref ? (
              <Button render={<a href={currentBuilderHref} />}>
                <ExternalLink />
                Open in the current builder
              </Button>
            ) : null}
            <Button variant="outline" render={<a href={backHref} />}>
              <ArrowLeft />
              Back to Pages &amp; Funnels
            </Button>
          </span>
        }
      />
    </div>
  );
}
