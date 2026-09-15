import "server-only";

import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  createPersonBillingPortalSession,
  MyMagnetixPortalError,
} from "@/lib/server/mymagnetix-billing-portal-service";
import { getAuthEmailOrigin } from "@/lib/server/app-origin";

/**
 * Space Billing's own "Manage subscription" endpoint (2026-09-16) — a
 * Member-authenticated sibling of /api/my/billing/portal, not a merge of
 * the two identity systems. A Portal visitor is authenticated via
 * ls_member_session (Member), never mm_session (Person) — the MyMagnetix
 * route's getCurrentPerson() check would 401 for them even though they
 * genuinely own the subscription. Ownership is proven the exact same way
 * either route proves it (subscriptionBelongsToMembership against a real
 * membership) — here, a single membership built straight from the
 * current, already-verified Member session, scoped to just this one
 * sub-account (never the buyer's OTHER businesses, if any — Space Billing
 * must never aggregate across tenants).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string }> }
) {
  const { saId } = await ctx.params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json(
      { error: "Please sign in to manage your subscription." },
      { status: 401 }
    );
  }
  if (!member.contactId) {
    return NextResponse.json(
      { error: "Your account isn't fully set up yet — contact us for help." },
      { status: 409 }
    );
  }

  let body: { subscriptionId?: unknown };
  try {
    body = (await request.json()) as { subscriptionId?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  if (typeof body.subscriptionId !== "string" || !body.subscriptionId.trim()) {
    return NextResponse.json(
      { error: "Subscription not found." },
      { status: 400 }
    );
  }

  try {
    const url = await createPersonBillingPortalSession({
      ownerMemberships: [
        {
          subAccountId: saId,
          memberId: member.id,
          contactId: member.contactId,
          email: member.email,
          displayName: member.displayName,
        },
      ],
      subscriptionId: body.subscriptionId,
      returnUrl: `${getAuthEmailOrigin()}/portal/${saId}/billing`,
    });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof MyMagnetixPortalError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        error:
          "Subscription management is temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
