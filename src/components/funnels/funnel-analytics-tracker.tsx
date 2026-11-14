"use client";

import { useEffect } from "react";

/**
 * Anonymous, per-tab visitor session id. Scoped to the WORKSPACE (not the
 * page) so one visitor's journey through a funnel — landing page, checkout,
 * upsells — keeps one id and is counted as one entry / one session.
 * sessionStorage only: it ends with the tab, is never shared across sites or
 * workspaces, carries no personal data and is never used to create a
 * Contact. Server-side keys always combine it with the funnel / page id.
 */
function browserId(key: string): string {
  const storageKey = `mx-funnel-visitor:${key}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
  } catch {
    /* storage blocked: fall through to a one-off id */
  }
  const value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.sessionStorage.setItem(storageKey, value);
  } catch {
    /* ignore */
  }
  return value;
}

export function FunnelAnalyticsTracker({ pageId, configId, subAccountId }: { pageId?: string; configId?: string; subAccountId?: string | null }) {
  useEffect(() => {
    if (!pageId && !configId) return;
    const key = subAccountId ? `ws:${subAccountId}` : pageId ? `page:${pageId}` : `checkout:${configId}`;
    const visitorId = browserId(key);
    const viewId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    void fetch("/api/funnels/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, configId, visitorId, viewId }), keepalive: true }).catch(() => undefined);
  }, [pageId, configId, subAccountId]);
  return null;
}
