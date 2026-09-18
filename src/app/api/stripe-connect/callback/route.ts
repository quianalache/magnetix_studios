import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
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

type DiagnosticStage =
  | "callback_received"
  | "query_params_checked"
  | "state_present"
  | "state_verified"
  | "state_invalid"
  | "environment_resolved"
  | "subaccount_resolved"
  | "oauth_exchange_started"
  | "oauth_exchange_succeeded"
  | "oauth_exchange_failed"
  | "stripe_account_received"
  | "stripe_account_validated"
  | "firestore_write_started"
  | "firestore_write_succeeded"
  | "firestore_write_failed"
  | "redirect_started"
  | "redirect_completed_or_selected";

const DIAGNOSTIC_COLLECTION =
  "systemDiagnostics/stripeConnectOAuth/attempts";

/**
 * Best-effort, Admin-SDK-only diagnostics for the next OAuth investigation.
 * This record intentionally excludes codes, tokens, state, cookies, headers,
 * and secrets. A diagnostics failure must never change OAuth behavior.
 */
async function writeDiagnostic(
  attemptId: string,
  stage: DiagnosticStage,
  fields: Record<string, unknown> = {}
): Promise<void> {
  try {
    await getAdminDb()
      .doc(`${DIAGNOSTIC_COLLECTION}/${attemptId}`)
      .set(
        {
          attemptId,
          lastStage: stage,
          stages: { [stage]: FieldValue.serverTimestamp() },
          ...fields,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    console.warn("[stripe-connect/callback] diagnostic write failed", {
      attemptId,
      stage,
      errorType: error instanceof Error ? error.name : "unknown",
      errorMessage: safeErrorMessage(error),
    });
  }
}

export async function GET(request: Request) {
  const diagnosticAttemptId = crypto.randomUUID();
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
  await writeDiagnostic(diagnosticAttemptId, "callback_received", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasError: Boolean(declined),
    hasErrorDescription: Boolean(errorDescription),
  });
  await writeDiagnostic(diagnosticAttemptId, "query_params_checked", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
  });

  if (!state) {
    callbackLog("state_failed", { reason: "missing_state" });
    await writeDiagnostic(diagnosticAttemptId, "state_invalid", {
      failureReason: "missing_state",
    });
    const destination = new URL(
      "/agency/sub-accounts?stripeconnect=error&reason=state_missing",
      appBase(request)
    );
    await writeDiagnostic(diagnosticAttemptId, "redirect_started", {
      redirectDestination: destination.toString(),
    });
    await writeDiagnostic(diagnosticAttemptId, "redirect_completed_or_selected");
    return NextResponse.redirect(destination);
  }
  await writeDiagnostic(diagnosticAttemptId, "state_present");
  const verified = verifyStripeConnectState(state);
  if (!verified) {
    callbackLog("state_failed", { reason: "invalid_state" });
    await writeDiagnostic(diagnosticAttemptId, "state_invalid", {
      failureReason: "invalid_state",
    });
    const destination = new URL(
      "/agency/sub-accounts?stripeconnect=error&reason=state_invalid",
      appBase(request)
    );
    await writeDiagnostic(diagnosticAttemptId, "redirect_started", {
      redirectDestination: destination.toString(),
    });
    await writeDiagnostic(diagnosticAttemptId, "redirect_completed_or_selected");
    return NextResponse.redirect(destination);
  }
  const { subAccountId: id, uid: connectingUid, environment } = verified;
  callbackLog("state_verified", {
    environment,
    subAccountId: id,
    hasConnectingUid: Boolean(connectingUid),
  });
  await writeDiagnostic(diagnosticAttemptId, "state_verified", {
    stateVerified: true,
  });
  await writeDiagnostic(diagnosticAttemptId, "environment_resolved", {
    environment,
  });
  await writeDiagnostic(diagnosticAttemptId, "subaccount_resolved", {
    environment,
    subAccountId: id,
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
    const destination = new URL(
      "/agency/sub-accounts?stripeconnect=error&reason=auth_failed",
      appBase(request)
    );
    await writeDiagnostic(diagnosticAttemptId, "redirect_started", {
      failureReason: "auth_failed",
      redirectDestination: destination.toString(),
    });
    await writeDiagnostic(diagnosticAttemptId, "redirect_completed_or_selected");
    return NextResponse.redirect(destination);
  }

  // Same session that started the flow must be the one completing it.
  if (access.uid !== connectingUid) {
    callbackLog("auth_failed", { environment, subAccountId: id, reason: "uid_mismatch" });
    const destination = new URL(
      "/agency/sub-accounts?stripeconnect=error&reason=uid_mismatch",
      appBase(request)
    );
    await writeDiagnostic(diagnosticAttemptId, "redirect_started", {
      failureReason: "uid_mismatch",
      redirectDestination: destination.toString(),
    });
    await writeDiagnostic(diagnosticAttemptId, "redirect_completed_or_selected");
    return NextResponse.redirect(destination);
  }

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = async (status: string, reason?: string) => {
    settingsUrl.searchParams.set("stripeconnect", status);
    if (reason) settingsUrl.searchParams.set("reason", reason);
    await writeDiagnostic(diagnosticAttemptId, "redirect_started", {
      environment,
      subAccountId: id,
      redirectDestination: settingsUrl.toString(),
      ...(reason ? { failureReason: reason } : {}),
    });
    callbackLog("redirect", {
      status,
      reason: reason ?? null,
      environment,
      subAccountId: id,
    });
    await writeDiagnostic(diagnosticAttemptId, "redirect_completed_or_selected");
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
    await writeDiagnostic(diagnosticAttemptId, "oauth_exchange_started", {
      environment,
      subAccountId: id,
    });
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
      await writeDiagnostic(diagnosticAttemptId, "oauth_exchange_failed", {
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
    await writeDiagnostic(diagnosticAttemptId, "oauth_exchange_succeeded", {
      environment,
      subAccountId: id,
      returnedStripeAccountId: linked.accountId,
    });
    await writeDiagnostic(diagnosticAttemptId, "stripe_account_received", {
      returnedStripeAccountId: linked.accountId,
    });
    await writeDiagnostic(diagnosticAttemptId, "stripe_account_validated", {
      returnedStripeAccountId: linked.accountId,
    });
    const connection: StripeConnectAccount = {
      accountId: linked.accountId,
      email: linked.email,
      chargesEnabled: linked.chargesEnabled,
      payoutsEnabled: linked.payoutsEnabled,
      connectedAt: FieldValue.serverTimestamp(),
    };
    try {
      await writeDiagnostic(diagnosticAttemptId, "firestore_write_started", {
        environment,
        subAccountId: id,
        returnedStripeAccountId: linked.accountId,
      });
      const subAccountRef = getAdminDb().doc(`subAccounts/${id}`);
      // `set(..., { merge: true })` treated the dotted key as a literal
      // top-level field in the Admin SDK. Use explicit FieldPath segments so
      // the connection lands under the canonical stripeConnect map. Delete
      // the malformed literal left by the diagnostic attempt while repairing
      // the same record.
      await subAccountRef.update(
        new FieldPath("stripeConnect", environment),
        connection,
        new FieldPath(`stripeConnect.${environment}`),
        FieldValue.delete(),
        "updatedAt",
        FieldValue.serverTimestamp()
      );
    } catch (err) {
      callbackLog("firestore_write_failed", {
        environment,
        subAccountId: id,
        accountId: linked.accountId,
        errorType: err instanceof Error ? err.name : "unknown",
        errorMessage: safeErrorMessage(err),
      });
      await writeDiagnostic(diagnosticAttemptId, "firestore_write_failed", {
        environment,
        subAccountId: id,
        returnedStripeAccountId: linked.accountId,
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
    await writeDiagnostic(diagnosticAttemptId, "firestore_write_succeeded", {
      environment,
      subAccountId: id,
      returnedStripeAccountId: linked.accountId,
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
