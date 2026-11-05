import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireCommunityModerator } from "@/lib/community/require-moderator";
import {
  countMembersPerLevel,
  createMembershipLevel,
  describeLevelOffer,
  ensureBaseMembershipLevel,
  MembershipLevelError,
} from "@/lib/server/community-membership-service";
import { listCourseOffers } from "@/lib/server/course-offer-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ saId: string; groupId: string }> };

/** Access & Membership: levels (+ counts, Offer summaries) and the pickers' options. */
export async function GET(_request: Request, { params }: Params) {
  const { saId, groupId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const base = `subAccounts/${saId}/communityGroups/${groupId}`;
  const levels = await ensureBaseMembershipLevel(saId, groupId, `member:${access.member.id}`);
  const [counts, offers, channels, native, linked, events] = await Promise.all([
    countMembersPerLevel(saId, groupId, levels),
    listCourseOffers(saId),
    db.collection(`${base}/channels`).get(),
    db.collection(`${base}/courses`).get(),
    db.collection(`subAccounts/${saId}/standaloneCourses`).where("linkedCommunityGroupIds", "array-contains", groupId).get(),
    db.collection(`${base}/events`).limit(300).get(),
  ]);
  const toMs = (v: unknown) => (typeof (v as { toMillis?: () => number })?.toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0);
  return NextResponse.json({
    ok: true,
    joinPolicy: access.group.joinPolicy ?? "open",
    levels: await Promise.all(levels.map(async (l) => ({ ...l, memberCount: counts[l.id] ?? 0, offer: await describeLevelOffer(saId, l.offerId) }))),
    offers: offers
      .filter((o) => o.visibility !== "archived" || levels.some((l) => l.offerId === o.id))
      .map((o) => ({ id: o.id, title: o.title, visibility: o.visibility, type: o.type, priceCents: o.priceCents, currency: o.currency, recurringInterval: o.recurringInterval, priceTextOverride: o.priceTextOverride })),
    channels: channels.docs.map((d) => ({ id: d.id, name: d.data().name as string, private: d.data().private === true })).sort((a, b) => a.name.localeCompare(b.name)),
    courses: [
      ...native.docs.map((d) => ({ id: d.id, title: d.data().title as string, published: d.data().published === true })),
      ...linked.docs.map((d) => ({ id: d.id, title: d.data().title as string, published: d.data().published === true })),
    ].sort((a, b) => a.title.localeCompare(b.title)),
    events: events.docs
      .map((d) => ({ id: d.id, title: d.data().title as string, startAtMs: toMs(d.data().startAt), status: d.data().status as string }))
      .sort((a, b) => b.startAtMs - a.startAtMs),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { saId, groupId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const level = await createMembershipLevel(saId, groupId, body, `member:${access.member.id}`);
    return NextResponse.json({ ok: true, level });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
