import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { createModerationReport, findSharedCommunity } from "@/lib/server/community-moderation-service";
import type { CommunityReportReason } from "@/types/community";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ saId: string }> }) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") return NextResponse.json({ error: access.message }, { status: access.status });
  let body: { contentId?: string; conversationId?: string; reason?: CommunityReportReason; reporterContext?: string; reportedMemberId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.contentId || !body.conversationId || !body.reason || !body.reportedMemberId) return NextResponse.json({ error: "Message context and reason are required" }, { status: 400 });
  const groupId = await findSharedCommunity(saId, access.member.id, body.reportedMemberId);
  if (!groupId) return NextResponse.json({ error: "No shared community context" }, { status: 400 });
  try {
    const report = await createModerationReport({ subAccountId: saId, groupId, reporterMemberId: access.member.id, contentType: "direct_message", contentId: body.contentId, conversationId: body.conversationId, reason: body.reason, reporterContext: body.reporterContext });
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit report" }, { status: 400 }); }
}
