import "server-only";

import { createNotification } from "@/lib/server/notification-service";

/**
 * Community Shared Architecture Phase 1 (2026-09-19) — the ONE place the
 * business rules for Community reply/mention/live-started notifications
 * live, for both tenant and Agency scope. Both `notification-producers.ts`
 * (tenant) and `community-agency-service.ts` (Agency) now call straight
 * into the three `*Shared` functions below instead of each carrying a full
 * second implementation.
 *
 * What's genuinely scope-specific (per the Shared-First Architecture
 * Audit's own list) stays OUTSIDE this file, supplied by each caller as a
 * small `CommunityNotifyAdapter` built from that scope's own, already-
 * existing identity/branding helpers:
 *   - tenant: `resolvePersonIdForMember`/`getMemberDisplayName` (Member ->
 *     Person via the Member doc's own `personId` field) + `enterHref`-
 *     wrapped destinations (a tenant Member needs the `/api/my/enter`
 *     bridge to reach MyMagnetix).
 *   - agency: `resolveAgencyNotifyRecipientPersonId`/`resolveAgencyActorName`
 *     (the roster doc's own `personId`, already the real Person — no
 *     bridge needed, a Person navigates straight to `/my/community/...`).
 *
 * Preserved business rules (identical for both scopes, now enforced in
 * exactly one place instead of two, possibly-diverging ones):
 *   - never self-notify (an actor never gets a notification about their
 *     own reply/mention/live room)
 *   - one notification per (event, recipient) — `createNotification`'s own
 *     `.create()`-based dedupe already guarantees this; this file just
 *     builds the right `sourceObjectId`
 *   - a private channel's live-room start is never announced to a
 *     non-moderator
 *   - `subAccountId` on the notification doc is the real tenant id, or
 *     `null` for Agency — never a fake stand-in
 *   - Person ownership only — a candidate recipient with no resolvable
 *     Person is silently skipped, never invented
 */
export interface CommunityNotifyAdapter {
  /** Real subAccountId for tenant; `null` for Agency (no originating
   *  sub-account) — passed straight through to `createNotification`. */
  subAccountId: string | null;
  /** Resolve a real Person id for an actor/recipient in this scope's own
   *  identity space (tenant Member id, or Agency roster/Person id).
   *  Returns `null` to skip — never fabricates an identity. */
  resolvePersonId(candidateId: string): Promise<string | null>;
  /** Display name for an actor, falling back the same way each scope
   *  already did (tenant: member email local-part / "Someone"; Agency:
   *  roster label / the resolved brand name for the owner). */
  resolveActorName(actorId: string): Promise<string>;
  /** The community's own name + slug, for title copy and destinations. */
  getCommunityMeta(): Promise<{ name: string; slug: string }>;
  buildPostDestination(groupSlug: string, postId: string): string;
  buildLiveRoomDestination(groupSlug: string, roomId: string): string;
}

export async function notifyCommunityReplyShared(
  adapter: CommunityNotifyAdapter,
  opts: {
    postId: string;
    commentId: string;
    commenterId: string;
    /** The post's author (always) or the parent comment's author (nested
     *  reply) — whichever this reply is actually replying TO. */
    recipientId: string;
    isReplyToComment: boolean;
  }
): Promise<void> {
  if (opts.recipientId === opts.commenterId) return; // no self-notify

  const personId = await adapter.resolvePersonId(opts.recipientId);
  if (!personId) return;

  const [commenterName, community] = await Promise.all([
    adapter.resolveActorName(opts.commenterId),
    adapter.getCommunityMeta(),
  ]);

  await createNotification({
    personId,
    subAccountId: adapter.subAccountId,
    eventType: "community.reply",
    objectType: "comment",
    objectId: opts.commentId,
    actorMemberId: opts.commenterId,
    title: opts.isReplyToComment
      ? `${commenterName} replied to you in ${community.name}`
      : `${commenterName} replied to your post in ${community.name}`,
    destination: adapter.buildPostDestination(community.slug, opts.postId),
    meta: { communityName: community.name, actorName: commenterName },
    // The reply itself (commentId) is the recurring unit — each distinct
    // reply is its own real notification, never deduped against a prior one.
    sourceObjectId: opts.commentId,
  });
}

/**
 * One notification per mentioned recipient per post/comment. Never fires
 * for a self-mention.
 */
export async function notifyCommunityMentionsShared(
  adapter: CommunityNotifyAdapter,
  opts: {
    postId: string;
    /** The post itself when the mention is in a post body, or the comment
     *  id when it's in a comment/reply — always the destination's own
     *  anchor. */
    contentObjectId: string;
    authorId: string;
    mentionedIds: string[];
  }
): Promise<void> {
  const targets = opts.mentionedIds.filter((id) => id !== opts.authorId);
  if (targets.length === 0) return;

  const [authorName, community] = await Promise.all([
    adapter.resolveActorName(opts.authorId),
    adapter.getCommunityMeta(),
  ]);
  const destination = adapter.buildPostDestination(community.slug, opts.postId);

  await Promise.all(
    targets.map(async (candidateId) => {
      const personId = await adapter.resolvePersonId(candidateId);
      if (!personId) return;
      await createNotification({
        personId,
        subAccountId: adapter.subAccountId,
        eventType: "community.mention",
        objectType: "comment",
        objectId: opts.contentObjectId,
        actorMemberId: opts.authorId,
        title: `${authorName} mentioned you in ${community.name}`,
        destination,
        meta: { communityName: community.name, actorName: authorName },
        // One mention notification per (content item, recipient).
        sourceObjectId: `${opts.contentObjectId}:${candidateId}`,
      });
    })
  );
}

export interface CommunityNotifyLiveCandidate {
  /** The candidate's identity in this scope's own space (tenant memberId,
   *  or Agency roster/personId) — fed straight into `resolvePersonId`. */
  id: string;
  /** Only a moderator/admin still gets notified about a private channel's
   *  room going live — same exception tenant's own moderator role grants
   *  elsewhere. Agency has no per-member moderator role yet, so every
   *  Agency candidate is `false` here (see community-agency-service.ts's
   *  own adapter) — nobody qualifies for the exception, the safe default. */
  isModerator: boolean;
}

export async function notifyCommunityLiveStartedShared(
  adapter: CommunityNotifyAdapter,
  opts: {
    roomId: string;
    title: string;
    channel: string | null;
    /** `null` when the host has no Person identity of their own (e.g. the
     *  Agency owner authenticating via Firebase, not a Person) — such a
     *  host is simply never excluded-by-id (there's no candidate whose id
     *  would ever equal `null`), and their display name still resolves
     *  through `resolveActorName`. */
    hostId: string | null;
    listActiveRecipients(): Promise<CommunityNotifyLiveCandidate[]>;
    isChannelPrivate(channelName: string): Promise<boolean>;
  }
): Promise<void> {
  const [community, hostName, privateChannel, recipients] = await Promise.all([
    adapter.getCommunityMeta(),
    opts.hostId
      ? adapter.resolveActorName(opts.hostId)
      : adapter.resolveActorName(""),
    opts.channel ? opts.isChannelPrivate(opts.channel) : Promise.resolve(false),
    opts.listActiveRecipients(),
  ]);
  const destination = adapter.buildLiveRoomDestination(
    community.slug,
    opts.roomId
  );

  await Promise.all(
    recipients.map(async (candidate) => {
      if (candidate.id === opts.hostId) return; // never notify the host about their own room
      if (privateChannel && !candidate.isModerator) return;
      const personId = await adapter.resolvePersonId(candidate.id);
      if (!personId) return;
      await createNotification({
        personId,
        subAccountId: adapter.subAccountId,
        eventType: "community.live.started",
        objectType: "live-room",
        objectId: opts.roomId,
        actorMemberId: opts.hostId,
        title: `${hostName} is live: ${opts.title}`,
        message: `Join ${community.name} now.`,
        destination,
        meta: { communityName: community.name, actorName: hostName },
        sourceObjectId: opts.roomId,
      });
    })
  );
}
