"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import { safeSubscribeWithTimeout } from "@/lib/firestore/safe-subscribe";
import { CUSTOM_BRAND } from "@/config/landing";
import type { AgencyDoc, AppTheme } from "@/types";

interface AgencySummary {
  /** Agency display name. Falls back to CUSTOM_BRAND.name until hydrated. */
  name: string;
  /** Optional logo URL — when set, sidebar swaps the default chevron mark for this. */
  logoUrl: string | null;
  /** Public support / contact email. Null until set in Agency → Settings. */
  supportEmail: string | null;
  /** Bare public domain (no scheme). Null until set in Agency → Settings. */
  primaryDomain: string | null;
  /** Dashboard accent theme. Null = deployment-mode default. */
  appTheme: AppTheme | null;
  /**
   * Agency Assistant master switch (Agency → Settings). OFF by default —
   * only an explicit `true` on the doc enables it; legacy/unset reads off.
   * Drives the sidebar entry + the /agency/ai-suite page state.
   */
  agencyAssistantEnabled: boolean;
  /**
   * Model tier the Agency Assistant runs on. Unset/legacy docs read as
   * "opus" — matches pre-picker behavior for upgrading deployments.
   */
  agencyAssistantModel: "opus" | "sonnet";
  /** No-code pointer to the agency's own SaaS sales page. Null until set
   *  in Agency → Settings → Sales page. See AgencyDoc's own doc comment. */
  primarySalesPageUrl: string | null;
  /** True until the Firestore snapshot has resolved. UI shouldn't render brand chrome before this flips false. */
  loading: boolean;
}

interface AgencyData {
  name: string;
  logoUrl: string | null;
  supportEmail: string | null;
  primaryDomain: string | null;
  appTheme: AppTheme | null;
  agencyAssistantEnabled: boolean;
  agencyAssistantModel: "opus" | "sonnet";
  primarySalesPageUrl: string | null;
}

/**
 * Live subscription to the current agency doc — drives the dashboard chrome
 * (sidebar logo + wordmark, browser tab title) AND hydrates the Agency →
 * Settings branding form. Returns sensible defaults before hydration so
 * SSR matches the first client paint.
 */
export function useAgency(): AgencySummary {
  const { agencyId, loading: authLoading } = useAuth();
  const [data, setData] = useState<AgencyData>({
    name: CUSTOM_BRAND.name,
    logoUrl: null,
    supportEmail: null,
    primaryDomain: null,
    appTheme: null,
    agencyAssistantEnabled: false,
    agencyAssistantModel: "opus",
    primarySalesPageUrl: null,
  });
  // Starts true and stays true until auth resolves — `agencyId` reads
  // `null` both before auth has resolved AND when there's genuinely no
  // agency, and those two cases must not be conflated. A consumer that
  // snapshots this into local state once loading flips false (the
  // Branding settings form) was doing exactly that: agencyId was still
  // null on the very first render because auth hadn't resolved yet, the
  // old `!!agencyId` initializer read that as "done loading," and the
  // form locked itself onto blank defaults before the real Firestore
  // data ever arrived a moment later.
  const [snapLoading, setSnapLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!agencyId) {
      setSnapLoading(false);
      return;
    }
    setSnapLoading(true);
    const ref = doc(getFirebaseDb(), `agencies/${agencyId}`);
    // 2026-08-30: this listener is mounted via <AppAccent> in the shared
    // dashboard layout — runs on EVERY page, above every route's own
    // error.tsx. An uncaught synchronous throw here (the confirmed
    // firebase-js-sdk#9267 failure mode) previously crashed the WHOLE app
    // shell, not just one page, which is why it could take down routes
    // with nothing to do with Community/Courses. It's also the thing that
    // drives the saved app theme (appTheme).
    //
    // Recurring-regression fix (see safe-subscribe.ts's own doc comment
    // for the full evidence trail): the throw-guard alone never covered
    // this listener's more common failure mode — registering fine and
    // then never delivering a snapshot again, silently leaving appTheme
    // at its initial `null` (default palette) with no error to catch,
    // which is exactly the "saved CRM color theme not rendering" symptom.
    // `safeSubscribeWithTimeout` bounds the wait to 8s and falls back to
    // ONE plain `getDoc()` (a different, non-listener SDK code path) so
    // the real saved theme can still resolve instead of silently reverting.
    function applySnapshotData(d: Partial<AgencyDoc>) {
      setData({
        name: (d.name as string) || CUSTOM_BRAND.name,
        logoUrl: (d.logoUrl as string | null) ?? null,
        supportEmail: (d.supportEmail as string | null) ?? null,
        primaryDomain: (d.primaryDomain as string | null) ?? null,
        appTheme: (d.appTheme as AppTheme | null) ?? null,
        agencyAssistantEnabled: d.agencyAssistantEnabled === true,
        agencyAssistantModel:
          d.agencyAssistantModel === "sonnet" ? "sonnet" : "opus",
        primarySalesPageUrl: (d.primarySalesPageUrl as string | null) ?? null,
      });
    }
    const unsub = safeSubscribeWithTimeout(
      (onSettled) =>
        onSnapshot(
          ref,
          (snap) => {
            onSettled();
            if (snap.exists()) {
              applySnapshotData(snap.data() as Partial<AgencyDoc>);
            }
            setSnapLoading(false);
          },
          () => {
            onSettled();
            setSnapLoading(false);
          }
        ),
      () => {
        getDoc(ref)
          .then((snap) => {
            if (snap.exists())
              applySnapshotData(snap.data() as Partial<AgencyDoc>);
          })
          .catch(() => undefined)
          .finally(() => setSnapLoading(false));
      }
    );
    return () => unsub?.();
  }, [agencyId, authLoading]);

  return { ...data, loading: authLoading || snapLoading };
}
