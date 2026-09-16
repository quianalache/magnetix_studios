import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { sanitizeCommunityPostHtml, sanitizeCommunityCommentHtml } from "@/lib/community/post-html";
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
 * Membership: agency communities have no Member/session identity system
 * (the existing one is hard-bound to a subAccountId — see
 * member-session.ts). The only real "user" of an agency community today is
 * the agency owner, authenticated the same way as every other Agency
 * route (`requireAgencyOwnerAny`) — no separate Member doc, no
 * GroupMembership, no session cookie. `members/{id}` below is a ROSTER of
 * eligible people for a FUTURE login/access system, not a working
 * authorization mechanism — do not treat its presence as granting access.
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

/** Resolves the agency owner's display name/avatar once, for denormalizing
 *  onto posts/comments — agency communities have no Member doc to hydrate
 *  authors from (see module comment), so this is captured at write time. */
async function resolveAuthorDisplay(
  uid: string,
): Promise<{ displayName: string; avatarUrl: string | null }> {
  try {
    const user = await getAdminAuth().getUser(uid);
    return {
      displayName: user.displayName || user.email || "Agency owner",
      avatarUrl: user.photoURL ?? null,
    };
  } catch {
    return { displayName: "Agency owner", avatarUrl: null };
  }
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
  authorUid: string;
  title: string;
  body: string;
  category: string | null;
  attachments?: MediaAttachment[];
  commentsDisabled?: boolean;
}

export async function createAgencyPostServerSide(
  input: CreateAgencyPostInput,
): Promise<CommunityPost> {
  const author = await resolveAuthorDisplay(input.authorUid);
  const doc = {
    agencyId: input.agencyId,
    groupId: input.groupId,
    authorMemberId: input.authorUid,
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
  authorUid: string;
  body: string;
  parentId?: string | null;
  attachments?: MediaAttachment[];
}

export async function createAgencyCommentServerSide(
  input: CreateAgencyCommentInput,
): Promise<CommunityComment> {
  const author = await resolveAuthorDisplay(input.authorUid);
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
    authorMemberId: input.authorUid,
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

// ---------------------------------------------------- Membership roster --

/**
 * A roster entry — NOT a working login/access grant (see module comment).
 * `source` is the seam section 9 of the Agency Community task asked for:
 * a future automatic-enrollment system (all customers, all affiliates)
 * writes the same shape with a different `source`, without this type
 * needing to change.
 */
export interface AgencyGroupMemberRoster {
  id: string;
  agencyId: string;
  groupId: string;
  email: string;
  displayName: string | null;
  source: "manual" | "customer" | "affiliate" | "plan_cohort";
  status: "active" | "removed";
  invitedByUid: string;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
}

export async function listAgencyGroupMembers(
  agencyId: string,
  groupId: string,
): Promise<AgencyGroupMemberRoster[]> {
  const snap = await membersCol(agencyId, groupId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgencyGroupMemberRoster);
}

export async function addAgencyGroupMemberServerSide(opts: {
  agencyId: string;
  groupId: string;
  email: string;
  displayName?: string | null;
  invitedByUid: string;
}): Promise<AgencyGroupMemberRoster> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required");
  const existing = await membersCol(opts.agencyId, opts.groupId)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existing.empty) throw new Error("Already on the roster");

  const doc = {
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    email,
    displayName: opts.displayName?.trim() || null,
    source: "manual" as const,
    status: "active" as const,
    invitedByUid: opts.invitedByUid,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await membersCol(opts.agencyId, opts.groupId).add(doc);
  await groupDoc(opts.agencyId, opts.groupId).update({
    memberCount: FieldValue.increment(1),
  });
  return { id: ref.id, ...doc } as AgencyGroupMemberRoster;
}

export async function removeAgencyGroupMemberServerSide(
  agencyId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  await membersCol(agencyId, groupId).doc(memberId).delete();
  await groupDoc(agencyId, groupId).update({
    memberCount: FieldValue.increment(-1),
  });
}
