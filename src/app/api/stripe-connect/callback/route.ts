import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  exchangeStripeConnectCode,
  stripeConnectAppConfigured,
  verifyStripeConnectState,
} from "@/lib/stripe/connect";
import type { StripeConnectAccount } from "@/types";

/**
 * Single shared OAuth callback for Stripe Connect — same reasoning as the
 * Google Calendar / Meta callbacks: ONE redirect URI registered with the
 * Connect application for the whole deployment (Stripe validates it with
 * an exact match), so the connecting sub-account + admin travel in the
 * HMAC-signed `state` instead. Re-checks the caller's own session matches
 * the uid that started the flow.
 *
 *   GET /api/stripe-connect/callback?code=…&state=…
 */

function appBase(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error");

  if (!state) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?stripeconnect=bad_state", appBase(request)),
    );
  }
  const verified = verifyStripeConnectState(state);
  if (!verified) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?stripeconnect=bad_state", appBase(request)),
    );
  }
  const { subAccountId: id, uid: connectingUid } = verified;

  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  // Same session that started the flow must be the one completing it.
  if (access.uid !== connectingUid) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?stripeconnect=bad_state", appBase(request)),
    );
  }

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = (status: string) => {
    settingsUrl.searchParams.set("stripeconnect", status);
    return NextResponse.redirect(settingsUrl);
  };

  if (declined || !code) {
    return finish("cancelled");
  }
  if (!stripeConnectAppConfigured()) {
    return finish("not_configured");
  }

  try {
    const linked = await exchangeStripeConnectCode(code);
    const connection: StripeConnectAccount = {
      accountId: linked.accountId,
      email: linked.email,
      chargesEnabled: linked.chargesEnabled,
      payoutsEnabled: linked.payoutsEnabled,
      connectedAt: FieldValue.serverTimestamp(),
    };
    await getAdminDb()
      .doc(`subAccounts/${id}`)
      .set({ stripeConnect: connection, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return finish("connected");
  } catch (err) {
    console.error(`[stripe-connect/callback] connect failed sa=${id}`, err);
    return finish("error");
  }
}
