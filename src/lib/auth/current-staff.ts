import "server-only";

import { headers } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";

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
