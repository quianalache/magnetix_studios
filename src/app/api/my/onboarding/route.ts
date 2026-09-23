import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listPersonMemberships } from "@/lib/server/mymagnetix-service";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["completed", "dismissed"] as const);
type OnboardingStatus = "completed" | "dismissed";

async function requireMemberPerson() {
  const person = await getCurrentPerson();
  if (!person) return null;
  // MyMagnetix uses a global Person session, but this feature is for real
  // Member accounts only. The relationship lookup is the entitlement check;
  // no client-supplied Member id, email, or staff identity is trusted here.
  const memberships = await listPersonMemberships(person.id);
  return memberships.length > 0 ? person : null;
}

export async function GET() {
  const person = await requireMemberPerson();
  if (!person) return NextResponse.json({ error: "Sign in as a MyMagnetix Member first." }, { status: 401 });

  const snap = await getAdminDb().doc(`people/${person.id}`).get();
  const status = snap.data()?.myMagnetixOnboardingStatus;
  return NextResponse.json({ status: ALLOWED.has(status) ? status : null });
}

export async function POST(request: Request) {
  const person = await requireMemberPerson();
  if (!person) return NextResponse.json({ error: "Sign in as a MyMagnetix Member first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const status = (body as { status?: unknown } | null)?.status;
  if (typeof status !== "string" || !ALLOWED.has(status as OnboardingStatus)) {
    return NextResponse.json({ error: "Status must be completed or dismissed." }, { status: 400 });
  }

  // Exact additive patch: no arbitrary Member/person fields can be written.
  await getAdminDb().doc(`people/${person.id}`).set(
    {
      myMagnetixOnboardingStatus: status,
      myMagnetixOnboardingUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return NextResponse.json({ status });
}
