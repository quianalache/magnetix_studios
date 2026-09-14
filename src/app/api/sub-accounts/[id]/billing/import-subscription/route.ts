import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  ExternalBillingImportError,
  importStripeSubscriptionForContact,
} from "@/lib/server/external-billing-import-service";
import { StripeDiscoveryError } from "@/lib/stripe/discovery";
import type { ImportStripeSubscriptionRequest } from "@/types/external-billing-import";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ExternalBillingImportError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof StripeDiscoveryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { error: "Stripe subscription import failed." },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: ImportStripeSubscriptionRequest;
  try {
    body = (await request.json()) as ImportStripeSubscriptionRequest;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const result = await importStripeSubscriptionForContact({
      subAccountId,
      importedByUid: access.uid,
      request: body,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
