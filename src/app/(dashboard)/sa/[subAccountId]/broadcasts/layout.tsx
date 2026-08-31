"use client";

import type { ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { useResilientFeatureGate } from "@/hooks/use-resilient-feature-gate";

/**
 * Gates every route under /broadcasts (list, new, detail, edit) behind
 * `broadcastsEnabledByAgency` in one place, so a direct URL visit to any of
 * them can't bypass the visual gate the way it previously could — none of
 * the four page components had a gate check of their own; only the actual
 * send route (`/api/broadcasts/email/send`) enforced the gate server-side.
 *
 * Same resilient-gate pattern Community/Courses/Social Planner/Labs use —
 * see `useResilientFeatureGate`'s own doc comment. Added 2026-08-31 (SaaS QA
 * pass). Server-side enforcement is unchanged; this only adds the matching
 * visual gate in front of it.
 */
export default function BroadcastsLayout({ children }: { children: ReactNode }) {
  const gate = useResilientFeatureGate({
    field: "broadcastsEnabledByAgency",
    fallbackKey: "broadcastsEnabled",
  });

  if (!gate.known) {
    return (
      <div className="mx-auto flex w-full max-w-5xl justify-center py-16">
        {gate.timedOut ? (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Couldn&apos;t confirm Broadcasts&apos; status. Try refreshing the
            page.
          </p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (!gate.enabled) {
    return (
      <div className="momentum-scope mx-auto w-full max-w-5xl rounded-2xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Broadcasts is locked</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your agency administrator hasn&apos;t enabled Broadcasts for this
            sub-account yet. Ask them to switch it on from Manage in the
            agency sub-accounts list.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
