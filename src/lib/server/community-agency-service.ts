import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sanitizeCommunityPostHtml, sanitizeCommunityCommentHtml } from "@/lib/community/post-html";
import { resolveBrandName, resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import { signPersonMagicLinkToken } from "@/lib/server/person-auth";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { extractMentionedMemberIds } from "@/lib/server/notification-producers";
import {
  notifyCommunityReplyShared,
  notifyCommunityMentionsShared,
  notifyCommunityLiveStartedShared,
  type CommunityNotifyAdapter,
} from "@/lib/server/community-notification-producers";
import {
  listChannelsAndSectionsForAgencyGroup,
  listChannelsAndSectionsForAgencyViewer,
  getInaccessibleAgencyChannelNames,
  getAgencyChannelByNameShared,
  createAgencyChannelShared,
  updateAgencyChannelShared,
  deleteAgencyChannelShared,
  createAgencySectionShared,
  updateAgencySectionShared,
  deleteAgencySectionShared,
  type CreateAgencyChannelByScopeInput,
  type UpdateChannelPatch,
  type CreateAgencySectionByScopeInput,
  type UpdateSectionPatch,
} from "@/lib/server/community-channels-service";
import {
  deleteAttachmentStorageByScope,
  resolveCommentParentIdByScope,
  listFeedPostsByScope,
  getFeedPostByScope,
  toggleLikeByScope,
  viewerPollVotesByScope,
  votePollByScope,
} from "@/lib/server/community-feed-shared-service";
import { agencyScope } from "@/lib/server/community-scope";
import { normalizeNavigation } from "@/lib/community/community-navigation";
import type {
  CommunityGroup,
  CommunityChannel,
  CommunitySection,
  CommunityPost,
  CommunityComment,
  ChannelType,
  CommunityPoll,
  FeedPoll,
  CommunityTheme,
  CommunityAboutMediaItem,
  CommunityAboutBenefit,
  ResourceLink,
  CommunitySidebarCard,
  NavItem,
} from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";

/**
 * Agency Community (2026-09-16) — the smallest safe extension of the
 * Community engine to a second ownership scope. Deliberately a SEPARATE,
 * small file rather than threading `ownerScope` through the ~7,000 lines of
 * `community-*.ts` tenant service code: every one of those functions takes
 * `subAccountId` as a required string used ONLY to build a
 * `subAccounts/{id}/communityGroups/...` path (confirmed by inspection —
 * none of them re-derive tenancy from it for any other purpose), so
 * duplicating the handful of operations an agency-owned group actually
 * needs here is far lower-risk than modifying that already-working,
 * heavily-featured tenant code path. Tenant groups are completely
 * untouched by this file's existence.
 *
 * Firestore shape (parallel to, never nested under, a sub-account):
 *   agencies/{agencyId}/communityGroups/{groupId}
 *     channels/{channelId}
 *     sections/{sectionId}
 *     posts/{postId}
 *       comments/{commentId}
 *     members/{memberId}          (roster only — see note below)
 *
 * Scope (updated 2026-09-19, Community Shared Architecture Phase 3 —
 * corrected from this comment's original 2026-09-16 "v1" scope list,
 * which had gone stale across several later passes): group settings,
 * channels, sections, posts (text + GIF + video-link + channel-ref, no
 * image/file/voice upload — that needs a parallel Storage upload pipeline
 * not built here), comments/replies, likes, pinning, poll create/vote,
 * @ mentions, live rooms, DMs, events, leaderboard, and points & rewards
 * all now have real Agency-scope parity (see the Community Shared
 * Architecture Phase 1/2/3 reports). Classroom/course links also have
 * parity (agency-community-classroom-service.ts). Genuinely still absent:
 * Skool import (architecturally tied to tenant Contact/Member creation,
 * no Agency analog) and image/file/voice attachment upload (no Storage
 * pipeline built for Agency yet, GIF/video-link/text still work).
 *
 * Membership + real access (2026-09-17) — an agency community has no
 * Member/session identity system of its own (the tenant one is hard-bound
 * to a subAccountId — see member-session.ts), so real member access is
 * built on top of the existing, genuinely tenant-agnostic MyMagnetix
 * Person/`mm_session` identity (person-identity-service.ts,
 * person-session.ts) instead of inventing a parallel one. `members/{id}`
 * is now a real membership record (not just a roster): it carries a
 * `personId` (resolved/created via `ensurePersonIdentity` at invite time,
 * the same email-equality primitive every other identity link in this
 * codebase uses) and a `pending -> active` status lifecycle. The security
 * gate itself lives in `agency-community-access.ts`, which mirrors
 * `/api/my/enter`'s pattern: verify `mm_session` -> independently
 * re-derive this exact membership doc by `personId` -> only proceed if it
 * exists and isn't removed. The agency OWNER keeps their existing
 * `requireAgencyOwnerAny` access on top of this, unrelated and unaffected.
 */

const ABOUT_MAX_CHARS = 1000;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "community"
  );
}

function groupsCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups`);
}
function groupDoc(agencyId: string, groupId: string) {
  return groupsCol(agencyId).doc(groupId);
}
function channelsCol(agencyId: string, groupId: string) {
  return groupDoc(agencyId, groupId).collection("channels");
}
function postsCol(agencyId: string, groupId: string) {
  return groupDoc(agencyId, groupId).collection("posts");
}
function commentsCol(agencyId: string, groupId: string, postId: string) {
  return postsCol(agencyId, groupId).doc(postId).collection("comments");
}
function membersCol(agencyId: string, groupId: string) {
  return groupDoc(agencyId, groupId).collection("members");
}

async function uniqueSlug(agencyId: string, base: string): Promise<string> {
  const root = slugify(base);
  const col = groupsCol(agencyId);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const snap = await col.where("slug", "==", candidate).limit(1).get();
    if (snap.empty) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * Who a post/comment is denormalized as coming from — resolved once at
 * write time (agency communities have no Member doc to hydrate authors
 * from later). Owner-authored content is branded as the AGENCY (Magnetix
 * Studios), never the owner's personal Firebase identity or any
 * sub-account's name — this is the fix for the "must not inherit branding
 * from Quiana LaChé, or show the owner's personal name" requirement.
 * Member-authored content shows the member's own roster displayName.
 */
export type AgencyPostAuthor =
  | { kind: "owner"; uid: string }
  | {
      kind: "member";
      personId: string;
      displayName: string;
      avatarUrl?: string | null;
      /** Points & Leaderboard (2026-09-17) — the roster doc's own id,
       *  needed to award points onto the right doc. Optional only so
       *  existing call sites that don't care about points still compile;
       *  every real caller (the API routes) always has it via
       *  `caller.membership.id`. */
      membershipId?: string;
    };

async function resolveAgencyAuthor(
  author: AgencyPostAuthor,
): Promise<{ authorId: string; displayName: string; avatarUrl: string | null }> {
  if (author.kind === "member") {
    return {
      authorId: author.personId,
      displayName: author.displayName.trim() || "Member",
      avatarUrl: author.avatarUrl ?? null,
    };
  }
  // Agency-level branding is the ONLY source here — never a sub-account's
  // name/logo (resolveCustomBrand never reads sub-account data; see its
  // own doc comment in resolve-brand.ts).
  const brand = await resolveCustomBrand();
  return { authorId: author.uid, displayName: brand.name, avatarUrl: brand.logoUrl };
}

// ---------------------------------------------------------------- Groups --

export interface CreateAgencyGroupInput {
  agencyId: string;
  createdByUid: string;
  name: string;
  about?: string;
}

export async function createAgencyGroupServerSide(
  input: CreateAgencyGroupInput,
): Promise<CommunityGroup> {
  const slug = await uniqueSlug(input.agencyId, input.name);
  const doc = {
    ownerScope: "agency" as const,
    agencyId: input.agencyId,
    createdByUid: input.createdByUid,
    name: input.name.trim().slice(0, 80),
    slug,
    about: (input.about ?? "").trim().slice(0, ABOUT_MAX_CHARS),
    tagline: "",
    coverUrl: null,
    cardImageUrl: null,
    aboutMedia: [],
    aboutBenefits: [],
    aboutHtml: "",
    logoUrl: null,
    faviconUrl: null,
    brandColor: null,
    access: "free" as const,
    priceCents: null,
    currency: null,
    joinPolicy: "approval" as const,
    pointsEnabled: false,
    categories: ["General"],
    links: [],
    guidelinesHtml: "",
    sidebarCards: [],
    // Classroom/Events/Leaderboards aren't built for agency scope yet (see
    // module comment) — hidden via the SAME Settings → Navigation
    // visibility config the tenant product already has, rather than a
    // one-off CommunityShell change. "community" and "about" are mandatory
    // (MANDATORY_NAV_KEYS) and can't be hidden this way; "members" stays
    // visible since the roster page is real.
    navigation: [
      { key: "community", label: "Community", visible: true, order: 0 },
      // Classroom stays hidden — genuinely blocked on Agency Courses, which
      // doesn't exist yet (see the Agency Community Parity task).
      { key: "classroom", label: "Classroom", visible: false, order: 1 },
      { key: "events", label: "Events", visible: true, order: 2 },
      { key: "leaderboards", label: "Leaderboard", visible: true, order: 3 },
      { key: "members", label: "Members", visible: true, order: 4 },
      { key: "about", label: "About", visible: true, order: 5 },
    ],
    status: "draft" as const,
    memberCount: 0,
    reviewCount: 0,
    averageRating: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await groupsCol(input.agencyId).add(doc);

  // Every group needs at least one real Channel doc for the left rail to
  // render anything — mirrors ensureChannelsForGroup's "General" backfill,
  // just done eagerly at creation instead of lazily, since an agency group
  // starts with no legacy category debt to reconcile.
  await channelsCol(input.agencyId, ref.id).add({
    groupId: ref.id,
    name: "General",
    icon: "💬",
    description: "",
    private: false,
    readOnly: false,
    sectionId: null,
    channelType: "feed" as ChannelType,
    order: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id, ...doc } as CommunityGroup;
}

export async function listGroupsForAgency(
  agencyId: string,
): Promise<CommunityGroup[]> {
  const snap = await groupsCol(agencyId).get();
  const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityGroup);
  groups.sort((a, b) => {
    const am = a.createdAt as { toMillis?: () => number } | null;
    const bm = b.createdAt as { toMillis?: () => number } | null;
    return (bm?.toMillis?.() ?? 0) - (am?.toMillis?.() ?? 0);
  });
  return groups;
}

export async function getAgencyGroupById(
  agencyId: string,
  groupId: string,
): Promise<CommunityGroup | null> {
  const snap = await groupDoc(agencyId, groupId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CommunityGroup;
}

/**
 * Settings/branding parity (2026-09-17) — every field the tenant Community
 * Settings surface (General/Branding/Navigation/Points) already lets an
 * owner configure, now also patchable for an agency-owned group.
 * Deliberately excludes `access`/`priceCents`/`currency`/`joinPolicy`: paid
 * access needs Agency Billing/entitlements (doesn't exist — see the
 * Agency Community Parity task's "remaining true dependencies"), and
 * self-serve join has no agency-scoped flow to back it yet (membership is
 * owner-invite-only). Adding those later is additive, not a breaking
 * change to this type.
 */
export interface UpdateAgencyGroupPatch {
  name?: string;
  about?: string;
  aboutHtml?: string;
  tagline?: string;
  status?: "draft" | "published";
  logoUrl?: string | null;
  faviconUrl?: string | null;
  coverUrl?: string | null;
  cardImageUrl?: string | null;
  showBanner?: boolean;
  brandColor?: string | null;
  theme?: CommunityTheme;
  aboutMedia?: CommunityAboutMediaItem[];
  aboutBenefits?: CommunityAboutBenefit[];
  showAboutBenefits?: boolean;
  guidelinesHtml?: string;
  links?: ResourceLink[];
  sidebarCards?: CommunitySidebarCard[];
  navigation?: NavItem[];
  /** Points & Leaderboard master switch — see
   *  agency-community-points-service.ts. */
  pointsEnabled?: boolean;
}

export async function updateAgencyGroupServerSide(opts: {
  agencyId: string;
  groupId: string;
  patch: UpdateAgencyGroupPatch;
}): Promise<CommunityGroup> {
  const p = opts.patch;
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (p.name !== undefined) update.name = p.name.trim().slice(0, 80);
  if (p.about !== undefined) update.about = p.about.trim().slice(0, ABOUT_MAX_CHARS);
  if (p.aboutHtml !== undefined) update.aboutHtml = p.aboutHtml.trim().slice(0, ABOUT_MAX_CHARS);
  if (p.tagline !== undefined) update.tagline = p.tagline.trim().slice(0, 100);
  if (p.status !== undefined) update.status = p.status;
  if (p.logoUrl !== undefined) update.logoUrl = p.logoUrl;
  if (p.faviconUrl !== undefined) update.faviconUrl = p.faviconUrl;
  if (p.coverUrl !== undefined) update.coverUrl = p.coverUrl;
  if (p.cardImageUrl !== undefined) update.cardImageUrl = p.cardImageUrl;
  if (p.showBanner !== undefined) update.showBanner = p.showBanner;
  if (p.brandColor !== undefined) update.brandColor = p.brandColor;
  if (p.theme !== undefined) {
    update.theme = p.theme;
    // Same derivation the tenant Branding workspace performs on save — every
    // existing surface that reads `brandColor` picks up the new primary for
    // free (see CommunityGroup.brandColor's own doc comment).
    if (p.theme.light?.primary) update.brandColor = p.theme.light.primary;
  }
  if (p.aboutMedia !== undefined) update.aboutMedia = p.aboutMedia;
  if (p.aboutBenefits !== undefined) update.aboutBenefits = p.aboutBenefits;
  if (p.showAboutBenefits !== undefined) update.showAboutBenefits = p.showAboutBenefits;
  if (p.guidelinesHtml !== undefined) update.guidelinesHtml = p.guidelinesHtml.trim().slice(0, 2000);
  if (p.links !== undefined) update.links = p.links;
  if (p.sidebarCards !== undefined) update.sidebarCards = p.sidebarCards;
  if (p.navigation !== undefined) update.navigation = normalizeNavigation(p.navigation);
  if (p.pointsEnabled !== undefined) update.pointsEnabled = p.pointsEnabled;

  await groupDoc(opts.agencyId, opts.groupId).update(update);
  const updated = await getAgencyGroupById(opts.agencyId, opts.groupId);
  if (!updated) throw new Error("Group not found after update");
  return updated;
}

// -------------------------------------------------------- Channels/Sections
//
// Community Shared Architecture Phase 1 (2026-09-19): every function below
// is now a thin delegation to the shared, scope-aware core in
// community-channels-service.ts (the SAME business logic tenant's own
// Channels/Sections use) instead of a second, parallel implementation.
// Exported names/signatures are UNCHANGED from before this pass — every
// existing Agency Community API handler call site needs no changes. See
// that file's own module comment for the one disclosed behavior
// consolidation (channel-rename name-uniqueness, now enforced for both
// scopes) and the one deliberately-preserved difference (unconditional
// channel delete, no posts-in-use guard — kept exactly as it was).

export type {
  CreateAgencyChannelByScopeInput as CreateAgencyChannelInput,
  UpdateChannelPatch as UpdateAgencyChannelPatch,
  CreateAgencySectionByScopeInput as CreateAgencySectionInput,
  UpdateSectionPatch as UpdateAgencySectionPatch,
} from "@/lib/server/community-channels-service";

export async function listAgencyChannelsAndSections(
  agencyId: string,
  groupId: string,
): Promise<{ channels: CommunityChannel[]; sections: CommunitySection[] }> {
  return listChannelsAndSectionsForAgencyGroup(agencyId, groupId);
}

/**
 * The left rail's one read — sections + channels, already filtered for the
 * viewer. Shared core with tenant's `listChannelsAndSectionsForViewer` (see
 * community-channels-service.ts): a non-moderator never sees a private
 * Section's heading, never sees a Channel nested inside a private Section
 * (regardless of that Channel's OWN `private` value), and never sees a
 * Channel whose own `private` is true.
 */
export async function listAgencyChannelsAndSectionsForViewer(opts: {
  agencyId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<{ channels: CommunityChannel[]; sections: CommunitySection[] }> {
  return listChannelsAndSectionsForAgencyViewer(opts);
}

/**
 * Every channel NAME a non-moderator viewer must never see a post from —
 * private channels, plus every channel nested in a private section. Shared
 * core with tenant's `getInaccessibleChannelNames` — used at the actual
 * post-read layer (listAgencyFeed/getAgencyPost), not just to hide the
 * left-rail link.
 */
export async function getAgencyInaccessibleChannelNames(opts: {
  agencyId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<Set<string>> {
  return getInaccessibleAgencyChannelNames(opts);
}

/** Single-channel lookup by name — the post create route's Read-Only/
 *  Private enforcement point, shared core with tenant's `getChannelByName`. */
export async function getAgencyChannelByName(
  agencyId: string,
  groupId: string,
  name: string,
): Promise<CommunityChannel | null> {
  return getAgencyChannelByNameShared(agencyId, groupId, name);
}

export async function createAgencyChannelServerSide(
  input: CreateAgencyChannelByScopeInput,
): Promise<CommunityChannel> {
  return createAgencyChannelShared(input);
}

export async function updateAgencyChannelServerSide(
  agencyId: string,
  groupId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<CommunityChannel> {
  return updateAgencyChannelShared(agencyId, groupId, channelId, patch);
}

export async function deleteAgencyChannelServerSide(
  agencyId: string,
  groupId: string,
  channelId: string,
): Promise<void> {
  return deleteAgencyChannelShared(agencyId, groupId, channelId);
}

export async function createAgencySectionServerSide(
  input: CreateAgencySectionByScopeInput,
): Promise<CommunitySection> {
  return createAgencySectionShared(input);
}

export async function updateAgencySectionServerSide(
  agencyId: string,
  groupId: string,
  sectionId: string,
  patch: UpdateSectionPatch,
): Promise<CommunitySection> {
  return updateAgencySectionShared(agencyId, groupId, sectionId, patch);
}

/** Matches the pre-consolidation Agency signature exactly (`Promise<void>`,
 *  no "section not found" surfaced to the caller — same as before). */
export async function deleteAgencySectionServerSide(
  agencyId: string,
  groupId: string,
  sectionId: string,
): Promise<void> {
  await deleteAgencySectionShared(agencyId, groupId, sectionId);
}

// ------------------------------------------------------------------ Posts --

export interface CreateAgencyPostInput {
  agencyId: string;
  groupId: string;
  author: AgencyPostAuthor;
  title: string;
  body: string;
  category: string | null;
  attachments?: MediaAttachment[];
  commentsDisabled?: boolean;
  /** Already permission-checked (moderator-only) AND shape-validated
   *  (`normalizePollDraft`) by the API route — this layer just stores it,
   *  same convention as `attachments`. */
  poll?: CommunityPoll | null;
  /** Live Rooms companion post (2026-09-17) — set only by
   *  agency-community-live-room-service.ts's `createAgencyLiveRoomServerSide`,
   *  mirroring the tenant `createPostServerSide`'s own live fields exactly
   *  so the SAME feed-card rendering (feed-view.tsx) picks it up unchanged. */
  postType?: "live";
  liveSessionId?: string | null;
  liveRoomId?: string | null;
  liveMode?: "meeting" | "broadcast";
  liveStatus?: "live" | "ended";
  thumbnailUrl?: string | null;
}

export async function createAgencyPostServerSide(
  input: CreateAgencyPostInput,
): Promise<CommunityPost> {
  const author = await resolveAgencyAuthor(input.author);
  const doc = {
    agencyId: input.agencyId,
    groupId: input.groupId,
    authorMemberId: author.authorId,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    title: input.title.trim(),
    body: sanitizeCommunityPostHtml(input.body.trim()),
    attachments: input.attachments?.length ? input.attachments : undefined,
    category: input.category,
    commentsDisabled: input.commentsDisabled ? true : undefined,
    pinned: false,
    pinnedToChannel: false,
    likeCount: 0,
    commentCount: 0,
    poll: input.poll ?? undefined,
    hasPoll: !!input.poll,
    ...(input.postType ? { postType: input.postType } : {}),
    ...(input.liveSessionId !== undefined ? { liveSessionId: input.liveSessionId } : {}),
    ...(input.liveRoomId !== undefined ? { liveRoomId: input.liveRoomId } : {}),
    ...(input.liveMode !== undefined ? { liveMode: input.liveMode } : {}),
    ...(input.liveStatus !== undefined ? { liveStatus: input.liveStatus } : {}),
    ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await postsCol(input.agencyId, input.groupId).add(doc);

  const mentionedIds = extractMentionedMemberIds(doc.body);
  if (mentionedIds.length > 0) {
    await notifyAgencyCommunityMentions({
      agencyId: input.agencyId,
      groupId: input.groupId,
      postId: ref.id,
      contentObjectId: ref.id,
      authorId: author.authorId,
      mentionedIds,
    }).catch((err) => console.error("[createAgencyPostServerSide] mention notification failed", err));
  }

  return { id: ref.id, ...doc } as CommunityPost;
}

const MAX_FEATURED_POSTS = 3;

export interface UpdateAgencyPostInput {
  title?: string;
  body?: string;
  category?: string | null;
  attachments?: MediaAttachment[];
  commentsDisabled?: boolean;
  /** Pin/unpin — `target` selects which pin flag flips. */
  pinned?: boolean;
  pinTarget?: "allPosts" | "channel";
  /** `undefined` = leave as-is; `null` = remove the poll. Same convention
   *  as the tenant `updatePostServerSide`. */
  poll?: CommunityPoll | null;
  /** Live Rooms companion post lifecycle — set only by
   *  agency-community-live-room-service.ts on end. */
  liveStatus?: "live" | "ended";
  /** Live Rooms replay lifecycle — set only by
   *  agency-community-live-recording-service.ts as the egress webhook
   *  resolves. Mirrors the tenant post's `replayStatus`/`replayAssetId`. */
  replayStatus?: "processing" | "ready" | "failed" | "unavailable";
  replayAssetId?: string | null;
}

export async function updateAgencyPostServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  input: UpdateAgencyPostInput,
): Promise<CommunityPost> {
  const ref = postsCol(agencyId, groupId).doc(postId);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.pinned !== undefined) {
    const field = input.pinTarget === "channel" ? "pinnedToChannel" : "pinned";
    if (field === "pinned" && input.pinned) {
      const pinnedSnap = await postsCol(agencyId, groupId)
        .where("pinned", "==", true)
        .get();
      if (pinnedSnap.size >= MAX_FEATURED_POSTS) {
        throw new Error(`At most ${MAX_FEATURED_POSTS} posts can be featured at once`);
      }
    }
    update[field] = input.pinned;
    update[field === "pinned" ? "pinnedAt" : "channelPinnedAt"] = input.pinned
      ? FieldValue.serverTimestamp()
      : null;
  }
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.body !== undefined) update.body = sanitizeCommunityPostHtml(input.body.trim());
  if (input.category !== undefined) update.category = input.category;
  if (input.attachments !== undefined) {
    update.attachments = input.attachments.length ? input.attachments : FieldValue.delete();
  }
  if (input.commentsDisabled !== undefined) {
    update.commentsDisabled = input.commentsDisabled ? true : FieldValue.delete();
  }
  if (input.poll !== undefined) {
    update.poll = input.poll ?? FieldValue.delete();
    update.hasPoll = !!input.poll;
  }
  if (input.liveStatus !== undefined) update.liveStatus = input.liveStatus;
  if (input.replayStatus !== undefined) update.replayStatus = input.replayStatus;
  if (input.replayAssetId !== undefined) update.replayAssetId = input.replayAssetId;

  await ref.update(update);
  const after = await ref.get();
  return { id: after.id, ...after.data() } as CommunityPost;
}

/** Thin wrapper over the shared core (community-feed-shared-service.ts) —
 *  signature unchanged, every existing call site in this file is
 *  untouched. */
async function deleteAgencyAttachmentStorage(
  attachments: MediaAttachment[] | undefined,
  agencyId: string,
): Promise<void> {
  return deleteAttachmentStorageByScope(agencyScope(agencyId), attachments);
}

export async function deleteAgencyPostServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
): Promise<void> {
  const ref = postsCol(agencyId, groupId).doc(postId);
  const snap = await ref.get();
  const attachments = (snap.data() as CommunityPost | undefined)?.attachments;
  await deleteAgencyAttachmentStorage(attachments, agencyId);

  const commentsSnap = await ref.collection("comments").get();
  const commentAttachments = commentsSnap.docs.flatMap(
    (d) => (d.data() as { attachments?: MediaAttachment[] }).attachments ?? [],
  );
  await deleteAgencyAttachmentStorage(commentAttachments, agencyId);

  await getAdminDb().recursiveDelete(ref);
}

/** `isModerator` defaults to true (owner-safe) since every pre-existing
 *  caller was owner-only; the member routes pass `false` explicitly. */
/** `isModerator` defaults to true (owner-safe) since every pre-existing
 *  caller was owner-only; the member routes pass `false` explicitly.
 *  Fetch + channel-access filtering + sort are now the shared core (see
 *  community-feed-shared-service.ts) — `postLimit: null` preserves this
 *  function's existing unlimited-scan behavior exactly (a genuine, kept
 *  scale difference from tenant's own `.limit()` + pinned-backfill). */
export async function listAgencyFeed(
  agencyId: string,
  groupId: string,
  isModerator = true,
): Promise<CommunityPost[]> {
  return listFeedPostsByScope({
    scope: agencyScope(agencyId),
    groupId,
    viewerIsModerator: isModerator,
    postLimit: null,
  });
}

export async function getAgencyPost(
  agencyId: string,
  groupId: string,
  postId: string,
  isModerator = true,
): Promise<CommunityPost | null> {
  return getFeedPostByScope({
    scope: agencyScope(agencyId),
    groupId,
    postId,
    viewerIsModerator: isModerator,
  });
}

export async function isAgencyPostLikedByViewer(
  agencyId: string,
  groupId: string,
  postId: string,
  uid: string,
): Promise<boolean> {
  const snap = await postsCol(agencyId, groupId).doc(postId).collection("likes").doc(uid).get();
  return snap.exists;
}

export async function isAgencyCommentLikedByViewer(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
  uid: string,
): Promise<boolean> {
  const snap = await commentsCol(agencyId, groupId, postId)
    .doc(commentId)
    .collection("likes")
    .doc(uid)
    .get();
  return snap.exists;
}

/** Toggle like — idempotent per-uid doc, same pattern as the tenant
 *  `likes/{memberId}` subcollection, keyed by Firebase uid instead. Like/
 *  unlike mechanics are now the shared core (community-feed-shared-
 *  service.ts) — points integration (award/revoke "receive_like") stays
 *  at the API route layer here exactly as before (see that file's module
 *  comment for why: the roster-doc-id translation this needs has no
 *  business living in a scope-agnostic core). One correctness fix that
 *  falls out of sharing tenant's already-correct implementation: a
 *  like/unlike against a since-deleted post now throws a clean "Not
 *  found" instead of an unhandled raw Firestore `.update()`-on-missing-doc
 *  error — see the Phase 3 report. */
export async function toggleAgencyPostLikeServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  uid: string,
): Promise<{ liked: boolean; authorId: string | null }> {
  return toggleLikeByScope({ scope: agencyScope(agencyId), groupId, postId, viewerId: uid });
}

// -------------------------------------------------------------- Polls --

/** Batch-read this viewer's own vote (if any) for each post that has a
 *  poll — mirrors `viewerPollVotes` (tenant), keyed by the caller's opaque
 *  identity id (Firebase uid for the owner, personId for a member — same
 *  identity `toggleAgencyPostLikeServerSide` already keys likes by). */
export async function viewerAgencyPollVotes(
  agencyId: string,
  groupId: string,
  postIdsWithPolls: string[],
  viewerId: string,
): Promise<Map<string, string[]>> {
  return viewerPollVotesByScope(agencyScope(agencyId), groupId, postIdsWithPolls, viewerId);
}

/** Cast or change a vote on a poll — one doc per voter at
 *  `posts/{postId}/pollVotes/{viewerId}`, mirroring `votePollServerSide`
 *  (tenant) exactly, keyed by the same opaque identity id likes use. */
export async function voteAgencyPollServerSide(opts: {
  agencyId: string;
  groupId: string;
  postId: string;
  viewerId: string;
  viewerDisplayName: string;
  viewerIsModerator: boolean;
  optionIds: string[];
}): Promise<{ ok: true; poll: FeedPoll } | { ok: false; error: string }> {
  return votePollByScope({
    scope: agencyScope(opts.agencyId),
    groupId: opts.groupId,
    postId: opts.postId,
    voterId: opts.viewerId,
    voterDisplayName: opts.viewerDisplayName,
    viewerIsModerator: opts.viewerIsModerator,
    optionIds: opts.optionIds,
  });
}

// --------------------------------------------------------------- Comments --

export interface CreateAgencyCommentInput {
  agencyId: string;
  groupId: string;
  postId: string;
  author: AgencyPostAuthor;
  body: string;
  parentId?: string | null;
  attachments?: MediaAttachment[];
}

export async function createAgencyCommentServerSide(
  input: CreateAgencyCommentInput,
): Promise<CommunityComment> {
  const author = await resolveAgencyAuthor(input.author);
  const postRef = postsCol(input.agencyId, input.groupId).doc(input.postId);

  // Thread-parent resolution is now the shared core (see
  // community-feed-shared-service.ts) — one disclosed correctness fix
  // falls out of sharing tenant's already-correct implementation: a
  // request naming a parentId that doesn't actually exist now throws
  // ("Comment not found") instead of silently storing that bogus id as
  // the new comment's own parentId (Agency's previous inline check only
  // ever looked at `parentSnap.data()?.parentId`, which reads as
  // `undefined` on a nonexistent doc — indistinguishable from "not a
  // reply" — so a bad id passed through uncaught). See the Phase 3 report.
  const parentId = await resolveCommentParentIdByScope(
    agencyScope(input.agencyId),
    input.groupId,
    input.postId,
    input.parentId,
  );

  const doc = {
    groupId: input.groupId,
    postId: input.postId,
    authorMemberId: author.authorId,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    body: sanitizeCommunityCommentHtml(input.body.trim()),
    likeCount: 0,
    parentId,
    attachments: input.attachments?.length ? input.attachments : undefined,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await commentsCol(input.agencyId, input.groupId, input.postId).add(doc);
  await postRef.update({ commentCount: FieldValue.increment(1) });

  // A reply notifies whoever this comment is actually replying TO: the
  // parent comment's author for a nested reply, otherwise the post's own
  // author — mirrors notifyCommunityReply's tenant call site exactly.
  const [postSnapForNotify, parentCommentSnapForNotify] = await Promise.all([
    parentId ? null : postRef.get(),
    parentId ? commentsCol(input.agencyId, input.groupId, input.postId).doc(parentId).get() : null,
  ]);
  const recipientId = parentId
    ? (parentCommentSnapForNotify?.data()?.authorMemberId as string | undefined)
    : (postSnapForNotify?.data()?.authorMemberId as string | undefined);
  if (recipientId) {
    await notifyAgencyCommunityReply({
      agencyId: input.agencyId,
      groupId: input.groupId,
      postId: input.postId,
      commentId: ref.id,
      commenterId: author.authorId,
      recipientId,
      isReplyToComment: !!parentId,
    }).catch((err) => console.error("[createAgencyCommentServerSide] reply notification failed", err));
  }

  const mentionedIds = extractMentionedMemberIds(doc.body);
  if (mentionedIds.length > 0) {
    await notifyAgencyCommunityMentions({
      agencyId: input.agencyId,
      groupId: input.groupId,
      postId: input.postId,
      contentObjectId: ref.id,
      authorId: author.authorId,
      mentionedIds,
    }).catch((err) => console.error("[createAgencyCommentServerSide] mention notification failed", err));
  }

  return { id: ref.id, ...doc } as CommunityComment;
}

export async function listAgencyComments(
  agencyId: string,
  groupId: string,
  postId: string,
): Promise<CommunityComment[]> {
  const snap = await commentsCol(agencyId, groupId, postId).get();
  const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityComment);
  comments.sort((a, b) => {
    const am = a.createdAt as { toMillis?: () => number } | null;
    const bm = b.createdAt as { toMillis?: () => number } | null;
    return (am?.toMillis?.() ?? 0) - (bm?.toMillis?.() ?? 0);
  });
  return comments;
}

export interface UpdateAgencyCommentInput {
  body?: string;
  attachments?: MediaAttachment[];
}

export async function updateAgencyCommentServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
  input: UpdateAgencyCommentInput,
): Promise<CommunityComment> {
  const ref = commentsCol(agencyId, groupId, postId).doc(commentId);
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    editedAt: FieldValue.serverTimestamp(),
  };
  if (input.body !== undefined) update.body = sanitizeCommunityCommentHtml(input.body.trim());
  if (input.attachments !== undefined) {
    update.attachments = input.attachments.length ? input.attachments : FieldValue.delete();
  }
  await ref.update(update);
  const after = await ref.get();
  return { id: after.id, ...after.data() } as CommunityComment;
}

export async function deleteAgencyCommentServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
): Promise<void> {
  const postRef = postsCol(agencyId, groupId).doc(postId);
  const commentRef = commentsCol(agencyId, groupId, postId).doc(commentId);
  const snap = await commentRef.get();
  const attachments = (snap.data() as CommunityComment | undefined)?.attachments;
  await deleteAgencyAttachmentStorage(attachments, agencyId);

  await getAdminDb().recursiveDelete(commentRef);
  await postRef.update({ commentCount: FieldValue.increment(-1) });
}

/** Like/unlike mechanics are now the shared core — see
 *  `toggleAgencyPostLikeServerSide`'s own updated doc comment for the
 *  points-integration boundary and the not-found correctness fix, both
 *  identical here. */
export async function toggleAgencyCommentLikeServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
  uid: string,
): Promise<{ liked: boolean; authorId: string | null }> {
  return toggleLikeByScope({ scope: agencyScope(agencyId), groupId, postId, commentId, viewerId: uid });
}

// -------------------------------------------------------- Membership --

/**
 * A real membership record. `source` is the seam section 9 of the Agency
 * Community task asked for: a future automatic-enrollment system (all
 * customers, all affiliates) writes the same shape with a different
 * `source`, without this type needing to change. `personId` is resolved/
 * created at invite time via `ensurePersonIdentity` — the same email-
 * equality identity primitive every other Person link in this codebase
 * uses, so an invite to an email that already has a MyMagnetix/Member/
 * staff identity links to that SAME person, never a duplicate.
 * `status: "pending"` means invited (a Person + membership doc exist, an
 * invite email was sent) but the person hasn't actually entered the
 * community yet; it flips to `"active"` the first time they do (see
 * `activateAgencyMembershipServerSide`, called by the access gate in
 * agency-community-access.ts). `"removed"` is a revoke — soft-deleted, not
 * erased, so history/audit and a possible future re-invite aren't lossy.
 */
export interface AgencyGroupMemberRoster {
  id: string;
  agencyId: string;
  groupId: string;
  email: string;
  displayName: string | null;
  personId: string | null;
  /** "product" (2026-09-18) — the CURRENT independent reason this roster
   *  entry exists, mirroring tenant `GroupMembership.origin`'s doc
   *  comment: it's kept correct by every grant path overwriting it away
   *  from "product" whenever it touches an EXISTING doc, not just a
   *  frozen creation record. Only ever set at doc-creation time by
   *  `grantLinkedAgencyCommunityGroupsServerSide` when no roster entry
   *  existed yet; never applied to a pre-existing entry (manual invite,
   *  another source, etc.) — see agency-community-access-source-service.ts
   *  for why this exclusivity is what makes revocation safe. */
  source: "manual" | "customer" | "affiliate" | "plan_cohort" | "product";
  status: "pending" | "active" | "removed";
  invitedByUid: string;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  activatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  /** Points & Leaderboard (2026-09-17) — see agency-community-points-service.ts
   *  for why these live directly on the roster doc instead of a second
   *  `memberships` collection like tenant. Absent = 0/level 1 (never
   *  earned points yet), same "absent means default" convention used
   *  throughout this codebase. */
  points?: number;
  level?: number;
}

export async function listAgencyGroupMembers(
  agencyId: string,
  groupId: string,
): Promise<AgencyGroupMemberRoster[]> {
  const snap = await membersCol(agencyId, groupId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgencyGroupMemberRoster);
}

/**
 * Search this group's own active members for the @ mention autocomplete —
 * mirrors `searchGroupMembersServerSide` (tenant), but simpler: the agency
 * roster doc already IS the denormalized display record (no separate
 * Member-doc join needed, unlike tenant's members+memberships join).
 */
export async function searchAgencyGroupMembersServerSide(opts: {
  agencyId: string;
  groupId: string;
  query: string;
  limit?: number;
}): Promise<{ id: string; label: string; avatarUrl: string | null }[]> {
  const snap = await membersCol(opts.agencyId, opts.groupId)
    .where("status", "==", "active")
    .limit(500)
    .get();
  const q = opts.query.trim().toLowerCase();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as AgencyGroupMemberRoster)
    .map((m) => ({
      id: m.personId ?? m.id,
      label: agencyMemberLabel(m),
      avatarUrl: null,
    }))
    .filter((a) => !q || a.label.toLowerCase().includes(q))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, opts.limit ?? 8);
}

function agencyMemberLabel(m: AgencyGroupMemberRoster): string {
  return m.displayName?.trim() || m.email.split("@")[0] || "Member";
}

// ------------------------------------------------------ Notifications --

/**
 * MyMagnetix Notifications — real in-app bell events for Agency Community
 * replies/mentions, reusing the SAME shared, already Person-native
 * notification model (`createNotification`, `notification-service.ts`) the
 * tenant Community's `notifyCommunityReply`/`notifyCommunityMentions`
 * already use, with `subAccountId: null` (this activity has no
 * originating sub-account). Simpler than the tenant producers: the agency
 * roster doc already carries `personId` directly, so no separate Member->
 * Person lookup is needed. Only a real MEMBER (an active roster entry) has
 * a MyMagnetix notification bell to receive this on — the owner
 * authenticates via Firebase, not a Person, and has no notification
 * surface here in v1 (their own Agency dashboard is a separate concern,
 * out of this pass's scope — see the Agency Community Parity report).
 * Email delivery is deliberately NOT wired (the email channel needs a
 * verified per-sub-account sending domain that has no agency analog —
 * see notification-email-service.ts's `subAccountId` guard); this creates
 * the in-app notification only.
 */
async function resolveAgencyNotifyRecipientPersonId(
  agencyId: string,
  groupId: string,
  candidateId: string,
): Promise<string | null> {
  const membership = await getAgencyMembershipForPerson(agencyId, groupId, candidateId);
  if (!membership || membership.status === "removed" || !membership.personId) return null;
  return membership.personId;
}

async function resolveAgencyActorName(
  agencyId: string,
  groupId: string,
  actorId: string,
): Promise<string> {
  const membership = await getAgencyMembershipForPerson(agencyId, groupId, actorId);
  if (membership) return agencyMemberLabel(membership);
  return resolveBrandName();
}

/**
 * Builds the Agency `CommunityNotifyAdapter` — the one place Agency's
 * roster-personId resolution, display-name fallback (real Person label, or
 * `resolveBrandName()`/Magnetix Studios for the owner, who has no Person
 * identity), and `/my/community/...` destinations (no `/api/my/enter`
 * bridge needed — a Person is already a real MyMagnetix identity) are
 * supplied to the shared Community notification core
 * (community-notification-producers.ts). Used by all three
 * `notifyAgencyCommunity*` functions below.
 */
function agencyNotifyAdapter(agencyId: string, groupId: string): CommunityNotifyAdapter {
  return {
    subAccountId: null,
    resolvePersonId: (candidateId) => resolveAgencyNotifyRecipientPersonId(agencyId, groupId, candidateId),
    resolveActorName: (actorId) => resolveAgencyActorName(agencyId, groupId, actorId),
    getCommunityMeta: async () => {
      const group = await getAgencyGroupById(agencyId, groupId);
      return { name: group?.name || "a Community", slug: group?.slug || groupId };
    },
    buildPostDestination: (_groupSlug, postId) => `/my/community/${groupId}/post/${postId}`,
    buildLiveRoomDestination: (_groupSlug, roomId) => `/my/community/${groupId}/live-rooms/${roomId}`,
  };
}

/**
 * MyMagnetix Notifications — real in-app bell events for Agency Community
 * replies/mentions/live-starts, reusing the SAME shared, already
 * Person-native notification model (`createNotification`,
 * notification-service.ts) the tenant Community's `notifyCommunityReply`/
 * `notifyCommunityMentions`/`notifyCommunityLiveStarted` already use — as
 * of Community Shared Architecture Phase 1 (2026-09-19), both scopes now
 * call into the SAME shared business-rule core
 * (community-notification-producers.ts) instead of each maintaining a full
 * second implementation; only the adapter above (identity/branding/
 * destination) differs. Only a real MEMBER (an active roster entry) has a
 * MyMagnetix notification bell to receive this on — the owner
 * authenticates via Firebase, not a Person, and has no notification
 * surface here in v1. Email delivery is deliberately NOT wired (the email
 * channel needs a verified per-sub-account sending domain that has no
 * agency analog — see notification-email-service.ts's `subAccountId`
 * guard); this creates the in-app notification only, same as before.
 */
async function notifyAgencyCommunityReply(opts: {
  agencyId: string;
  groupId: string;
  postId: string;
  commentId: string;
  commenterId: string;
  /** The post's author (always) or the parent comment's author (nested
   *  reply) — whichever this reply is actually replying TO. */
  recipientId: string;
  isReplyToComment: boolean;
}): Promise<void> {
  await notifyCommunityReplyShared(agencyNotifyAdapter(opts.agencyId, opts.groupId), {
    postId: opts.postId,
    commentId: opts.commentId,
    commenterId: opts.commenterId,
    recipientId: opts.recipientId,
    isReplyToComment: opts.isReplyToComment,
  });
}

async function notifyAgencyCommunityMentions(opts: {
  agencyId: string;
  groupId: string;
  postId: string;
  /** The post itself when the mention is in a post body, or the comment id
   *  when it's in a comment/reply. */
  contentObjectId: string;
  authorId: string;
  mentionedIds: string[];
}): Promise<void> {
  await notifyCommunityMentionsShared(agencyNotifyAdapter(opts.agencyId, opts.groupId), {
    postId: opts.postId,
    contentObjectId: opts.contentObjectId,
    authorId: opts.authorId,
    mentionedIds: opts.mentionedIds,
  });
}

/**
 * "Notify members" for Agency Community Live Rooms — the agency-scope
 * sibling of `notifyCommunityLiveStarted` (tenant, notification-producers.ts),
 * both now thin wrappers over the shared `notifyCommunityLiveStartedShared`
 * core. `hostPersonId: null` (the owner hosting) never inherits a Quiana
 * LaChé — or any — sub-account's branding, since `resolveAgencyActorName`
 * falls back to `resolveBrandName()` (Magnetix Studios) for that case.
 * `createNotification`'s own `.create()`-based dedupe (keyed on
 * eventType:sourceObjectId:personId) already prevents duplicate
 * notifications if this is ever called twice for the same room.
 */
export async function notifyAgencyCommunityLiveStarted(opts: {
  agencyId: string;
  groupId: string;
  roomId: string;
  title: string;
  channel: string | null;
  hostPersonId: string | null;
}): Promise<void> {
  await notifyCommunityLiveStartedShared(agencyNotifyAdapter(opts.agencyId, opts.groupId), {
    roomId: opts.roomId,
    title: opts.title,
    channel: opts.channel,
    hostId: opts.hostPersonId,
    // Agency Community has no per-member moderator role yet — every
    // candidate reports `isModerator: false`, so a private channel's
    // live-room start is never announced to the general roster (nobody
    // qualifies for the moderator exception), mirroring tenant's own
    // behavior in effect.
    listActiveRecipients: async () => {
      const members = await listAgencyGroupMembers(opts.agencyId, opts.groupId);
      return members
        .filter((m) => m.status === "active" && !!m.personId)
        .map((m) => ({ id: m.personId as string, isModerator: false }));
    },
    isChannelPrivate: async (channelName) => {
      const channelDoc = await getAgencyChannelByName(opts.agencyId, opts.groupId, channelName);
      return channelDoc?.private === true;
    },
  });
}

export async function getAgencyMembershipForPerson(
  agencyId: string,
  groupId: string,
  personId: string,
): Promise<AgencyGroupMemberRoster | null> {
  const snap = await membersCol(agencyId, groupId)
    .where("personId", "==", personId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as AgencyGroupMemberRoster;
}

/** Flips a pending membership to active on the person's first real entry
 *  (called by the access gate, not by any client-trusted call). No-op
 *  shape mirrors the rest of this codebase's idempotent link/activate
 *  helpers — safe to call even if already active. */
export async function activateAgencyMembershipServerSide(
  agencyId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  await membersCol(agencyId, groupId).doc(memberId).update({
    status: "active",
    activatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Transactional-only invite email — never marketing — sent from the
 * shared platform sender (no tenant `from` override, same convention as
 * every other MyMagnetix email) and branded ONLY with agency-level
 * branding (`resolveBrandName`, backed by `AgencyDoc.name` — never a
 * sub-account's name). Reuses the EXISTING, already-secure magic-link
 * verify endpoint (`/api/my/login/verify`) unmodified — this only mints
 * the token and composes different copy around it; the token
 * creates-or-resolves the same Person `ensurePersonIdentity` already
 * would, and lands the visitor at this specific community on success.
 * Best-effort: a failure here must not fail the invite/resend action
 * itself (the membership doc already exists either way, and the owner can
 * always resend).
 */
async function sendAgencyCommunityInviteEmail(opts: {
  email: string;
  groupId: string;
  groupName: string;
  origin: string;
}): Promise<void> {
  if (!emailIsConfigured()) return;
  try {
    const brandName = await resolveBrandName();
    const token = signPersonMagicLinkToken(opts.email);
    const next = `/my/community/${opts.groupId}`;
    const link = `${opts.origin.replace(/\/$/, "")}/api/my/login/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
    await sendEmail({
      to: opts.email,
      subject: `You're invited to ${opts.groupName}`,
      text: `Hi,

You've been invited to join ${opts.groupName} on ${brandName}.

Click the link below to get started. The link expires in 15 minutes and can only be used once.

${link}

If you didn't expect this invite, you can safely ignore it.

— ${brandName}
`,
      html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">You're invited to ${opts.groupName}</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">You've been invited to join ${opts.groupName} on ${brandName}. Click the button below to get started. The link expires in 15 minutes.</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Join ${opts.groupName}</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't expect this invite, you can safely ignore it.</p>
</body></html>`,
    });
  } catch (err) {
    console.error("[community-agency-service] invite email failed", err);
  }
}

export async function addAgencyGroupMemberServerSide(opts: {
  agencyId: string;
  groupId: string;
  email: string;
  displayName?: string | null;
  invitedByUid: string;
  origin: string;
}): Promise<AgencyGroupMemberRoster> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required");
  const existing = await membersCol(opts.agencyId, opts.groupId)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existing.empty) throw new Error("Already on the roster");

  // Resolve-or-create the SAME global Person a Member/staff login with
  // this email would resolve to — never a new, agency-only identity. See
  // this file's module comment.
  const personId = await ensurePersonIdentity(email);

  const doc = {
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    email,
    displayName: opts.displayName?.trim() || null,
    personId,
    source: "manual" as const,
    status: "pending" as const,
    invitedByUid: opts.invitedByUid,
    createdAt: FieldValue.serverTimestamp(),
    activatedAt: null,
  };
  const ref = await membersCol(opts.agencyId, opts.groupId).add(doc);
  await groupDoc(opts.agencyId, opts.groupId).update({
    memberCount: FieldValue.increment(1),
  });

  const group = await getAgencyGroupById(opts.agencyId, opts.groupId);
  await sendAgencyCommunityInviteEmail({
    email,
    groupId: opts.groupId,
    groupName: group?.name ?? "the community",
    origin: opts.origin,
  });

  return { id: ref.id, ...doc } as AgencyGroupMemberRoster;
}

/** Owner-triggered resend for a still-pending (or already-active, e.g. the
 *  person lost the original email) invite — same email, a fresh token. */
export async function resendAgencyGroupInviteServerSide(
  agencyId: string,
  groupId: string,
  memberId: string,
  origin: string,
): Promise<void> {
  const snap = await membersCol(agencyId, groupId).doc(memberId).get();
  if (!snap.exists) throw new Error("Not found");
  const data = snap.data() as Omit<AgencyGroupMemberRoster, "id">;
  if (data.status === "removed") {
    throw new Error("This person's access has been revoked");
  }
  const group = await getAgencyGroupById(agencyId, groupId);
  await sendAgencyCommunityInviteEmail({
    email: data.email,
    groupId,
    groupName: group?.name ?? "the community",
    origin,
  });
}

/** Revoke access — soft-delete (status "removed"), never a hard delete, so
 *  a membership's history/audit trail survives and a future re-invite
 *  isn't ambiguous with "never invited." Access is enforced by status, not
 *  document existence — see agency-community-access.ts. */
export async function removeAgencyGroupMemberServerSide(
  agencyId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  const ref = membersCol(agencyId, groupId).doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const wasActive = (snap.data()?.status as string) !== "removed";
  await ref.update({ status: "removed", removedAt: FieldValue.serverTimestamp() });
  if (wasActive) {
    await groupDoc(agencyId, groupId).update({ memberCount: FieldValue.increment(-1) });
  }
}
