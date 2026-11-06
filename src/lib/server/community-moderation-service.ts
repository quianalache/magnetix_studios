import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { deleteCommentServerSide, deletePostServerSide } from "@/lib/server/community-feed-service";
import { getGroupById } from "@/lib/server/community-service";
import type {
  CommunityModerationReport,
  CommunityReportContentType,
  CommunityReportReason,
  CommunityReportStatus,
  Member,
} from "@/types/community";

const REPORTS = "moderationReports";
function reportsCol(saId: string, groupId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/communityGroups/${groupId}/${REPORTS}`);
}
function ms(value: unknown): number | null {
  const v = value as { toMillis?: () => number } | null;
  return v && typeof v.toMillis === "function" ? v.toMillis() : null;
}
function memberName(m: Member | undefined): string {
  return m?.displayName?.trim() || m?.email?.split("@")[0] || "Former member";
}
async function member(saId: string, id: string) {
  const snap = await getAdminDb().doc(`subAccounts/${saId}/members/${id}`).get();
  return snap.exists ? (snap.data() as Member) : undefined;
}

export function reportingEnabled(group: { memberReportingEnabled?: boolean }): boolean {
  return group.memberReportingEnabled !== false;
}

function toReport(id: string, d: Record<string, unknown>): CommunityModerationReport {
  return {
    id,
    subAccountId: d.subAccountId as string,
    groupId: d.groupId as string,
    contentType: d.contentType as CommunityReportContentType,
    contentId: d.contentId as string,
    parentId: (d.parentId as string | null) ?? null,
    conversationId: (d.conversationId as string | null) ?? null,
    reporterMemberId: d.reporterMemberId as string,
    reporterDisplayName: (d.reporterDisplayName as string) ?? "Former member",
    reporterAvatarUrl: (d.reporterAvatarUrl as string | null) ?? null,
    reportedMemberId: d.reportedMemberId as string,
    reportedDisplayName: (d.reportedDisplayName as string) ?? "Former member",
    reportedAvatarUrl: (d.reportedAvatarUrl as string | null) ?? null,
    reason: d.reason as CommunityReportReason,
    reporterContext: (d.reporterContext as string) ?? "",
    contentPreview: (d.contentPreview as string) ?? "",
    status: d.status as CommunityReportStatus,
    reviewerMemberId: (d.reviewerMemberId as string | null) ?? null,
    moderatorNotes: (d.moderatorNotes as string) ?? "",
    resolution: (d.resolution as CommunityModerationReport["resolution"]) ?? null,
    createdAtMs: ms(d.createdAt),
    updatedAtMs: ms(d.updatedAt),
    resolvedAtMs: ms(d.resolvedAt),
  };
}

export async function listModerationReports(saId: string, groupId: string) {
  const snap = await reportsCol(saId, groupId).get();
  return snap.docs.map((d) => toReport(d.id, d.data() as Record<string, unknown>)).sort(
    (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) || b.id.localeCompare(a.id),
  );
}

export async function createModerationReport(input: {
  subAccountId: string;
  groupId: string;
  reporterMemberId: string;
  contentType: CommunityReportContentType;
  contentId: string;
  parentId?: string | null;
  conversationId?: string | null;
  reason: CommunityReportReason;
  reporterContext?: string;
}) {
  const { subAccountId: saId, groupId, reporterMemberId } = input;
  const group = await getGroupById(saId, groupId);
  if (!group) throw new Error("Community not found");
  if (!reportingEnabled(group)) throw new Error("Member reporting is disabled");
  const reporter = await member(saId, reporterMemberId);
  if (!reporter) throw new Error("Member not found");

  const db = getAdminDb();
  let reportedMemberId = "unknown";
  let contentPreview = "Reported content";
  const conversationId = input.conversationId ?? null;
  if (input.contentType === "post") {
    const snap = await db.doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${input.contentId}`).get();
    if (!snap.exists) throw new Error("Content not found");
    const d = snap.data()!;
    reportedMemberId = d.authorMemberId as string;
    contentPreview = String(d.body ?? d.title ?? "").replace(/<[^>]+>/g, "").slice(0, 500);
  } else if (input.contentType === "comment") {
    if (!input.parentId) throw new Error("Post context is required for a comment report");
    const snap = await db.doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${input.parentId}/comments/${input.contentId}`).get();
    if (!snap.exists) throw new Error("Content not found");
    const d = snap.data()!;
    reportedMemberId = d.authorMemberId as string;
    contentPreview = String(d.body ?? "").replace(/<[^>]+>/g, "").slice(0, 500);
  } else {
    if (!conversationId) throw new Error("Conversation context is required for a message report");
    const snap = await db.doc(`subAccounts/${saId}/dmThreads/${conversationId}/messages/${input.contentId}`).get();
    if (!snap.exists) throw new Error("Message not found");
    const d = snap.data()!;
    reportedMemberId = d.senderId as string;
    contentPreview = String(d.body ?? "").slice(0, 500);
  }
  if (!reportedMemberId || reportedMemberId === "unknown") throw new Error("Reported member not found");
  const reported = await member(saId, reportedMemberId);
  const prior = await reportsCol(saId, groupId).where("reporterMemberId", "==", reporterMemberId).get();
  const duplicate = prior.docs.find((d) => d.data().contentType === input.contentType && d.data().contentId === input.contentId && d.data().status !== "resolved");
  if (duplicate) return toReport(duplicate.id, duplicate.data() as Record<string, unknown>);
  const ref = reportsCol(saId, groupId).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    subAccountId: saId, groupId, contentType: input.contentType, contentId: input.contentId,
    parentId: input.parentId ?? null, conversationId, reporterMemberId,
    reporterDisplayName: memberName(reporter), reporterAvatarUrl: reporter?.avatarUrl ?? null,
    reportedMemberId, reportedDisplayName: memberName(reported), reportedAvatarUrl: reported?.avatarUrl ?? null,
    reason: input.reason, reporterContext: (input.reporterContext ?? "").trim().slice(0, 2000),
    contentPreview, status: "new", reviewerMemberId: null, moderatorNotes: "", resolution: null,
    createdAt: now, updatedAt: now, resolvedAt: null,
  });
  return { ...toReport(ref.id, { subAccountId: saId, groupId, contentType: input.contentType, contentId: input.contentId, parentId: input.parentId ?? null, conversationId, reporterMemberId, reporterDisplayName: memberName(reporter), reporterAvatarUrl: reporter?.avatarUrl ?? null, reportedMemberId, reportedDisplayName: memberName(reported), reportedAvatarUrl: reported?.avatarUrl ?? null, reason: input.reason, reporterContext: input.reporterContext ?? "", contentPreview, status: "new", moderatorNotes: "", resolution: null }), createdAtMs: Date.now(), updatedAtMs: Date.now(), resolvedAtMs: null };
}

export async function updateModerationReport(input: { subAccountId: string; groupId: string; reportId: string; reviewerMemberId: string; status?: CommunityReportStatus; moderatorNotes?: string; action?: "dismiss" | "remove" }) {
  const ref = reportsCol(input.subAccountId, input.groupId).doc(input.reportId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Report not found");
  const d = snap.data()!;
  let resolution: CommunityModerationReport["resolution"] = null;
  if (input.action === "remove") {
    if (d.contentType === "post") await deletePostServerSide({ subAccountId: input.subAccountId, groupId: input.groupId, postId: d.contentId });
    else if (d.contentType === "comment") await deleteCommentServerSide({ subAccountId: input.subAccountId, groupId: input.groupId, postId: d.parentId, commentId: d.contentId });
    else throw new Error("Direct message removal is not supported safely yet");
    resolution = "content_removed";
  } else if (input.action === "dismiss") resolution = "dismissed";
  const status = input.status ?? (input.action ? "resolved" : d.status);
  await ref.update({ status, reviewerMemberId: input.reviewerMemberId, ...(input.moderatorNotes !== undefined ? { moderatorNotes: input.moderatorNotes.trim().slice(0, 4000) } : {}), ...(resolution ? { resolution, resolvedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp() });
  const next = await ref.get();
  return toReport(next.id, next.data() as Record<string, unknown>);
}

/** DMs are tenant-scoped, not group-scoped. Pick the shared active Community
 * context server-side so a member never supplies an arbitrary group id. */
export async function findSharedCommunity(saId: string, a: string, b: string): Promise<string | null> {
  const db = getAdminDb();
  const [as, bs] = await Promise.all([
    db.collectionGroup("memberships").where("memberId", "==", a).get(),
    db.collectionGroup("memberships").where("memberId", "==", b).get(),
  ]);
  const other = new Set(bs.docs.filter((d) => d.data().subAccountId === saId && d.data().status === "active").map((d) => d.data().groupId as string));
  return as.docs.filter((d) => d.data().subAccountId === saId && d.data().status === "active").map((d) => d.data().groupId as string).find((id) => other.has(id)) ?? null;
}
