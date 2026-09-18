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
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

function callbackLog(event: string, fields: Record<string, unknown> = {}) {
  console.info("[stripe-connect/callback]", JSON.stringify({ event, ...fields }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  callbackLog("received", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    error: declined ?? null,
    hasErrorDescription: Boolean(errorDescription),
  });

  if (!state) {
    callbackLog("state_failed", { reason: "missing_state" });
    return NextResponse.redirect(
      new URL(
        "/agency/sub-accounts?stripeconnect=error&reason=state_missing",
        appBase(request)
      )
    );
  }
  const verified = verifyStripeConnectState(state);
  if (!verified) {
    callbackLog("state_failed", { reason: "invalid_state" });
    return NextResponse.redirect(
      new URL(
        "/agency/sub-accounts?stripeconnect=error&reason=state_invalid",
        appBase(request)
      )
    );
  }
  const { subAccountId: id, uid: connectingUid, environment } = verified;
  callbackLog("state_verified", {
    environment,
    subAccountId: id,
    hasConnectingUid: Boolean(connectingUid),
  });

  // Do not depend on the CRM browser session surviving Stripe's top-level
  // cross-site redirect. The state is HMAC-signed with the initiating uid;
  // turn that authenticated identity into the same server-side tenancy check
  // used by the rest of the app. This still rejects inactive users,
  // non-members, and non-admins without trusting any client-supplied field.
  const callbackRequest = new Request(request.url, {
    headers: {
      "x-user-uid": connectingUid,
    },
  });
  const access = await requireSubAccountAdmin(callbackRequest, id);
  if (access instanceof NextResponse) {
    callbackLog("auth_failed", { environment, subAccountId: id });
    return NextResponse.redirect(
      new URL(
        "/agency/sub-accounts?stripeconnect=error&reason=auth_failed",
        appBase(request)
      )
    );
  }

  // Same session that started the flow must be the one completing it.
  if (access.uid !== connectingUid) {
    callbackLog("auth_failed", { environment, subAccountId: id, reason: "uid_mismatch" });
    return NextResponse.redirect(
      new URL(
        "/agency/sub-accounts?stripeconnect=error&reason=uid_mismatch",
        appBase(request)
      )
    );
  }

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = (status: string, reason?: string) => {
    settingsUrl.searchParams.set("stripeconnect", status);
    if (reason) settingsUrl.searchParams.set("reason", reason);
    callbackLog("redirect", {
      status,
      reason: reason ?? null,
      environment,
      subAccountId: id,
    });
    return NextResponse.redirect(settingsUrl);
  };

  if (declined || !code) {
    return finish("cancelled", declined ? "stripe_declined" : "missing_code");
  }
  if (!stripeConnectAppConfigured(environment)) {
    callbackLog("configuration_failed", { environment, subAccountId: id });
    return finish("error", "client_not_configured");
  }

  try {
    callbackLog("exchange_started", { environment, subAccountId: id });
    let linked: Awaited<ReturnType<typeof exchangeStripeConnectCode>>;
    try {
      linked = await exchangeStripeConnectCode(code, environment);
    } catch (err) {
      callbackLog("exchange_failed", {
        environment,
        subAccountId: id,
        errorType: err instanceof Error ? err.name : "unknown",
        errorMessage: safeErrorMessage(err),
      });
      return finish("error", "exchange_failed");
    }
    callbackLog("exchange_succeeded", {
      environment,
      subAccountId: id,
      accountId: linked.accountId,
      chargesEnabled: linked.chargesEnabled,
      payoutsEnabled: linked.payoutsEnabled,
    });
    const connection: StripeConnectAccount = {
      accountId: linked.accountId,
      email: linked.email,
      chargesEnabled: linked.chargesEnabled,
      payoutsEnabled: linked.payoutsEnabled,
      connectedAt: FieldValue.serverTimestamp(),
    };
    try {
      await getAdminDb()
        .doc(`subAccounts/${id}`)
        .set(
          {
            [`stripeConnect.${environment}`]: connection,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (err) {
      callbackLog("firestore_write_failed", {
        environment,
        subAccountId: id,
        accountId: linked.accountId,
        errorType: err instanceof Error ? err.name : "unknown",
        errorMessage: safeErrorMessage(err),
      });
      return finish("error", "firestore_write_failed");
    }
    callbackLog("firestore_write_succeeded", {
      environment,
      subAccountId: id,
      accountId: linked.accountId,
    });
    return finish("connected");
  } catch (err) {
    callbackLog("failed", {
      environment,
      subAccountId: id,
      errorType: err instanceof Error ? err.name : "unknown",
      errorMessage: safeErrorMessage(err),
    });
    return finish("error", "exchange_or_write_failed");
  }
}
