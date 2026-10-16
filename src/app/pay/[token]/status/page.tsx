import type { Metadata } from "next";
import { CheckCircle2, Clock, Link2Off, RotateCcw } from "lucide-react";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyCheckoutToken } from "@/lib/billing/token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment status" };

/**
 * Post-checkout landing for the public /pay flow (Client Billing v1) —
 * Stripe's success_url and cancel_url both point here. Server-rendered
 * with the Admin SDK so the buyer sees the LIVE billing status: if the
 * webhook already flipped the workspace active, they're told to log in;
 * if not (webhook lag or a cancelled checkout), they get a retry link.
 *
 * Public route (under /pay in middleware PUBLIC_PATHS) — the HMAC token in
 * the URL is the credential, same as /pay/[token] itself.
 */

export default async function PayStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; cancelled?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const verified = verifyCheckoutToken(token);
  let workspaceName: string | null = null;
  let planName: string | null = null;
  let active = false;
  let found = false;

  if (verified) {
    const snap = await getAdminDb()
      .doc(`subAccounts/${verified.subAccountId}`)
      .get();
    if (snap.exists) {
      found = true;
      const data = snap.data() ?? {};
      workspaceName = (data.name as string | undefined) ?? null;
      const billing = data.billing as
        | { status?: string; planName?: string | null }
        | undefined;
      planName = billing?.planName ?? null;
      active = billing?.status === "active";
    }
  }

  const cancelled = query.cancelled === "1" && !active;
  const variant = { kind: "magnetix" } as const;

  // A link that doesn't verify (or no longer points at a workspace) never
  // claims a payment happened (2026-10-16 audit: it used to say
  // "Payment received").
  if (!found) {
    return (
      <PublicStateShell
        variant={variant}
        icon={Link2Off}
        tone="warning"
        title="This payment link isn't valid"
        description="Check that you opened the whole link from your email. If it still doesn't work, ask for a new payment link."
        action={<PublicAction href="/login">Log in</PublicAction>}
      />
    );
  }
  if (active) {
    return (
      <PublicStateShell
        variant={variant}
        icon={CheckCircle2}
        tone="success"
        title={workspaceName ? `${workspaceName} is active` : "Subscription active"}
        description={`${planName ? `Your ${planName} subscription is live. ` : ""}You're all set — log in to your workspace to get started.`}
        action={<PublicAction href="/login">Log in</PublicAction>}
      />
    );
  }
  if (cancelled) {
    return (
      <PublicStateShell
        variant={variant}
        icon={RotateCcw}
        tone="brand"
        title="Checkout not completed"
        description="No charge was made. You can pick up where you left off whenever you're ready."
        action={<PublicAction href={`/pay/${token}`}>Retry payment</PublicAction>}
      />
    );
  }
  return (
    <PublicStateShell
      variant={variant}
      icon={Clock}
      tone="brand"
      title="Payment received"
      description="We're activating your workspace — this usually takes a few seconds. Refresh this page, or log in and you'll be up and running shortly."
      action={<PublicAction href="/login">Log in</PublicAction>}
    />
  );
}
