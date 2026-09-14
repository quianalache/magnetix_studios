import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { listExternalSubscriptionsForSubAccount } from "@/lib/server/external-billing-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const records = await listExternalSubscriptionsForSubAccount(subAccountId);
  return NextResponse.json({
    subscriptions: records.map((record) => ({
      externalSubscriptionId: record.externalSubscriptionId,
      externalSubscriptionRecordId: record.id,
      externalCustomerId: record.externalCustomerId,
      contactId: record.contactId,
      provider: record.provider,
      providerAccountId: record.providerAccountId,
    })),
  });
}
