"use client";

import { FlaskConical } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { WatchdogSection } from "@/components/labs/watchdog-section";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { LockedNotice } from "@/components/system/locked-notice";

/**
 * Labs — the gated container for PRE-RELEASE / experimental features.
 *
 * Agency-gated via `labsEnabledByAgency` (off by default; the sidebar entry
 * follows the standard gate + hidden-when-disabled treatment). Each
 * experiment listed here is explicitly pre-release: it may change, move, or
 * be withdrawn, and it keeps its own runtime safeguards on top of the Labs
 * gate (e.g. the Inbox Watchdog also requires the AI Suite gate to spend
 * agency AI credits — see CUSTOM_AGENTS_V1_PLAN.md).
 *
 * Experiments graduate OUT of Labs into the main nav when proven; this page
 * is deliberately a thin shell so adding/removing an experiment is one card.
 */
export default function LabsPage() {
  const { subAccount } = useSubAccount();
  const labsEnabled = subAccount?.labsEnabledByAgency === true;

  const header = (
    <PageHeader
      title="Labs"
      icon={FlaskConical}
      eyebrow="Pre-release"
      description="Early access to features still in development. Everything here is experimental — it may change, move, or be withdrawn as it matures. Proven features graduate into the main menu."
    />
  );

  if (!labsEnabled) {
    return (
      <PageShell width="form">
        {header}
        <LockedNotice title="Labs is locked for this sub-account">
          Your agency controls access to pre-release features — ask your agency owner to enable Labs from the sub-account&apos;s Manage panel.
        </LockedNotice>
      </PageShell>
    );
  }

  return (
    <PageShell width="form">
      {header}
      <section className="space-y-4">
        {/* ── Experiment: Inbox Follow-up Watchdog (LIVE) ────────────────── */}
        <WatchdogSection />

        <p className="text-caption text-muted-foreground">
          Have an idea for an experiment? Tell your agency — Labs is where new
          functionality lands first.
        </p>
      </section>
    </PageShell>
  );
}
