import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  getStripeSubscriptionForSubAccount,
  listStripeSubscriptionsForCustomer,
  listStripeSubscriptionsForSubAccount,
  StripeDiscoveryError,
} from "@/lib/stripe/discovery";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof StripeDiscoveryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { error: "Stripe subscription discovery failed." },
    { status: 502 }
  );
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get("subscriptionId")?.trim();
  const customerId = url.searchParams.get("customerId")?.trim();
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  try {
    if (subscriptionId) {
      return NextResponse.json({
        subscription: await getStripeSubscriptionForSubAccount(
          subAccountId,
          subscriptionId
        ),
      });
    }
    const input = {
      subAccountId,
      limit,
      startingAfter: url.searchParams.get("startingAfter"),
    };
    return NextResponse.json(
      customerId
        ? await listStripeSubscriptionsForCustomer({
            ...input,
            externalCustomerId: customerId,
          })
        : await listStripeSubscriptionsForSubAccount(input)
    );
  } catch (error) {
    return errorResponse(error);
  }
}
