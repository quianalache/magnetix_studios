"use client";

import { useAuth } from "@/hooks/use-auth";
import { Mail, FileText, Lock } from "lucide-react";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { NavCard } from "@/components/system/nav-card";
import { EmptyState } from "@/components/system/empty-state";

/**
 * Agency → Communications hub — Magnetix Studios' own Broadcasts + Email
 * Templates, reusing the tenant Broadcast system's block editor/renderer/
 * fan-out (see agency-communications-service.ts). Owner-only, matching
 * every other real Agency control. Belongs to Magnetix Studios, never a
 * sub-account.
 */
export default function AgencyCommunicationsHubPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <PageShell width="data">
        <EmptyState icon={Lock} title="Owner only" description="Communications is managed by the agency owner." />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        title="Communications"
        description="Reach Magnetix customers, Agency Community members, and course/offer buyers — sent as Magnetix Studios."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <NavCard
          href="/agency/communications/broadcasts"
          icon={Mail}
          tone="blue"
          title="Broadcasts"
          description="Compose and send email to a real Agency audience."
          actionLabel="Go to Broadcasts"
        />
        <NavCard
          href="/agency/communications/templates"
          icon={FileText}
          tone="violet"
          title="Email Templates"
          description="Reusable Magnetix-branded templates for announcements."
          actionLabel="Go to Email Templates"
        />
      </div>
    </PageShell>
  );
}
