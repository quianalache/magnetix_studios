import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { personHasMemberRelationships } from "@/lib/server/person-identity-service";

export const dynamic = "force-dynamic";

/**
 * Read-only check the CRM header uses to decide whether to render the
 * "Switch to MyMagnetix" control at all — a staff user with no Member
 * relationships anywhere shouldn't see a dead-end link. Requires a valid
 * Firebase staff session (same x-user-uid/x-user-email header guard as
 * /api/auth/ensure-person). Grants nothing; read-only.
 */
export async function GET(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) return NextResponse.json({ hasMemberAccess: false });

  const userSnap = await getAdminDb().doc(`users/${uid}`).get();
  const personId = userSnap.data()?.personId as string | undefined;
  if (!personId) return NextResponse.json({ hasMemberAccess: false });

  const hasMemberAccess = await personHasMemberRelationships(personId);
  return NextResponse.json({ hasMemberAccess });
}
