"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useResilientFeatureGate } from "@/hooks/use-resilient-feature-gate";
import { AiSuiteChat } from "@/components/ai-suite/ai-suite-chat";
import { AiSuiteScopeBanner } from "@/components/ai-suite/ai-suite-scope-banner";
import { AiSuiteUsageCard } from "@/components/ai-suite/ai-suite-usage-card";

/**
 * Workspace Assistant (sub-account) — an in-app assistant that answers "how
 * do I use X" questions and performs a few confirm-first actions, all scoped
 * to this one client workspace.
 *
 * Gate read via `useResilientFeatureGate` (same pattern Community/Courses/
 * Social Planner/Labs use — see that hook's own doc comment). Added
 * 2026-08-31 (SaaS QA pass): this page previously had no page-level gate
 * check at all — only the underlying chat/confirm/usage API routes 403'd
 * while off — so a direct URL visit rendered the full assistant regardless
 * of entitlement. Server-side enforcement is unchanged; this only adds the
 * matching visual gate.
 */
export default function SubAccountAiSuitePage() {
  const { subAccountId, subAccount } = useSubAccount();
  const gate = useResilientFeatureGate({
    field: "aiSuiteEnabledByAgency",
    fallbackKey: "aiSuiteEnabled",
  });
  // The scope banner shows on the empty landing state, then hides once the
  // conversation starts (and returns on New chat) to give the thread room.
  const [chatActive, setChatActive] = useState(false);

  if (!gate.known) {
    return (
      <div className="mx-auto flex w-full max-w-3xl justify-center py-16">
        {gate.timedOut ? (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Couldn&apos;t confirm Workspace Assistant&apos;s status. Try
            refreshing the page.
          </p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (!gate.enabled) {
    return (
      <div className="momentum-scope mx-auto w-full max-w-3xl rounded-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Workspace Assistant is locked</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your agency administrator hasn&apos;t enabled Workspace Assistant
            for this sub-account yet. Ask them to switch it on from Manage in
            the agency sub-accounts list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="momentum-scope mx-auto flex h-full max-w-3xl flex-col gap-4 rounded-2xl">
      {!chatActive && (
        <AiSuiteScopeBanner
          level="sub-account"
          subAccountName={subAccount?.name}
        />
      )}
      <AiSuiteUsageCard level="sub-account" subAccountId={subAccountId} />

      <div className="min-h-0 flex-1">
        <AiSuiteChat
          level="sub-account"
          subAccountId={subAccountId}
          onActiveChange={setChatActive}
        />
      </div>
    </div>
  );
}
