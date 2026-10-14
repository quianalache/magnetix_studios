"use client";

import Link from "next/link";
import { FileText, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useEmailTemplateList } from "@/hooks/use-email-template-list";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { NavCard } from "@/components/system/nav-card";

/**
 * Email home — a lightweight orientation point, not an analytics dashboard.
 * Points at the two things people actually do in Email (send a broadcast,
 * manage templates) plus whether sending is actually ready to go, with a
 * deep link into the canonical Messaging settings for anything that isn't.
 * System Emails has no card here yet — this task doesn't build it, and we
 * don't advertise a feature that doesn't exist.
 */
export default function EmailHomePage() {
  const { subAccount, subAccountId, saPath } = useSubAccount();
  const { templates, loading: templatesLoading } = useEmailTemplateList(
    subAccountId
  );

  const domainStatus = subAccount?.resendConfig?.status ?? null;
  const domainReady = domainStatus === "verified";
  const hasMailingAddress = !!subAccount?.mailingAddress;
  const sendingReady = domainReady && hasMailingAddress;

  return (
    <PageShell width="data">
      <PageHeader
        title="Email"
        description="Send broadcasts and build reusable templates for every email this workspace sends."
      />

      <SendingStatusStrip
        sendingReady={sendingReady}
        domainReady={domainReady}
        hasMailingAddress={hasMailingAddress}
        settingsHref={saPath("/dashboard/settings?section=email-domain")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NavCard
          icon={Send}
          tone="blue"
          title="Broadcasts"
          description="Send a one-time email to your contacts, a tag, or a pipeline stage."
          href={saPath("/broadcasts")}
          actionLabel="Go to Broadcasts"
        />
        <NavCard
          icon={FileText}
          tone="violet"
          title="Email Templates"
          description={
            templatesLoading
              ? "Reusable starting points for broadcasts and workflow emails."
              : `${templates.length} template${templates.length === 1 ? "" : "s"} ready to reuse.`
          }
          href={saPath("/email/templates")}
          actionLabel="Go to Email Templates"
        />
      </div>
    </PageShell>
  );
}

function SendingStatusStrip({
  sendingReady,
  domainReady,
  hasMailingAddress,
  settingsHref,
}: {
  sendingReady: boolean;
  domainReady: boolean;
  hasMailingAddress: boolean;
  settingsHref: string;
}) {
  if (sendingReady) {
    return (
      <Alert tone="success">
        Sending domain verified and mailing address on file — you&apos;re ready to send.
      </Alert>
    );
  }

  const missing = [
    !domainReady && "a verified sending domain",
    !hasMailingAddress && "a mailing address",
  ].filter(Boolean);

  return (
    <Alert tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Missing {missing.join(" and ")} — broadcasts to real contacts can be blocked until this is set up.</span>
        <Button render={<Link href={settingsHref} />} variant="outline" size="sm" className="shrink-0">
          Open Messaging settings
        </Button>
      </div>
    </Alert>
  );
}
