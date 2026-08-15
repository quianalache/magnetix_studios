import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ensurePersonLinkForStaffUser,
  personHasMemberRelationships,
} from "@/lib/server/person-identity-service";
import { signPersonSessionToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

/**
 * "Switch to MyMagnetix" from inside the CRM, for an already-authenticated
 * staff user. NOT a new login: this route requires a valid Firebase staff
 * session (middleware sets x-user-uid/x-user-email; the route 401s without
 * them, same guard as /api/auth/ensure-person). It mints a MyMagnetix
 * session token for the SAME already-proven identity (the staff account's
 * linked personId) — never issued from an unauthenticated request, never
 * granting any NEW access. This is the one safe direction for staff<->
 * person SSO: Firebase already proved "you are this uid/email," and
 * ensurePersonLinkForStaffUser resolves that to the SAME personId a Member
 * relationship with the same email would also resolve to. The reverse
 * direction (a MyMagnetix session bootstrapping a Firebase session) does
 * NOT exist anywhere in this codebase — that would merge the two auth
 * systems, which is explicitly out of scope.
 *
 * Refuses (404, not an error state) if this person has no Member
 * relationship anywhere — MyMagnetix would have nothing to show them, so
 * no session is minted and no "Switch" control should even be rendered for
 * them (the Home shell only shows the control when it already knows this
 * is true — this route re-verifies rather than trusting the client).
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
  if (!personId) {
    return NextResponse.json({ error: "Could not resolve identity" }, { status: 500 });
  }

  const hasMemberAccess = await personHasMemberRelationships(personId);
  if (!hasMemberAccess) {
    return NextResponse.json(
      { error: "No MyMagnetix relationships found for this account yet." },
      { status: 404 },
    );
  }

  const sessionToken = signPersonSessionToken(personId, email);
  await setPersonSessionCookie(sessionToken);
  return NextResponse.json({ ok: true, redirectTo: "/my" });
}
