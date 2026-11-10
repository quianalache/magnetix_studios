"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getPagesOnce, subscribeToPages } from "@/lib/firestore/pages-funnels";
import { safeSubscribeWithTimeout } from "@/lib/firestore/safe-subscribe";
import type { PageFunnelUse, PagesLibraryFunnel } from "@/lib/pages-funnels/library";
import type { PageDoc } from "@/types/pages-funnels";

export type LoadState = "loading" | "ready" | "error";

/**
 * Data for the Pages & Funnels home (2026-11):
 *  - pages: the same live Firestore listener the old library used (with its
 *    8-second fallback to a one-off read), so thumbnails and edits appear
 *    without a reload;
 *  - funnels + which funnel steps use each page: one tenancy-checked call
 *    to /api/pages-funnels/library (no per-card requests);
 *  - admins: one request per visit asking the server to queue any missing or
 *    out-of-date page thumbnails (the server throttles per page).
 */
export function usePagesLibrary() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin } = useSubAccount();

  const [pages, setPages] = useState<PageDoc[]>([]);
  const [pagesState, setPagesState] = useState<LoadState>("loading");
  const [funnels, setFunnels] = useState<PagesLibraryFunnel[]>([]);
  const [usage, setUsage] = useState<Record<string, PageFunnelUse[]>>({});
  const [libraryState, setLibraryState] = useState<LoadState>("loading");
  const thumbsRequested = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setPagesState("loading");
    const unsub = safeSubscribeWithTimeout(
      (onSettled) =>
        subscribeToPages(
          { agencyId, subAccountId },
          (list) => {
            onSettled();
            setPages(list);
            setPagesState("ready");
          },
          () => {
            onSettled();
            setPagesState("error");
          },
        ),
      () => {
        getPagesOnce({ agencyId, subAccountId })
          .then((list) => {
            setPages(list);
            setPagesState("ready");
          })
          .catch(() => setPagesState("error"));
      },
    );
    return () => unsub?.();
  }, [user, agencyId, subAccountId, authLoading]);

  const reloadLibrary = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages-funnels/library?sa=${encodeURIComponent(subAccountId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { funnels: PagesLibraryFunnel[]; usage: Record<string, PageFunnelUse[]> };
      setFunnels(json.funnels ?? []);
      setUsage(json.usage ?? {});
      setLibraryState("ready");
    } catch {
      setLibraryState("error");
    }
  }, [subAccountId]);

  useEffect(() => {
    if (authLoading || !user) return;
    setLibraryState("loading");
    void reloadLibrary();
  }, [authLoading, user, reloadLibrary]);

  // Once per visit (per workspace): queue missing / stale thumbnails.
  useEffect(() => {
    if (!isAdmin || pagesState !== "ready" || thumbsRequested.current === subAccountId) return;
    thumbsRequested.current = subAccountId;
    void fetch("/api/pages-funnels/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subAccountId }),
    }).catch(() => undefined);
  }, [isAdmin, pagesState, subAccountId]);

  return { pages, pagesState, funnels, usage, libraryState, reloadLibrary };
}
