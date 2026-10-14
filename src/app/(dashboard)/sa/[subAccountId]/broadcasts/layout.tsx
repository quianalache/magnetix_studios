"use client";

import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { LockedNotice } from "@/components/system/locked-notice";
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
    return gate.timedOut ? (
      <PageShell width="data">
        <PageHeader title="Broadcasts" icon={Mail} />
        <p className="text-body-sm text-muted-foreground">
          Couldn&apos;t confirm Broadcasts&apos; status. Try refreshing the page.
        </p>
      </PageShell>
    ) : (
      <PageShellLoading width="data" />
    );
  }

  if (!gate.enabled) {
    return (
      <PageShell width="data">
        <PageHeader title="Broadcasts" icon={Mail} />
        <LockedNotice title="Broadcasts is locked">
          Your agency administrator hasn&apos;t enabled Broadcasts for this sub-account yet. Ask them to switch it on from
          Manage in the agency sub-accounts list.
        </LockedNotice>
      </PageShell>
    );
  }

  return <>{children}</>;
}
