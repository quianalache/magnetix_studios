import { NextResponse } from "next/server";
import { requireCommunityModerator } from "@/lib/community/require-moderator";
import {
  getCommunityNotificationSettings,
  saveCommunityNotificationSettings,
} from "@/lib/server/community-notification-prefs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ saId: string; groupId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { saId, groupId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  return NextResponse.json({ ok: true, settings: await getCommunityNotificationSettings(saId, groupId) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { saId, groupId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as { events?: unknown; digestFrequency?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, settings: await saveCommunityNotificationSettings(saId, groupId, body) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}
