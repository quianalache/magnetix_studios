import "server-only";

import { headers } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export interface CurrentStaffUser {
  uid: string;
  email: string;
}

/**
 * 2026-09-01 login/gateway correction: a non-throwing, read-only check for
 * "does this request carry a valid, active Business Center (__session)
 * identity" — independent of the MyMagnetix Person/mm_session layer
 * entirely. Needed by /gateway so it can correctly show the chooser for
 * ANY authenticated staff identity, including one with zero MyMagnetix
 * relationships (which never gets an mm_session minted at all — see
 * /api/my/bridge-from-staff's own deliberate "nothing to show them, no
 * session minted" behavior).
 *
 * Reuses the exact `x-user-uid`/`x-user-email` headers middleware.ts's
 * `handleValidToken` already sets on every request carrying a verified
 * `__session` (the same headers every API route's `requireAdmin`/
 * `requireActiveMember` already trust) — just read via `headers()`
 * instead of a `Request` object, Next's documented way for a Server
 * Component to see a header middleware rewrote onto the request. An
 * earlier version of this file tried Admin SDK's `verifySessionCookie()`
 * directly against `__session` — confirmed live that this app's
 * `__session` (minted by next-firebase-auth-edge, not
 * `admin.auth().createSessionCookie()`) is NOT in the format that method
 * expects ("Firebase session cookie has no 'kid' claim"), so it always
 * failed closed. This version reuses the SAME verification the
 * middleware itself already did, rather than re-verifying independently.
 */
export async function getCurrentStaffUser(): Promise<CurrentStaffUser | null> {
  const h = await headers();
  const uid = h.get("x-user-uid");
  if (!uid) return null;
  const email = h.get("x-user-email") ?? "";

  const userSnap = await getAdminDb().doc(`users/${uid}`).get();
  if (!userSnap.exists) return null;
  if (userSnap.data()?.status !== "active") return null;

  return { uid, email };
}

/**
 * The signed-in staff member, only if they can access this sub-account
 * (agency owner of its agency, or an active sub-account member) — the
 * Server Component twin of `requireSubAccountMember`. Used by staff-only
 * public-route modes such as the Public Reading Tool's Preview and Test.
 */
export async function getStaffForSubAccount(subAccountId: string): Promise<CurrentStaffUser | null> {
  const staff = await getCurrentStaffUser();
  if (!staff) return null;
  const db = getAdminDb();
  const [subSnap, memberSnap, record] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.doc(`subAccounts/${subAccountId}/subAccountMembers/${staff.uid}`).get(),
    getAdminAuth().getUser(staff.uid).catch(() => null),
  ]);
  if (!subSnap.exists) return null;
  const claims = (record?.customClaims ?? {}) as { agencyRole?: string; agencyId?: string; status?: string };
  if (claims.status && claims.status !== "active") return null;
  if (claims.agencyRole === "owner" && claims.agencyId === subSnap.get("agencyId")) return staff;
  if (memberSnap.exists && memberSnap.get("status") === "active") return staff;
  return null;
}
