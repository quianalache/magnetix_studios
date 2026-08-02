import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  buildGoogleCalendarOAuthUrl,
  googleCalendarAppConfigured,
  googleCalendarRedirectUri,
  signGoogleCalendarState,
} from "@/lib/google-calendar/client";
import type { SubAccountDoc } from "@/types";

/**
 * Kick off the Google Calendar connect flow for the CURRENT member's own
 * calendar (per-member, not sub-account-wide — see the sync plan).
 *
 *   GET /api/sub-accounts/[id]/google-calendar/connect
 *
 * Any active sub-account member (not admin-only — connecting a personal
 * calendar isn't an admin action). Gated on `googleCalendarSyncEnabledByAgency`
 * and the deployment having Google OAuth credentials configured. On success
 * redirects to Google's consent screen; any guard miss redirects back to
 * Settings with a `?gcal=…` status.
 */

function appBase(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const sa = snap.exists ? (snap.data() as SubAccountDoc) : null;

  if (sa?.googleCalendarSyncEnabledByAgency !== true) {
    settingsUrl.searchParams.set("gcal", "gate_off");
    return NextResponse.redirect(settingsUrl);
  }

  if (!googleCalendarAppConfigured()) {
    settingsUrl.searchParams.set("gcal", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = googleCalendarRedirectUri();
  if (!redirectUri) {
    settingsUrl.searchParams.set("gcal", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signGoogleCalendarState(id, access.uid, nonce);
  return NextResponse.redirect(
    buildGoogleCalendarOAuthUrl({ redirectUri, state }),
  );
}
