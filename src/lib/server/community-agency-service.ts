import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sanitizeCommunityPostHtml, sanitizeCommunityCommentHtml } from "@/lib/community/post-html";
import { resolveBrandName, resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import { signPersonMagicLinkToken } from "@/lib/server/person-auth";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import type {
  CommunityGroup,
  CommunityChannel,
  CommunitySection,
  CommunityPost,
  CommunityComment,
  ChannelType,
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
 * Scope: v1 supports group settings (name/about/status), channels,
 * sections, posts (text + GIF + video-link + channel-ref, no image/file/
 * voice upload — that needs a parallel Storage upload pipeline this pass
 * doesn't build), comments/replies, likes, and pinning. It deliberately
 * does NOT support: polls voting (poll create/display works; voting
 * doesn't), @ mentions, live rooms, DMs, events, leaderboard, points &
 * rewards, classroom/course links, or Skool import — none of those exist
 * for an agency-owned group yet. See the Agency Community task's
 * "remaining work" section for the full list.
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
function sectionsCol(agencyId: string, groupId: string) {
  return groupDoc(agencyId, groupId).collection("sections");
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
  | { kind: "member"; personId: string; displayName: string; avatarUrl?: string | null };

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
      { key: "classroom", label: "Classroom", visible: false, order: 1 },
      { key: "events", label: "Events", visible: false, order: 2 },
      { key: "leaderboards", label: "Leaderboard", visible: false, order: 3 },
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

export interface UpdateAgencyGroupPatch {
  name?: string;
  about?: string;
  status?: "draft" | "published";
  logoUrl?: string | null;
  coverUrl?: string | null;
  brandColor?: string | null;
}

export async function updateAgencyGroupServerSide(opts: {
  agencyId: string;
  groupId: string;
  patch: UpdateAgencyGroupPatch;
}): Promise<CommunityGroup> {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (opts.patch.name !== undefined) update.name = opts.patch.name.trim().slice(0, 80);
  if (opts.patch.about !== undefined) update.about = opts.patch.about.trim().slice(0, ABOUT_MAX_CHARS);
  if (opts.patch.status !== undefined) update.status = opts.patch.status;
  if (opts.patch.logoUrl !== undefined) update.logoUrl = opts.patch.logoUrl;
  if (opts.patch.coverUrl !== undefined) update.coverUrl = opts.patch.coverUrl;
  if (opts.patch.brandColor !== undefined) update.brandColor = opts.patch.brandColor;
  await groupDoc(opts.agencyId, opts.groupId).update(update);
  const updated = await getAgencyGroupById(opts.agencyId, opts.groupId);
  if (!updated) throw new Error("Group not found after update");
  return updated;
}

// -------------------------------------------------------- Channels/Sections

export interface CreateAgencyChannelInput {
  agencyId: string;
  groupId: string;
  name: string;
  icon: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
}

export async function listAgencyChannelsAndSections(
  agencyId: string,
  groupId: string,
): Promise<{ channels: CommunityChannel[]; sections: CommunitySection[] }> {
  const [channelsSnap, sectionsSnap] = await Promise.all([
    channelsCol(agencyId, groupId).get(),
    sectionsCol(agencyId, groupId).get(),
  ]);
  return {
    channels: channelsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CommunityChannel)
      .sort((a, b) => a.order - b.order),
    sections: sectionsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CommunitySection)
      .sort((a, b) => a.order - b.order),
  };
}

export async function createAgencyChannelServerSide(
  input: CreateAgencyChannelInput,
): Promise<CommunityChannel> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Channel name is required");
  const existingSnap = await channelsCol(input.agencyId, input.groupId)
    .where("name", "==", name)
    .limit(1)
    .get();
  if (!existingSnap.empty) throw new Error("A channel with that name already exists");

  const allSnap = await channelsCol(input.agencyId, input.groupId).get();
  const order = allSnap.docs.reduce(
    (m, d) => Math.max(m, (d.data().order as number) ?? 0),
    -1,
  ) + 1;

  const doc = {
    groupId: input.groupId,
    name,
    icon: input.icon || "💬",
    description: (input.description ?? "").trim().slice(0, 500),
    private: input.private === true,
    readOnly: input.readOnly === true,
    sectionId: input.sectionId ?? null,
    channelType: "feed" as ChannelType,
    order,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await channelsCol(input.agencyId, input.groupId).add(doc);

  const group = await getAgencyGroupById(input.agencyId, input.groupId);
  if (group && !group.categories.includes(name)) {
    await groupDoc(input.agencyId, input.groupId).update({
      categories: [...group.categories, name],
    });
  }
  return { id: ref.id, ...doc } as CommunityChannel;
}

export interface UpdateAgencyChannelPatch {
  name?: string;
  icon?: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
  order?: number;
}

export async function updateAgencyChannelServerSide(
  agencyId: string,
  groupId: string,
  channelId: string,
  patch: UpdateAgencyChannelPatch,
): Promise<CommunityChannel> {
  const ref = channelsCol(agencyId, groupId).doc(channelId);
  const before = await ref.get();
  if (!before.exists) throw new Error("Channel not found");
  const beforeName = before.data()?.name as string;

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 500);
  if (patch.private !== undefined) update.private = patch.private;
  if (patch.readOnly !== undefined) update.readOnly = patch.readOnly;
  if (patch.sectionId !== undefined) update.sectionId = patch.sectionId;
  if (patch.order !== undefined) update.order = patch.order;

  let newName = beforeName;
  if (patch.name !== undefined) {
    newName = patch.name.trim().slice(0, 60);
    if (!newName) throw new Error("Channel name is required");
    update.name = newName;
  }
  await ref.update(update);

  if (newName !== beforeName) {
    // Cascade-rename posts using the old category name — same invariant
    // the tenant service maintains (a Channel's name IS the post category
    // string). Capped at 500 like the tenant version.
    const postsSnap = await postsCol(agencyId, groupId)
      .where("category", "==", beforeName)
      .limit(500)
      .get();
    if (!postsSnap.empty) {
      const batch = getAdminDb().batch();
      postsSnap.docs.forEach((d) => batch.update(d.ref, { category: newName }));
      await batch.commit();
    }
    const group = await getAgencyGroupById(agencyId, groupId);
    if (group) {
      const categories = group.categories.map((c) => (c === beforeName ? newName : c));
      await groupDoc(agencyId, groupId).update({ categories });
    }
  }

  const after = await ref.get();
  return { id: after.id, ...after.data() } as CommunityChannel;
}

export async function deleteAgencyChannelServerSide(
  agencyId: string,
  groupId: string,
  channelId: string,
): Promise<void> {
  await channelsCol(agencyId, groupId).doc(channelId).delete();
}

export interface CreateAgencySectionInput {
  agencyId: string;
  groupId: string;
  name: string;
  icon: string;
  private?: boolean;
}

export async function createAgencySectionServerSide(
  input: CreateAgencySectionInput,
): Promise<CommunitySection> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Section name is required");
  const allSnap = await sectionsCol(input.agencyId, input.groupId).get();
  const order = allSnap.docs.reduce(
    (m, d) => Math.max(m, (d.data().order as number) ?? 0),
    -1,
  ) + 1;
  const doc = {
    groupId: input.groupId,
    name,
    icon: input.icon || "📁",
    private: input.private === true,
    order,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await sectionsCol(input.agencyId, input.groupId).add(doc);
  return { id: ref.id, ...doc } as CommunitySection;
}

export interface UpdateAgencySectionPatch {
  name?: string;
  icon?: string;
  private?: boolean;
  order?: number;
}

export async function updateAgencySectionServerSide(
  agencyId: string,
  groupId: string,
  sectionId: string,
  patch: UpdateAgencySectionPatch,
): Promise<CommunitySection> {
  const ref = sectionsCol(agencyId, groupId).doc(sectionId);
  const before = await ref.get();
  if (!before.exists) throw new Error("Section not found");
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 60);
    if (!name) throw new Error("Section name is required");
    update.name = name;
  }
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.private !== undefined) update.private = patch.private;
  if (patch.order !== undefined) update.order = patch.order;
  await ref.update(update);
  const after = await ref.get();
  return { id: after.id, ...after.data() } as CommunitySection;
}

export async function deleteAgencySectionServerSide(
  agencyId: string,
  groupId: string,
  sectionId: string,
): Promise<void> {
  // Unsection every channel currently in this section — same behavior as
  // the tenant deleteSectionServerSide (channels/posts are never deleted).
  const channelsSnap = await channelsCol(agencyId, groupId)
    .where("sectionId", "==", sectionId)
    .get();
  if (!channelsSnap.empty) {
    const batch = getAdminDb().batch();
    channelsSnap.docs.forEach((d) => batch.update(d.ref, { sectionId: null }));
    await batch.commit();
  }
  await sectionsCol(agencyId, groupId).doc(sectionId).delete();
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
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await postsCol(input.agencyId, input.groupId).add(doc);
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

  await ref.update(update);
  const after = await ref.get();
  return { id: after.id, ...after.data() } as CommunityPost;
}

export async function deleteAgencyPostServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
): Promise<void> {
  await getAdminDb().recursiveDelete(postsCol(agencyId, groupId).doc(postId));
}

export async function listAgencyFeed(
  agencyId: string,
  groupId: string,
): Promise<CommunityPost[]> {
  const snap = await postsCol(agencyId, groupId).get();
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityPost);
  posts.sort((a, b) => {
    const am = a.createdAt as { toMillis?: () => number } | null;
    const bm = b.createdAt as { toMillis?: () => number } | null;
    return (bm?.toMillis?.() ?? 0) - (am?.toMillis?.() ?? 0);
  });
  return posts;
}

export async function getAgencyPost(
  agencyId: string,
  groupId: string,
  postId: string,
): Promise<CommunityPost | null> {
  const snap = await postsCol(agencyId, groupId).doc(postId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CommunityPost;
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
 *  `likes/{memberId}` subcollection, keyed by Firebase uid instead. */
export async function toggleAgencyPostLikeServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  uid: string,
): Promise<{ liked: boolean }> {
  const db = getAdminDb();
  const postRef = postsCol(agencyId, groupId).doc(postId);
  const likeRef = postRef.collection("likes").doc(uid);
  return db.runTransaction(async (tx) => {
    const likeSnap = await tx.get(likeRef);
    const liked = !likeSnap.exists;
    if (liked) {
      tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
      tx.update(postRef, { likeCount: FieldValue.increment(1) });
    } else {
      tx.delete(likeRef);
      tx.update(postRef, { likeCount: FieldValue.increment(-1) });
    }
    return { liked };
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

  // A reply always resolves to the SAME top-level parent — same rule the
  // tenant service enforces.
  let parentId: string | null = input.parentId ?? null;
  if (parentId) {
    const parentSnap = await commentsCol(input.agencyId, input.groupId, input.postId)
      .doc(parentId)
      .get();
    const grandparent = parentSnap.data()?.parentId as string | null | undefined;
    if (grandparent) parentId = grandparent;
  }

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
  await getAdminDb().recursiveDelete(commentsCol(agencyId, groupId, postId).doc(commentId));
  await postRef.update({ commentCount: FieldValue.increment(-1) });
}

export async function toggleAgencyCommentLikeServerSide(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
  uid: string,
): Promise<{ liked: boolean }> {
  const db = getAdminDb();
  const commentRef = commentsCol(agencyId, groupId, postId).doc(commentId);
  const likeRef = commentRef.collection("likes").doc(uid);
  return db.runTransaction(async (tx) => {
    const likeSnap = await tx.get(likeRef);
    const liked = !likeSnap.exists;
    if (liked) {
      tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
      tx.update(commentRef, { likeCount: FieldValue.increment(1) });
    } else {
      tx.delete(likeRef);
      tx.update(commentRef, { likeCount: FieldValue.increment(-1) });
    }
    return { liked };
  });
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
  source: "manual" | "customer" | "affiliate" | "plan_cohort";
  status: "pending" | "active" | "removed";
  invitedByUid: string;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  activatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
}

export async function listAgencyGroupMembers(
  agencyId: string,
  groupId: string,
): Promise<AgencyGroupMemberRoster[]> {
  const snap = await membersCol(agencyId, groupId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgencyGroupMemberRoster);
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
