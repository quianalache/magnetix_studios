"use client";

import { useEffect, useState } from "react";
import { useSubAccount } from "@/context/sub-account-context";
import type { SubAccountDoc } from "@/types";

/** The live-context field this gate reads, and the matching key the
 *  read-only `/api/sub-accounts/[id]/feature-gates` fallback returns. */
type GateSpec = {
  field: keyof Pick<
    SubAccountDoc,
    | "communityEnabledByAgency"
    | "standaloneCoursesEnabledByAgency"
    | "labsEnabledByAgency"
    | "getLeadsEnabledByAgency"
    | "socialPlannerEnabledByAgency"
    | "broadcastsEnabledByAgency"
    | "aiSuiteEnabledByAgency"
  >;
  fallbackKey:
    | "communityEnabled"
    | "standaloneCoursesEnabled"
    | "labsEnabled"
    | "getLeadsEnabled"
    | "socialPlannerEnabled"
    | "broadcastsEnabled"
    | "aiSuiteEnabled";
};

const TIMEOUT_MS = 10_000;

/**
 * Resilient feature-gate read (2026-08-30 "Community is locked" false-lock
 * fix). `SubAccountProvider`'s live `subAccount` value depends on the
 * CLIENT Firebase Auth SDK's own local session establishing correctly, on
 * top of a live Firestore listener — a real gap from the SERVER-verified
 * `__session` cookie every other authenticated read in this app trusts
 * (Server Components, API routes). Reproduced live: a real, fully-enabled
 * sub-account showed "Community is locked" / "Courses is locked"
 * indefinitely because that client-side path never delivered data, even
 * though `communityEnabledByAgency`/`standaloneCoursesEnabledByAgency`
 * were genuinely `true` in Firestore the whole time.
 *
 * This hook trusts the live `subAccount` value whenever it's actually
 * arrived (so real-time toggling by the agency owner still works exactly
 * as before), and falls back to a ONE-TIME, server-verified read from
 * `/api/sub-accounts/[id]/feature-gates` (same Admin-SDK source of truth
 * the real access enforcement already uses) whenever the live value
 * hasn't shown up — including "never," which is exactly the bug this
 * closes. Not a new or looser gate: both sources read the identical
 * Firestore field via `=== true`.
 */
export function useResilientFeatureGate(spec: GateSpec): {
  /** True once we have SOME answer (live or fallback) to trust. */
  known: boolean;
  /** The current best-known enabled state. Meaningless until `known`. */
  enabled: boolean;
  /** True if neither source resolved within a reasonable window — a real
   *  error/timeout state, deliberately distinct from "confirmed locked". */
  timedOut: boolean;
} {
  const { subAccountId, subAccount } = useSubAccount();
  const [fallback, setFallback] = useState<{ loaded: boolean; enabled: boolean }>({
    loaded: false,
    enabled: false,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/feature-gates`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("gate fetch failed"))))
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        setFallback({ loaded: true, enabled: data[spec.fallbackKey] === true });
      })
      .catch(() => {
        if (!cancelled) setFallback((prev) => (prev.loaded ? prev : { loaded: false, enabled: false }));
      });
    return () => {
      cancelled = true;
    };
    // spec.fallbackKey is a stable literal per call site — not a real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  useEffect(() => {
    if (subAccount || fallback.loaded) return;
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [subAccount, fallback.loaded]);

  const known = !!subAccount || fallback.loaded;
  const enabled = subAccount ? subAccount[spec.field] === true : fallback.enabled;
  return { known, enabled, timedOut };
}
