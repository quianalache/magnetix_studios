import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createModerationReport, listModerationReports, updateModerationReport } from "@/lib/server/community-moderation-service";
import type { CommunityReportContentType, CommunityReportReason, CommunityReportStatus } from "@/types/community";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ saId: string; groupId: string }> }) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") return NextResponse.json({ error: access.message }, { status: access.status });
  if (access.membership.role !== "moderator") return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  return NextResponse.json({ reports: await listModerationReports(saId, groupId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ saId: string; groupId: string }> }) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") return NextResponse.json({ error: access.message }, { status: access.status });
  let body: { contentType?: CommunityReportContentType; contentId?: string; parentId?: string | null; conversationId?: string | null; reason?: CommunityReportReason; reporterContext?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.contentType || !body.contentId || !body.reason) return NextResponse.json({ error: "Content and reason are required" }, { status: 400 });
  try {
    const report = await createModerationReport({ subAccountId: saId, groupId, reporterMemberId: access.member.id, ...body } as Parameters<typeof createModerationReport>[0]);
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit report" }, { status: 400 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ saId: string; groupId: string }> }) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") return NextResponse.json({ error: access.message }, { status: access.status });
  if (access.membership.role !== "moderator") return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  let body: { reportId?: string; status?: CommunityReportStatus; moderatorNotes?: string; action?: "dismiss" | "remove" };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.reportId) return NextResponse.json({ error: "Report id is required" }, { status: 400 });
  try {
    const report = await updateModerationReport({ subAccountId: saId, groupId, reviewerMemberId: access.member.id, reportId: body.reportId, status: body.status, moderatorNotes: body.moderatorNotes, action: body.action });
    return NextResponse.json({ ok: true, report });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update report" }, { status: 400 }); }
}
