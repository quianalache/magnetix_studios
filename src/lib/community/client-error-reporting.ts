"use client";

// Shared by CommunityClientErrorReporter (window-level error/rejection
// listeners) and AccountMenuErrorBoundary (React render-phase errors) so
// both funnel through the same redaction + last-action-context logic. Also
// used directly by CommunityAccountMenu to record which interaction was in
// flight (avatar-click / menu-open / menu-item-click) — a synchronous,
// module-level "last action" pointer, not React state, because the whole
// point is to still know what happened even when the error escapes React
// entirely (see the historical Route-Handler-Link prefetch bug this was
// built to help diagnose).

const MAX_FIELD_LENGTH = 4000;

export function redact(value: string): string {
  return value
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(
      /([?&](?:token|key|secret|authorization)=)[^&#\s]+/gi,
      "$1[REDACTED]"
    )
    .slice(0, MAX_FIELD_LENGTH);
}

// Signature of a stale-build asset mismatch (a tab open across a newer
// deploy), not a real app bug — see CommunityClientErrorReporter's doc
// comment. Real user QA on a fresh reload has since ruled this out as the
// cause of the avatar-menu crash specifically, but the check (and its
// one-shot reload) stays: it's still a real, separate failure mode this
// route can hit on any continuously-deployed day.
export function isStaleChunkError(name: string, message: string): boolean {
  const text = `${name} ${message}`.toLowerCase();
  return (
    text.includes("chunkloaderror") ||
    text.includes("loading chunk") ||
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("importing a module script failed")
  );
}

export type CommunityMenuAction =
  | "avatar-click"
  | "menu-open"
  | "menu-item-click";

type LastAction = { action: CommunityMenuAction; href?: string; at: number };

let lastAction: LastAction | null = null;

/** Called synchronously from CommunityAccountMenu's own event handlers —
 * never from inside a try/catch, so it's recorded even if the very next
 * synchronous step throws. */
export function setLastCommunityMenuAction(
  action: CommunityMenuAction,
  href?: string
): void {
  lastAction = { action, href, at: Date.now() };
}

/** Only trusted within a couple seconds of the click — after that, an
 * error is unrelated to the interaction and shouldn't borrow its context. */
function getRecentCommunityMenuAction(): LastAction | null {
  if (!lastAction) return null;
  return Date.now() - lastAction.at <= 5000 ? lastAction : null;
}

export type CommunityErrorReportInput = {
  name?: string;
  message?: string;
  stack?: string;
  /** Explicit action context (e.g. from the error boundary, which knows
   * exactly what it was rendering) overrides the inferred last action. */
  action?: CommunityMenuAction;
  href?: string;
};

export function reportCommunityClientError(
  saId: string,
  groupId: string | undefined,
  input: CommunityErrorReportInput
): void {
  if (typeof window === "undefined") return;
  const recent = getRecentCommunityMenuAction();
  const name = input.name || "Error";
  const message = input.message || "Unknown client error";
  const action = input.action ?? recent?.action;
  const href = input.href ?? recent?.href;

  const body = JSON.stringify({
    name: redact(name),
    message: redact(message),
    stack: input.stack ? redact(input.stack) : undefined,
    pathname: window.location.pathname,
    userAgent: redact(navigator.userAgent),
    timestamp: new Date().toISOString(),
    groupId,
    action,
    href,
  });
  if (body.length > 12000) return;
  void fetch(`/api/community/${encodeURIComponent(saId)}/client-errors`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => undefined);

  if (isStaleChunkError(name, message)) {
    const RELOAD_GUARD_KEY = "community-stale-chunk-reload";
    let alreadyReloaded = false;
    try {
      alreadyReloaded = window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      }
    } catch {
      // Storage unavailable (private mode, quota) — fall through and
      // reload once anyway; worst case is a single extra reload.
    }
    if (!alreadyReloaded) window.location.reload();
  }
}
