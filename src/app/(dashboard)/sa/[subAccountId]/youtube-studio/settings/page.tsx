"use client";

import { ArrowRight, BrainCircuit } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";

/**
 * YTCS Settings — Phase 1 only provides the required Business Brain
 * entry/link (migration spec: "YTCS may provide a Business Brain entry/
 * link indicating that shared Business Brain powers the module"). Default
 * Script Settings and Data Management (migration spec §16) are a later
 * phase — not built here.
 */
export default function YtcsSettingsPage() {
  const { saPath } = useSubAccount();

  return (
    <div className="space-y-4">
      <a
        href={saPath("/dashboard/settings")}
        className="flex items-center gap-3 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Business Brain</h3>
          <p className="text-sm text-muted-foreground">
            Shared context powering your YouTube strategy — Creator Vision, Audience,
            Offers, Frameworks, Stories + Proof, Brand Voice, Topics + Subtopics, and
            Positioning. Edited in one place, used everywhere.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>

      <p className="text-sm text-muted-foreground">
        Default script settings and data export are coming in a later phase.
      </p>
    </div>
  );
}
