import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  getStripeCustomerForSubAccount,
  listStripeCustomersForSubAccount,
  matchStripeCustomerToContacts,
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
    { error: "Stripe customer discovery failed." },
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
  const customerId = url.searchParams.get("customerId")?.trim();
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  try {
    if (customerId) {
      const customer = await getStripeCustomerForSubAccount(
        subAccountId,
        customerId
      );
      return NextResponse.json({
        customer,
        crmMatch: await matchStripeCustomerToContacts({
          subAccountId,
          email: customer.email,
        }),
      });
    }
    const page = await listStripeCustomersForSubAccount({
      subAccountId,
      limit,
      startingAfter: url.searchParams.get("startingAfter"),
      email: url.searchParams.get("email"),
    });
    const items = await Promise.all(
      page.items.map(async (customer) => ({
        ...customer,
        crmMatch: await matchStripeCustomerToContacts({
          subAccountId,
          email: customer.email,
        }),
      }))
    );
    return NextResponse.json({ ...page, items });
  } catch (error) {
    return errorResponse(error);
  }
}
