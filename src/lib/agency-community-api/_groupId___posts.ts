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
  viewerAgencyPollVotes,
  getAgencyInaccessibleChannelNames,
  getAgencyChannelByName,
} from "@/lib/server/community-agency-service";
import { buildFeedPoll } from "@/lib/server/community-feed-service";
import { normalizePollDraft } from "@/lib/community/normalize-poll";
import { awardAgencyPoints } from "@/lib/server/agency-community-points-service";
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
  const isModerator = caller.kind === "owner";

  const posts = await listAgencyFeed(caller.agencyId, groupId, isModerator);
  const brandName = await resolveBrandName();
  const pollPostIds = posts.filter((p) => p.poll).map((p) => p.id);
  const votes = await viewerAgencyPollVotes(caller.agencyId, groupId, pollPostIds, viewerId);
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
      poll: p.poll ? buildFeedPoll(p.poll, votes.get(p.id) ?? null, isModerator) : undefined,
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
    poll?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isModerator = caller.kind === "owner";

  // Polls — owner/moderator-only, enforced here regardless of whether the
  // composer's Poll icon was correctly hidden for a member.
  if (body.poll != null && !isModerator) {
    return NextResponse.json({ error: "Only the owner can create a poll" }, { status: 403 });
  }
  let poll;
  try {
    poll = normalizePollDraft(body.poll);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid poll" },
      { status: 400 },
    );
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!text && attachments.length === 0 && !poll) {
    return NextResponse.json(
      { error: "Write something, attach media, or add a poll." },
      { status: 400 },
    );
  }

  // Channel enforcement (Read Only / Private) — server-side regardless of
  // the composer's own client-side gating.
  const category =
    body.category && body.category.trim() ? body.category : null;
  if (category && !isModerator) {
    const inaccessible = await getAgencyInaccessibleChannelNames({
      agencyId: caller.agencyId,
      groupId,
      isModerator: false,
    });
    if (inaccessible.has(category)) {
      return NextResponse.json({ error: "You don't have access to this channel" }, { status: 403 });
    }
    const channel = await getAgencyChannelByName(caller.agencyId, groupId, category);
    if (channel?.readOnly) {
      return NextResponse.json({ error: "Only the owner can post in this channel" }, { status: 403 });
    }
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
            membershipId: caller.membership.id,
          },
    title,
    body: body.body ?? "",
    category,
    attachments,
    commentsDisabled: body.commentsDisabled,
    poll,
  });

  if (caller.kind === "member") {
    await awardAgencyPoints({
      agencyId: caller.agencyId,
      groupId,
      recipientMembershipId: caller.membership.id,
      actorId: caller.personId,
      action: "create_post",
      sourceEntityId: post.id,
    }).catch((err) => console.error("[agency posts] point award failed", err));
  }

  return NextResponse.json({ ok: true, post });
}
