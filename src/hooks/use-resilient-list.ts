"use client";

import { useEffect, useRef, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";

/**
 * Resilient list read (2026-08-30 Community/Courses launch-hardening).
 * Same precedence model as `useResilientFeatureGate`: a server-verified
 * fetch (Admin SDK, same trust boundary the real access enforcement
 * already uses) is the reliable baseline; the live Firestore listener is
 * a pure enhancement, trusted only once it has ACTUALLY delivered a
 * successful snapshot. An unavailable/erroring/never-resolving listener
 * therefore can never overwrite known-good data with an empty array — it
 * never reaches "delivered" in the first place, so it's structurally
 * excluded from ever winning. Once the listener DOES deliver, a Firestore
 * query snapshot is always the complete current result set (never a
 * delta), so switching the displayed list to it is inherently
 * non-duplicating — no manual merge is needed or attempted.
 *
 * Reproduced live (see the Build Log's "Community/Courses false-lock"
 * entries): the underlying client Firebase Auth/Firestore session can
 * fail intermittently even while the server session cookie stays valid,
 * which previously left the Community/Courses list pages either stuck on
 * a spinner forever, showing a false "no groups/courses yet" empty
 * state, or in rarer cases crashing the whole page. This hook exists so
 * neither of those can happen for launch-critical list UI again.
 */
export function useResilientList<T>({
  enabled,
  fetchUrl,
  extractItems,
  extractIsAdmin,
  subscribe,
  /** Bumped to force one extra server refetch — e.g. right after this
   *  staff member creates a new row, so it appears even if the live
   *  listener is unhealthy right now (Part 3/4: "existing groups/courses
   *  do not disappear... New group/course action does not disappear"). */
  refetchToken,
}: {
  /** Only fetch/subscribe once true — e.g. once the feature gate is
   *  confirmed enabled. */
  enabled: boolean;
  fetchUrl: string;
  extractItems: (json: unknown) => T[];
  extractIsAdmin: (json: unknown) => boolean;
  /** Same `(saId, onData, onError?) => Unsubscribe` shape every
   *  `subscribeTo*` helper in `@/lib/firestore/*` already has — pass the
   *  existing one bound to its subAccountId, nothing new to write. */
  subscribe: (
    onData: (items: T[]) => void,
    onError: (err: Error) => void,
  ) => Unsubscribe | undefined;
  refetchToken?: number;
}): {
  items: T[];
  /** True once there's a reliable answer — server fetch resolved OR the
   *  live listener delivered. Show a loading state until this is true;
   *  never show "no results" before this is true (Part 7). */
  resolved: boolean;
  /** Server-verified — see each route's own doc comment for why this,
   *  not the client-only `useSubAccount().isAdmin`, gates admin actions. */
  isAdmin: boolean;
  /** True once the live listener has ever delivered — items are then
   *  realtime-fresh, not just the point-in-time server read. */
  live: boolean;
  /** True if the live listener visibly errored (not merely "hasn't fired
   *  yet"). Only ever used for a small, non-alarming "showing saved
   *  data" note — never to blank the list (Part 6). */
  liveDegraded: boolean;
} {
  const [serverState, setServerState] = useState<{
    loaded: boolean;
    items: T[];
    isAdmin: boolean;
  }>({ loaded: false, items: [], isAdmin: false });
  const [liveItems, setLiveItems] = useState<T[] | null>(null);
  const [liveDegraded, setLiveDegraded] = useState(false);
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(fetchUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("list fetch failed"))))
      .then((json: unknown) => {
        if (cancelled) return;
        setServerState({ loaded: true, items: extractItems(json), isAdmin: extractIsAdmin(json) });
      })
      .catch(() => {
        // A genuine fetch failure (network down, etc.) — still resolve so
        // the page doesn't spin forever, but only with an empty baseline
        // if nothing else has already loaded; the live listener below is
        // independent and can still succeed on its own.
        if (!cancelled) {
          setServerState((prev) => (prev.loaded ? prev : { loaded: true, items: [], isAdmin: false }));
        }
      });
    return () => {
      cancelled = true;
    };
    // extractItems/extractIsAdmin are stable per call site (plain field
    // pluckers), not real deps — refetchToken forces a deliberate re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetchUrl, refetchToken]);

  useEffect(() => {
    if (!enabled) return;
    // 2026-08-30 root-cause follow-up: registering a Firestore listener
    // (calling onSnapshot) is normally async-safe — failures are supposed
    // to only ever reach the onError callback above. Live production
    // testing proved that's not always true here: a currently-open
    // upstream Firestore JS SDK bug (firebase-js-sdk#9267, "INTERNAL
    // ASSERTION FAILED... Unexpected state") can leave the shared client
    // SDK instance in a corrupted state from an EARLIER, unrelated
    // listener elsewhere on the page, such that THIS call — the very next
    // onSnapshot registration to run — throws SYNCHRONOUSLY instead of
    // routing the failure through onError. An uncaught synchronous throw
    // inside a render-phase effect takes down the whole route segment
    // (confirmed live: this exact call site, `Object.subscribe [as
    // current]`, was the crash's proximate frame). Catching it here and
    // treating it identically to an async onError failure keeps this
    // hook's existing resilient-fallback contract (server data stays
    // authoritative, "liveDegraded" note only) intact even when the SDK
    // itself misbehaves this way — this is a defensive containment of a
    // confirmed-real upstream bug, not a fix for the SDK's own state
    // corruption.
    try {
      const unsub = subscribeRef.current(
        (items) => {
          setLiveItems(items);
          setLiveDegraded(false);
        },
        () => setLiveDegraded(true),
      );
      return unsub;
    } catch {
      setLiveDegraded(true);
      return undefined;
    }
  }, [enabled]);

  const resolved = serverState.loaded || liveItems !== null;
  const items = liveItems !== null ? liveItems : serverState.items;
  return {
    items,
    resolved,
    isAdmin: serverState.isAdmin,
    live: liveItems !== null,
    liveDegraded,
  };
}
