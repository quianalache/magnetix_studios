import "server-only";

import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  PERSON_SESSION_COOKIE,
  PERSON_SESSION_MAX_AGE_SECONDS,
  verifyPersonSessionToken,
} from "@/lib/server/person-auth";
import { getAdminDb } from "@/lib/firebase/admin";

export interface CurrentPerson {
  id: string;
  primaryEmail: string;
}

/**
 * Reads the `mm_session` cookie, verifies it, and loads the current person
 * doc. Returns null when missing/invalid/expired or the person doc no
 * longer exists. Deliberate sibling of `getCurrentMember` — same shape of
 * contract, different (global, not sub-account-scoped) cookie and secret
 * domain (see person-auth.ts).
 *
 * IMPORTANT boundary: this answers ONLY "who is this human." It carries no
 * entitlement information. Every tenant-scoped read that follows a
 * `getCurrentPerson()` call must independently verify a real
 * `Member.personId === person.id` relationship before returning any
 * business data — see mymagnetix-service.ts.
 */
export async function getCurrentPerson(): Promise<CurrentPerson | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PERSON_SESSION_COOKIE)?.value;
  if (!token) return null;

  const verified = verifyPersonSessionToken(token);
  if (!verified) return null;

  const snap = await getAdminDb().doc(`people/${verified.personId}`).get();
  if (!snap.exists) return null;

  return { id: snap.id, primaryEmail: (snap.data()?.primaryEmail as string) ?? verified.email };
}

export async function setPersonSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PERSON_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PERSON_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearPersonSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PERSON_SESSION_COOKIE);
}

/** Best-effort last-active stamp, mirrors getCurrentMember's own pattern. */
export async function touchPersonLastSeen(personId: string): Promise<void> {
  await getAdminDb()
    .doc(`people/${personId}`)
    .set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true })
    .catch(() => {});
}
