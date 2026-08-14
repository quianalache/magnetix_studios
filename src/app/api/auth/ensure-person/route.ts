import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensurePersonLinkForStaffUser } from "@/lib/server/person-identity-service";

/**
 * MyMagnetix staff <-> Person bridge (2026-08-14) — mirrors
 * `/api/auth/claim-pending-invites` exactly: a fire-and-forget POST the
 * client calls once per session, right after a staff sign-in resolves
 * (see auth-context.tsx), not on every request. Idempotent — a no-op once
 * `users/{uid}.personId` is already set.
 *
 * Identity only. Does not touch Firebase custom claims, subAccountMembers,
 * agencyMembers, or any Member/Contact record — staff authorization is
 * completely unaffected by this route existing.
 */
export async function POST(request: Request) {
  const uid = request.headers.get("x-user-uid");
  const email = request.headers.get("x-user-email");
  if (!uid || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userSnap = await getAdminDb().doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: "No user record" }, { status: 404 });
  }
  const user = userSnap.data() ?? {};

  const personId = await ensurePersonLinkForStaffUser({
    uid,
    email,
    personId: (user.personId as string | null | undefined) ?? null,
  });

  return NextResponse.json({ ok: true, personId: personId ?? null });
}
