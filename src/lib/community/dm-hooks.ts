"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DmInboxItem, DmMessageView } from "@/types/community";

/**
 * DM delivery layer (v1: polling). Everything that reads messages lives in
 * these hooks, so upgrading to realtime later means swapping their INTERNALS
 * for Firestore `onSnapshot` — the components calling them don't change.
 *
 * All polling is visibility-aware: it only runs while the tab is visible and
 * pauses when hidden, so an idle member generates no load.
 */
function usePoll(
  fn: () => void | Promise<void>,
  intervalMs: number,
  immediate = false,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        try {
          await fnRef.current();
        } catch {
          /* ignore transient poll errors */
        }
      }
    };
    const tick = async () => {
      await run();
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    if (immediate) void run();
    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intervalMs, immediate]);
}

/** Agency Community (2026-09-17) — `agencyScope: true` targets
 *  `/api/agency/dm/...` (agency-wide, Person-identified) instead of
 *  `/api/community/{saId}/dm/...` (tenant, Member-identified). `saId` is
 *  meaningless/ignored in that mode, same convention as `agencyGroupId`
 *  elsewhere in this codebase. */
function dmApiBase(saId: string, agencyScope?: boolean): string {
  return agencyScope ? "/api/agency/dm" : `/api/community/${saId}/dm`;
}

export function useUnreadCount(saId: string, initial: number, agencyScope?: boolean) {
  const [count, setCount] = useState(initial);
  usePoll(
    async () => {
      const res = await fetch(`${dmApiBase(saId, agencyScope)}/unread`);
      if (!res.ok) return;
      const d = (await res.json()) as { count?: number };
      if (typeof d.count === "number") setCount(d.count);
    },
    45000,
    true,
  );
  return count;
}

export function useInbox(saId: string, initial: DmInboxItem[], agencyScope?: boolean) {
  const [items, setItems] = useState(initial);
  usePoll(async () => {
    const res = await fetch(`${dmApiBase(saId, agencyScope)}/inbox`);
    if (!res.ok) return;
    const d = (await res.json()) as { items?: DmInboxItem[] };
    if (Array.isArray(d.items)) setItems(d.items);
  }, 15000);
  return items;
}

export function useThreadMessages(
  saId: string,
  threadId: string,
  initial: DmMessageView[],
  agencyScope?: boolean,
) {
  const [messages, setMessages] = useState(initial);
  const lastMsRef = useRef(
    initial.length ? initial[initial.length - 1].createdAtMs : 0,
  );

  const merge = useCallback((incoming: DmMessageView[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !ids.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastMsRef.current = Math.max(
      lastMsRef.current,
      ...incoming.map((m) => m.createdAtMs),
    );
  }, []);

  usePoll(async () => {
    const res = await fetch(
      `${dmApiBase(saId, agencyScope)}/threads/${threadId}/messages?since=${lastMsRef.current}`,
    );
    if (!res.ok) return;
    const d = (await res.json()) as { messages?: DmMessageView[] };
    if (Array.isArray(d.messages)) merge(d.messages);
  }, 3000);

  /** Optimistically add a just-sent message (deduped by id when the poll
   *  returns it). */
  const addLocal = useCallback((m: DmMessageView) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  return { messages, addLocal };
}
