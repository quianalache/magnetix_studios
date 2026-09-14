import "server-only";

import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  createPersonBillingPortalSession,
  MyMagnetixPortalError,
} from "@/lib/server/mymagnetix-billing-portal-service";

function appOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

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
      returnUrl: `${appOrigin(request)}/my/purchases`,
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
