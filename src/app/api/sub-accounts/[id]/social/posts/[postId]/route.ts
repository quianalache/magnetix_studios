import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { cancelQstashMessage, publishSocialPost, qstashIsConfigured } from "@/lib/automations/qstash";
import { isApprovedSocialImage } from "@/lib/server/social-media-validation";
import { SOCIAL_CAPTION_MAX, type SocialPlatform, type SocialPostTargetResult } from "@/types/social";
import type { MetaConfig, SocialPostDoc } from "@/types";

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram"];

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: subAccountId, postId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const ref = getAdminDb().doc(`socialPosts/${postId}`);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as SocialPostDoc).subAccountId !== subAccountId) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const existing = snap.data() as Omit<SocialPostDoc, "id">;
  if (existing.status !== "draft" && existing.status !== "scheduled") return NextResponse.json({ error: "Only drafts and scheduled posts can be edited." }, { status: 409 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  if (caption.length > SOCIAL_CAPTION_MAX) return NextResponse.json({ error: `Caption is too long (max ${SOCIAL_CAPTION_MAX} characters).` }, { status: 400 });
  const imageUrl = typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim().slice(0, 2000) : null;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) return NextResponse.json({ error: "Selected media must use an https URL." }, { status: 400 });
  if (imageUrl && !(await isApprovedSocialImage(subAccountId, imageUrl))) return NextResponse.json({ error: "Choose a ready image with an administrator-approved public delivery URL from the Media Library." }, { status: 400 });
  const targets = Array.isArray(body.targets) ? PLATFORMS.filter((platform) => (body.targets as unknown[]).includes(platform)) : [];
  const status = body.status === "scheduled" ? "scheduled" : "draft";
  if (status === "draft") {
    if (existing.status === "scheduled") await cancelQstashMessage(existing.qstashMessageId);
    await ref.set({ caption, imageUrl, targets, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, id: postId, status });
  }
  const when = typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) return NextResponse.json({ error: "Pick a valid future schedule time." }, { status: 400 });
  if (!caption && !imageUrl) return NextResponse.json({ error: "Add a caption or media before scheduling." }, { status: 400 });
  if (!targets.length) return NextResponse.json({ error: "Pick at least one platform." }, { status: 400 });
  if (targets.includes("instagram") && !imageUrl) return NextResponse.json({ error: "Instagram posts require media." }, { status: 400 });
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const meta = subSnap.data()?.metaConfig as MetaConfig | null | undefined;
  if (!meta || !metaCanPublish(meta)) return NextResponse.json({ error: "Reconnect a publish-capable Facebook Page and Instagram account first." }, { status: 400 });
  if (!meta.pageId || (targets.includes("instagram") && !meta.instagramBusinessAccountId)) return NextResponse.json({ error: "Reconnect a publish-capable Facebook Page and Instagram account first." }, { status: 400 });
  if (!qstashIsConfigured()) return NextResponse.json({ error: "Scheduling is unavailable on this deployment." }, { status: 503 });
  const scheduled = await publishSocialPost({ postId, subAccountId, delaySeconds: Math.max(0, Math.floor((when.getTime() - Date.now()) / 1000)), deduplicationId: `social_${postId}_${Date.now()}` });
  if (!scheduled) return NextResponse.json({ error: "Could not schedule the post." }, { status: 502 });
  if (existing.status === "scheduled") await cancelQstashMessage(existing.qstashMessageId);
  const results: SocialPostTargetResult[] = targets.map((platform) => ({ platform, status: "pending", externalId: null, error: null }));
  await ref.set({ caption, imageUrl, targets, status, scheduledAt: when, results, qstashMessageId: scheduled.messageId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return NextResponse.json({ ok: true, id: postId, status });
}

/**
 * Delete a Social Planner post. Sub-account admin only.
 *
 * If the post was scheduled, its QStash job may still fire — the publish step
 * is a no-op when the doc is gone, so deleting is a safe cancel. Already-
 * published posts are removed from the calendar only; the live FB/IG post is
 * NOT deleted from the platform (deleting remotely is a v2 nicety).
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: subAccountId, postId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`socialPosts/${postId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const post = snap.data() as Omit<SocialPostDoc, "id">;
  // Tenancy guard — never let one sub-account delete another's post.
  if (post.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true, id: postId });
}
