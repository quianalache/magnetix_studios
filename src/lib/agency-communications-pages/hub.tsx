"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Mail, FileText, Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
 *
 * Parity pass: like the sub-account Email home it shows whether sending is
 * ready and how many templates exist. Agency sends go out through THIS
 * deployment's own email provider (RESEND_API_KEY + EMAIL_FROM — the
 * platform sender, not a sub-account domain) and fan out through QStash;
 * the send route refuses (503) without either, so the hub says so up front.
 */
type Readiness = { emailConfigured: boolean; queueConfigured: boolean };

export default function AgencyCommunicationsHubPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [templateCount, setTemplateCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/agency/deployment-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Partial<Readiness> | null) =>
        setReadiness({ emailConfigured: d?.emailConfigured === true, queueConfigured: d?.queueConfigured === true }),
      )
      .catch(() => setReadiness(null));
    fetch("/api/agency/email-templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates?: unknown[] } | null) => setTemplateCount(d?.templates?.length ?? null))
      .catch(() => setTemplateCount(null));
  }, [isOwner]);

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

      {readiness === null ? (
        <Skeleton className="h-12 rounded-xl" aria-label="Checking sending setup" />
      ) : readiness.emailConfigured && readiness.queueConfigured ? (
        <Alert tone="success">
          Email sending is configured on this deployment — broadcasts go out from your own email provider as Magnetix Studios.
        </Alert>
      ) : (
        <Alert tone="warning" title="Sending isn’t ready yet">
          Missing{" "}
          {[!readiness.emailConfigured && "an email provider (RESEND_API_KEY + EMAIL_FROM)", !readiness.queueConfigured && "the send queue (QStash)"]
            .filter(Boolean)
            .join(" and ")}
          . You can still build drafts and templates; sending stays blocked until this deployment&apos;s setup is complete.
        </Alert>
      )}

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
          description={
            templateCount === null
              ? "Reusable Magnetix-branded templates for announcements."
              : `${templateCount} template${templateCount === 1 ? "" : "s"} ready to reuse.`
          }
          actionLabel="Go to Email Templates"
        />
      </div>
    </PageShell>
  );
}
