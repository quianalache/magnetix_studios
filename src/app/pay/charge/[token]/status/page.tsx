import type { Metadata } from "next";
import { CheckCircle2, Clock, Link2Off, RotateCcw } from "lucide-react";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyChargeToken } from "@/lib/billing/token";
import { formatBillingPrice } from "@/lib/billing/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment status" };

/**
 * Post-checkout landing for one-time charges — Stripe's success_url and
 * cancel_url both point here. Server-rendered with the Admin SDK so the
 * payer sees the LIVE charge status (webhook may lag a few seconds).
 *
 * Public route (under /pay in middleware PUBLIC_PATHS) — the HMAC token in
 * the URL is the credential, same as the /pay/charge entry itself. Note the
 * paid path can't use the token-hash check (paying clears `tokenHash`), so
 * it verifies the signature only and renders read-only status text.
 */

export default async function ChargeStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; cancelled?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const verified = verifyChargeToken(token);
  let description: string | null = null;
  let amountLabel: string | null = null;
  let paid = false;
  let found = false;

  if (verified) {
    const snap = await getAdminDb()
      .doc(`billingCharges/${verified.chargeId}`)
      .get();
    if (snap.exists) {
      found = true;
      const data = snap.data() ?? {};
      description = (data.description as string | undefined) ?? null;
      amountLabel = formatBillingPrice(
        data.amountCents as number | undefined,
        data.currency as string | undefined,
      );
      paid = data.status === "paid";
    }
  }

  const cancelled = query.cancelled === "1" && !paid;
  const variant = { kind: "magnetix" } as const;

  if (!found) {
    return (
      <PublicStateShell
        variant={variant}
        icon={Link2Off}
        tone="warning"
        title="This payment link isn't valid"
        description="Check that you opened the whole link from your email. If it still doesn't work, ask for a new payment link."
      />
    );
  }
  if (paid) {
    return (
      <PublicStateShell
        variant={variant}
        icon={CheckCircle2}
        tone="success"
        title="Payment received"
        description={`${description ? `“${description}”` : "Your payment"}${amountLabel && amountLabel !== "—" ? ` (${amountLabel})` : ""} has been paid in full. A receipt has been sent to the email you used at checkout. You're all done — you can close this page.`}
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
        action={<PublicAction href={`/pay/charge/${token}`}>Retry payment</PublicAction>}
      />
    );
  }
  return (
    <PublicStateShell
      variant={variant}
      icon={Clock}
      tone="brand"
      title="Processing payment…"
      description="Confirming your payment — this usually takes a few seconds. Refresh this page to see the updated status."
    />
  );
}
