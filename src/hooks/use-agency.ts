"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AgencyDoc, AppTheme } from "@/types";

interface AgencySummary {
  /** Agency display name. Falls back to "LeadStack" until hydrated. */
  name: string;
  /** Optional logo URL — when set, sidebar swaps the LeadStack chevron mark for this. */
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
    name: "LeadStack",
    logoUrl: null,
    supportEmail: null,
    primaryDomain: null,
    appTheme: null,
    agencyAssistantEnabled: false,
    agencyAssistantModel: "opus",
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
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as Partial<AgencyDoc>;
          setData({
            name: (d.name as string) || "LeadStack",
            logoUrl: (d.logoUrl as string | null) ?? null,
            supportEmail: (d.supportEmail as string | null) ?? null,
            primaryDomain: (d.primaryDomain as string | null) ?? null,
            appTheme: (d.appTheme as AppTheme | null) ?? null,
            agencyAssistantEnabled: d.agencyAssistantEnabled === true,
            agencyAssistantModel:
              d.agencyAssistantModel === "sonnet" ? "sonnet" : "opus",
          });
        }
        setSnapLoading(false);
      },
      () => setSnapLoading(false),
    );
    return () => unsub();
  }, [agencyId, authLoading]);

  return { ...data, loading: authLoading || snapLoading };
}
