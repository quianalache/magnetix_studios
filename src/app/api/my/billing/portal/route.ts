import "server-only";

import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  createPersonBillingPortalSession,
  MyMagnetixPortalError,
} from "@/lib/server/mymagnetix-billing-portal-service";
import { getAuthEmailOrigin } from "@/lib/server/app-origin";

export async function POST(request: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json(
      { error: "Please sign in to manage subscriptions." },
      { status: 401 }
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
      personId: person.id,
      subscriptionId: body.subscriptionId,
      // Cross-identity/Stripe-return-URL fix (2026-09-16): this used to
      // trust NEXT_PUBLIC_APP_URL directly — the same env var behind the
      // trycloudflare.com incident (app-origin.ts's own doc comment). A
      // Stripe Billing Portal "return to" link is production-sensitive in
      // exactly the same way an emailed auth link is: it's generated once,
      // server-side, and handed to a real human days/weeks before they
      // might click it. Reuses the same canonical helper rather than
      // duplicating origin-resolution logic.
      returnUrl: `${getAuthEmailOrigin()}/my/purchases`,
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
