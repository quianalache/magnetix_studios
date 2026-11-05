import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  getCommunityNotificationSettings,
  getMemberCommunityPrefs,
  saveMemberCommunityPrefs,
} from "@/lib/server/community-notification-prefs";
import { effectiveDelivery, memberWantsDigest } from "@/lib/community/membership-access";

export const dynamic = "force-dynamic";

/**
 * A person's own notification overrides for ONE community they actively
 * belong to (MyMagnetix → Settings → community). The community must hold a
 * Member linked to this person with an active membership.
 */
async function authorize(request: Request) {
  const person = await getCurrentPerson();
  if (!person) return { error: NextResponse.json({ error: "Sign in first" }, { status: 401 }) };
  const url = new URL(request.url);
  const sa = url.searchParams.get("subAccountId") ?? "";
  const g = url.searchParams.get("groupId") ?? "";
  if (!sa || !g) return { error: NextResponse.json({ error: "Missing community" }, { status: 400 }) };
  const db = getAdminDb();
  const members = await db.collection(`subAccounts/${sa}/members`).where("personId", "==", person.id).limit(5).get();
  for (const m of members.docs) {
    const ms = await db.doc(`subAccounts/${sa}/communityGroups/${g}/memberships/${m.id}`).get();
    if (ms.exists && ms.data()!.status === "active") return { person, sa, g };
  }
  return { error: NextResponse.json({ error: "Community not found" }, { status: 404 }) };
}

async function view(personId: string, sa: string, g: string) {
  const [settings, prefs] = await Promise.all([getCommunityNotificationSettings(sa, g), getMemberCommunityPrefs(personId, sa, g)]);
  return {
    digestFrequency: settings.digest.frequency,
    digest: memberWantsDigest(settings, prefs),
    events: {
      member_joined: effectiveDelivery(settings, prefs, "member_joined"),
      content: effectiveDelivery(settings, prefs, "content"),
      replies: effectiveDelivery(settings, prefs, "replies"),
    },
  };
}

export async function GET(request: Request) {
  const a = await authorize(request);
  if ("error" in a) return a.error;
  return NextResponse.json({ ok: true, ...(await view(a.person.id, a.sa, a.g)) });
}

export async function PUT(request: Request) {
  const a = await authorize(request);
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => null)) as { events?: unknown; digest?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  await saveMemberCommunityPrefs(a.person.id, a.sa, a.g, { events: body.events, digest: body.digest === false ? "off" : "inherit" });
  return NextResponse.json({ ok: true, ...(await view(a.person.id, a.sa, a.g)) });
}
