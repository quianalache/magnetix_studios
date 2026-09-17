import "server-only";

import { NextResponse } from "next/server";
import {
  resolveAgencyCommunityCaller,
  agencyMemberDisplayName,
} from "@/lib/server/agency-community-access";
import { resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  createAgencyPostServerSide,
  listAgencyFeed,
  isAgencyPostLikedByViewer,
} from "@/lib/server/community-agency-service";
import { renderCommunityPostHtml } from "@/lib/community/post-html";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

/** Agency Community — list the feed. Owner OR an active member (real
 *  access — see agency-community-access.ts). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;

  const posts = await listAgencyFeed(caller.agencyId, groupId);
  const brandName = await resolveBrandName();
  const clientPosts = await Promise.all(
    posts.map(async (p) => ({
      id: p.id,
      authorMemberId: p.authorMemberId,
      title: p.title,
      body: renderCommunityPostHtml(p.body),
      attachments: p.attachments,
      category: p.category,
      commentsDisabled: p.commentsDisabled,
      pinned: p.pinned,
      pinnedAtMs: toMillis(p.pinnedAt),
      pinnedToChannel: p.pinnedToChannel === true,
      channelPinnedAtMs: toMillis(p.channelPinnedAt),
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      createdAtMs: toMillis(p.createdAt),
      author: {
        memberId: p.authorMemberId,
        displayName: p.authorDisplayName ?? brandName,
        avatarUrl: p.authorAvatarUrl ?? null,
        level: 1,
      },
      likedByViewer: await isAgencyPostLikedByViewer(
        caller.agencyId,
        groupId,
        p.id,
        viewerId,
      ),
    })),
  );
  return NextResponse.json({ posts: clientPosts });
}

/** Agency Community — create a post. Owner OR an active member of THIS
 *  specific community (real access — see agency-community-access.ts).
 *  Owner-authored posts are branded as the agency (Magnetix Studios), never
 *  the owner's personal identity — see resolveAgencyAuthor in
 *  community-agency-service.ts. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: MediaAttachment[];
    commentsDisabled?: boolean;
    // Polls are intentionally accepted-and-ignored in v1 — see the Agency
    // Community task's "remaining work" (create/display isn't wired,
    // voting isn't either, so accepting the field would misrepresent a
    // post as having a real poll it can't actually serve votes for).
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!text && attachments.length === 0) {
    return NextResponse.json(
      { error: "Write something or attach media." },
      { status: 400 },
    );
  }

  const post = await createAgencyPostServerSide({
    agencyId: caller.agencyId,
    groupId,
    author:
      caller.kind === "owner"
        ? { kind: "owner", uid: caller.uid }
        : {
            kind: "member",
            personId: caller.personId,
            displayName: agencyMemberDisplayName(caller.membership),
          },
    title,
    body: body.body ?? "",
    category: body.category ?? null,
    attachments,
    commentsDisabled: body.commentsDisabled,
  });
  return NextResponse.json({ ok: true, post });
}
