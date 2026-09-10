"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useEmailTemplateList } from "@/hooks/use-email-template-list";
import { Button } from "@/components/ui/button";

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
    <div className="momentum-scope mx-auto w-full max-w-4xl space-y-6 rounded-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email</h1>
        <p className="text-sm text-muted-foreground">
          Send broadcasts and build reusable templates for every email this
          workspace sends.
        </p>
      </div>

      <SendingStatusStrip
        sendingReady={sendingReady}
        domainReady={domainReady}
        hasMailingAddress={hasMailingAddress}
        settingsHref={saPath("/dashboard/settings?tab=messaging")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HomeCard
          icon={<Send className="h-4 w-4" />}
          title="Broadcasts"
          description="Send a one-time email to your contacts, a tag, or a pipeline stage."
          href={saPath("/broadcasts")}
          actionLabel="Go to Broadcasts"
        />
        <HomeCard
          icon={<FileText className="h-4 w-4" />}
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
    </div>
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
      <div className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          Sending domain verified and mailing address on file — you&apos;re
          ready to send.
        </span>
      </div>
    );
  }

  const missing = [
    !domainReady && "a verified sending domain",
    !hasMailingAddress && "a mailing address",
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Missing {missing.join(" and ")} — broadcasts to real contacts can be
          blocked until this is set up.
        </span>
      </div>
      <Button
        render={<Link href={settingsHref} />}
        variant="outline"
        size="sm"
        className="shrink-0"
      >
        Open Messaging settings
      </Button>
    </div>
  );
}

function HomeCard({
  icon,
  title,
  description,
  href,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border bg-card p-5 transition hover:border-primary/50 hover:bg-accent/30"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="text-sm font-medium text-primary">{actionLabel} →</span>
    </Link>
  );
}
