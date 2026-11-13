"use client";

import { useEffect } from "react";

function browserId(key: string): string {
  const storageKey = `mx-funnel-visitor:${key}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, value);
  return value;
}

export function FunnelAnalyticsTracker({ pageId, configId }: { pageId?: string; configId?: string }) {
  useEffect(() => {
    if (!pageId && !configId) return;
    const key = pageId ? `page:${pageId}` : `checkout:${configId}`;
    const visitorId = browserId(key);
    const viewId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    void fetch("/api/funnels/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, configId, visitorId, viewId }), keepalive: true }).catch(() => undefined);
  }, [pageId, configId]);
  return null;
}
