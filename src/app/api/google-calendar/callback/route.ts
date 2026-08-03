import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { publishCallback } from "@/lib/automations/qstash";
import {
  SCOPE,
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  googleCalendarAppConfigured,
  googleCalendarRedirectUri,
  verifyGoogleCalendarState,
} from "@/lib/google-calendar/client";
import type { SubAccountDoc } from "@/types";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * Single shared OAuth callback for the Google Calendar connect flow.
 *
 *   GET /api/google-calendar/callback?code=…&state=…
 *
 * ONE redirect URI is registered with the Google OAuth app for the whole
 * deployment (same reasoning as the Meta callback: exact-match redirect_uri
 * requirement). The connecting sub-account + member travel in the
 * HMAC-signed `state`. Re-checks the caller's own session matches the uid
 * that started the flow — a callback redeemed by a different logged-in
 * session than the one that clicked Connect is rejected.
 */

function appBase(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

function connectionId(subAccountId: string, uid: string): string {
  return `${subAccountId}_${uid}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error");

  if (!state) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?gcal=bad_state", appBase(request)),
    );
  }
  const verified = verifyGoogleCalendarState(state);
  if (!verified) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?gcal=bad_state", appBase(request)),
    );
  }
  const { subAccountId: id, uid: connectingUid } = verified;

  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  // The browser completing this OAuth round trip must be the same session
  // that started it — otherwise a different logged-in member could redeem
  // someone else's authorize click and connect a calendar under their uid.
  if (access.uid !== connectingUid) {
    return NextResponse.redirect(
      new URL("/agency/sub-accounts?gcal=bad_state", appBase(request)),
    );
  }

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = (status: string) => {
    settingsUrl.searchParams.set("gcal", status);
    return NextResponse.redirect(settingsUrl);
  };

  if (declined || !code) {
    return finish("cancelled");
  }

  if (!googleCalendarAppConfigured()) {
    return finish("not_configured");
  }

  const redirectUri = googleCalendarRedirectUri();
  if (!redirectUri) {
    return finish("not_configured");
  }

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  const sa = snap.exists ? (snap.data() as SubAccountDoc) : null;
  if (sa?.googleCalendarSyncEnabledByAgency !== true) {
    return finish("gate_off");
  }

  const connRef = db.doc(`googleCalendarConnections/${connectionId(id, access.uid)}`);

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Google only reliably reissues a refresh token when `prompt=consent`
    // is set (already is) — but keep a fallback: if this is a reconnect and
    // Google still withheld one, keep the previously stored refresh token
    // rather than breaking sync.
    let refreshToken = tokens.refreshToken;
    if (!refreshToken) {
      const existing = await connRef.get();
      const prev = existing.exists
        ? (existing.data() as GoogleCalendarConnection)
        : null;
      refreshToken = prev?.refreshToken ?? null;
    }
    if (!refreshToken) {
      return finish("no_refresh_token");
    }

    const email = await fetchGoogleAccountEmail(tokens.accessToken);

    const connection: GoogleCalendarConnection = {
      subAccountId: id,
      agencyId: access.agencyId ?? sa?.agencyId ?? "",
      uid: access.uid,
      googleAccountEmail: email ?? "",
      accessToken: tokens.accessToken,
      refreshToken,
      expiresAt: Timestamp.fromMillis(Date.now() + tokens.expiresInSec * 1000),
      scope: SCOPE,
      syncToken: null,
      connectedAt: FieldValue.serverTimestamp(),
      lastSyncedAt: null,
    };
    await connRef.set(connection, { merge: true });

    // Best-effort immediate sync so the newly-connected member sees their
    // events right away instead of waiting for the next 15-minute tick.
    void publishCallback({
      pathname: "/api/cron/google-calendar-sync",
      body: {},
      delaySeconds: 0,
      deduplicationId: `gcalsync_initial_${id}_${access.uid}_${Date.now()}`,
    });

    return finish("connected");
  } catch (err) {
    console.error(`[google-calendar/callback] connect failed sa=${id}`, err);
    return finish("error");
  }
}
