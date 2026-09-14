import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  backfillStripePaymentsForExternalSubscription,
  ExternalPaymentBackfillError,
} from "@/lib/server/external-payment-backfill-service";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; subscriptionId: string }> }
) {
  const { id: subAccountId, subscriptionId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    const summary = await backfillStripePaymentsForExternalSubscription({
      subAccountId,
      externalSubscriptionRecordId: subscriptionId,
    });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof ExternalPaymentBackfillError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Stripe payment history backfill failed." },
      { status: 502 }
    );
  }
}
