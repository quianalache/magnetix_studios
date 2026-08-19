import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getGroupById, updateGroupServerSide } from "@/lib/server/community-service";
import type { ChannelType, CommunityChannel, CommunitySection } from "@/types/community";

/**
 * Left rail Channels/Sections data layer. See `CommunityChannel`'s own
 * module comment (types/community.ts) for the full architecture rationale
 * — short version: a Channel's `name` IS the plain `category` string every
 * post already uses, so this is a metadata layer on top of the existing
 * post/feed model, not a migration of it.
 */

function channelsCol(saId: string, groupId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/communityGroups/${groupId}/channels`);
}

function sectionsCol(saId: string, groupId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/communityGroups/${groupId}/sections`);
}

function docToChannel(id: string, data: FirebaseFirestore.DocumentData): CommunityChannel {
  return {
    id,
    subAccountId: data.subAccountId,
    groupId: data.groupId,
    name: data.name,
    icon: data.icon ?? "💬",
    description: data.description ?? "",
    private: !!data.private,
    readOnly: !!data.readOnly,
    sectionId: data.sectionId ?? null,
    channelType: (data.channelType as ChannelType) ?? "feed",
    order: typeof data.order === "number" ? data.order : 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

function docToSection(id: string, data: FirebaseFirestore.DocumentData): CommunitySection {
  return {
    id,
    subAccountId: data.subAccountId,
    groupId: data.groupId,
    name: data.name,
    icon: data.icon ?? "📁",
    private: !!data.private,
    order: typeof data.order === "number" ? data.order : 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * Lazily backfills a real `CommunityChannel` doc for any `group.categories`
 * entry that doesn't have one yet — the ONE-TIME-migration-free way every
 * pre-existing community (whose only "channel" concept was ever the flat
 * `categories` array) ends up with real Channel metadata the first time
 * its left rail is rendered, without a migration script. Idempotent: safe
 * to call on every read. Returns the up-to-date channel list so callers
 * that already need it don't have to re-query.
 */
export async function ensureChannelsForGroup(
  saId: string,
  groupId: string,
): Promise<CommunityChannel[]> {
  const group = await getGroupById(saId, groupId);
  const categories = group?.categories ?? [];
  const snap = await channelsCol(saId, groupId).get();
  const existing = snap.docs.map((d) => docToChannel(d.id, d.data()));
  const existingNames = new Set(existing.map((c) => c.name));
  const missing = categories.filter((c) => !existingNames.has(c));
  if (missing.length === 0) return existing;

  const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), -1);
  const db = getAdminDb();
  const batch = db.batch();
  const created: CommunityChannel[] = [];
  missing.forEach((name, i) => {
    const ref = channelsCol(saId, groupId).doc();
    const order = maxOrder + 1 + i;
    const doc = {
      subAccountId: saId,
      groupId,
      name,
      icon: "💬",
      description: "",
      private: false,
      readOnly: false,
      sectionId: null,
      channelType: "feed" as ChannelType,
      order,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.set(ref, doc);
    created.push({ id: ref.id, ...doc, createdAt: null, updatedAt: null });
  });
  await batch.commit();
  return [...existing, ...created];
}

export interface ChannelsAndSections {
  sections: CommunitySection[];
  channels: CommunityChannel[];
}

/**
 * The left rail's one read — sections + channels, already filtered for the
 * viewer (Part "Private Section"/"Private Channel"): a non-moderator never
 * sees a private Section's heading, never sees a Channel nested inside a
 * private Section (regardless of that Channel's OWN `private` value —
 * Section privacy is an additional gate layered on top, not a replacement
 * for Channel-level rules), and never sees a Channel whose own `private`
 * is true. Both lists are sorted by `order`.
 */
export async function listChannelsAndSectionsForViewer(opts: {
  subAccountId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<ChannelsAndSections> {
  const [channels, sectionsSnap] = await Promise.all([
    ensureChannelsForGroup(opts.subAccountId, opts.groupId),
    sectionsCol(opts.subAccountId, opts.groupId).get(),
  ]);
  let sections = sectionsSnap.docs.map((d) => docToSection(d.id, d.data()));
  sections.sort((a, b) => a.order - b.order);
  let filteredChannels = channels;

  if (!opts.isModerator) {
    const privateSectionIds = new Set(sections.filter((s) => s.private).map((s) => s.id));
    sections = sections.filter((s) => !s.private);
    filteredChannels = channels.filter(
      (c) => !c.private && !(c.sectionId && privateSectionIds.has(c.sectionId)),
    );
  }

  filteredChannels = [...filteredChannels].sort((a, b) => a.order - b.order);
  return { sections, channels: filteredChannels };
}

/**
 * Every channel NAME (the string a post's `category` field would hold)
 * that a non-moderator viewer must never see a post from — private
 * channels, plus every channel nested in a private section. Used by
 * `listFeed`/`getFeedPost` (community-feed-service.ts) to enforce "must
 * not be able to load its posts / navigate directly to it by URL" at the
 * actual post-read layer, not just by hiding the left-rail link.
 * Moderators always get an empty set (nothing is hidden from them).
 */
export async function getInaccessibleChannelNames(opts: {
  subAccountId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<Set<string>> {
  if (opts.isModerator) return new Set();
  const { channels } = await listChannelsAndSectionsForViewer(opts);
  const visibleNames = new Set(channels.map((c) => c.name));
  const allChannels = await ensureChannelsForGroup(opts.subAccountId, opts.groupId);
  const inaccessible = new Set<string>();
  for (const c of allChannels) {
    if (!visibleNames.has(c.name)) inaccessible.add(c.name);
  }
  return inaccessible;
}

/** Single-channel lookup by name — the post create/edit routes' own
 *  Read-Only/Private enforcement point (a post targets a channel by name,
 *  same as it always targeted a plain category string). `null` = no
 *  channel with that name exists yet (shouldn't normally happen once
 *  `ensureChannelsForGroup` has run, but a stale/hand-crafted request
 *  claiming an unknown category is handled the same defensive way the
 *  existing `categories.includes(...)` check already did). */
export async function getChannelByName(
  saId: string,
  groupId: string,
  name: string,
): Promise<CommunityChannel | null> {
  const snap = await channelsCol(saId, groupId).where("name", "==", name).limit(1).get();
  if (snap.empty) return null;
  return docToChannel(snap.docs[0].id, snap.docs[0].data());
}

async function nameTaken(saId: string, groupId: string, name: string, excludeId?: string) {
  const snap = await channelsCol(saId, groupId).where("name", "==", name).limit(2).get();
  return snap.docs.some((d) => d.id !== excludeId);
}

export interface CreateChannelInput {
  subAccountId: string;
  groupId: string;
  name: string;
  icon: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
}

export async function createChannelServerSide(input: CreateChannelInput): Promise<CommunityChannel> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Channel name is required");
  if (await nameTaken(input.subAccountId, input.groupId, name)) {
    throw new Error("A channel with that name already exists");
  }
  const existing = await ensureChannelsForGroup(input.subAccountId, input.groupId);
  const order = existing.reduce((m, c) => Math.max(m, c.order), -1) + 1;

  const doc = {
    subAccountId: input.subAccountId,
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
  const ref = await channelsCol(input.subAccountId, input.groupId).add(doc);

  // Keep CommunityGroup.categories (the flat name list every existing
  // post-create/edit validation + the feed's own ?c= filter already read)
  // in sync — see the module comment on CommunityChannel for why this
  // dual-write exists instead of migrating those call sites.
  const group = await getGroupById(input.subAccountId, input.groupId);
  if (group && !group.categories.includes(name)) {
    await updateGroupServerSide({
      subAccountId: input.subAccountId,
      groupId: input.groupId,
      patch: { categories: [...group.categories, name] },
    });
  }

  return { id: ref.id, ...doc, createdAt: null, updatedAt: null };
}

export interface UpdateChannelPatch {
  name?: string;
  icon?: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
  order?: number;
}

/** Batch-renames every post currently using `oldName` as its `category` to
 *  `newName` — the mechanism that keeps "a post's category always matches
 *  a real channel name" true even after a rename, instead of orphaning
 *  existing posts' category strings. Capped at Firestore's 500-op batch
 *  limit; communities with more posts in one channel than that are a real,
 *  disclosed limitation (see the Channels feature report), not silently
 *  incomplete — logged loudly rather than silently truncated. */
async function cascadeRenamePostsCategory(
  saId: string,
  groupId: string,
  oldName: string,
  newName: string,
) {
  const postsSnap = await getAdminDb()
    .collection(`subAccounts/${saId}/communityGroups/${groupId}/posts`)
    .where("category", "==", oldName)
    .limit(500)
    .get();
  if (postsSnap.empty) return;
  if (postsSnap.size >= 500) {
    console.error(
      `[community-channels] cascadeRenamePostsCategory hit the 500-doc batch cap for ${saId}/${groupId} "${oldName}" -> "${newName}" — some posts may still carry the old category name.`,
    );
  }
  const batch = getAdminDb().batch();
  postsSnap.docs.forEach((d) => batch.update(d.ref, { category: newName }));
  await batch.commit();
}

export async function updateChannelServerSide(
  saId: string,
  groupId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<CommunityChannel | null> {
  const ref = channelsCol(saId, groupId).doc(channelId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const existing = docToChannel(snap.id, snap.data()!);

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  let renamedFrom: string | null = null;

  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 60);
    if (!name) throw new Error("Channel name is required");
    if (name !== existing.name) {
      if (await nameTaken(saId, groupId, name, channelId)) {
        throw new Error("A channel with that name already exists");
      }
      updates.name = name;
      renamedFrom = existing.name;
    }
  }
  if (typeof patch.icon === "string") updates.icon = patch.icon || existing.icon;
  if (typeof patch.description === "string") updates.description = patch.description.trim().slice(0, 500);
  if (typeof patch.private === "boolean") updates.private = patch.private;
  if (typeof patch.readOnly === "boolean") updates.readOnly = patch.readOnly;
  if (patch.sectionId !== undefined) updates.sectionId = patch.sectionId;
  if (typeof patch.order === "number") updates.order = patch.order;

  await ref.update(updates);

  if (renamedFrom) {
    const newName = updates.name as string;
    await cascadeRenamePostsCategory(saId, groupId, renamedFrom, newName);
    const group = await getGroupById(saId, groupId);
    if (group) {
      const nextCategories = group.categories.map((c) => (c === renamedFrom ? newName : c));
      await updateGroupServerSide({
        subAccountId: saId,
        groupId,
        patch: { categories: Array.from(new Set(nextCategories)) },
      });
    }
  }

  const fresh = await ref.get();
  return docToChannel(fresh.id, fresh.data()!);
}

export type DeleteChannelResult = { ok: true } | { ok: false; error: string };

/** Blocks deletion if the channel has any posts (Part "Delete Channel" —
 *  the explicitly sanctioned safe default when there's no reassignment
 *  flow: block rather than silently cascade-delete real content). */
export async function deleteChannelServerSide(
  saId: string,
  groupId: string,
  channelId: string,
): Promise<DeleteChannelResult> {
  const ref = channelsCol(saId, groupId).doc(channelId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Channel not found" };
  const channel = docToChannel(snap.id, snap.data()!);

  const postsSnap = await getAdminDb()
    .collection(`subAccounts/${saId}/communityGroups/${groupId}/posts`)
    .where("category", "==", channel.name)
    .limit(1)
    .get();
  if (!postsSnap.empty) {
    return {
      ok: false,
      error: "This channel has posts in it. Move or delete them before deleting the channel.",
    };
  }

  await ref.delete();
  const group = await getGroupById(saId, groupId);
  if (group && group.categories.includes(channel.name)) {
    await updateGroupServerSide({
      subAccountId: saId,
      groupId,
      patch: { categories: group.categories.filter((c) => c !== channel.name) },
    });
  }
  return { ok: true };
}

export interface CreateSectionInput {
  subAccountId: string;
  groupId: string;
  name: string;
  icon: string;
  private?: boolean;
}

export async function createSectionServerSide(input: CreateSectionInput): Promise<CommunitySection> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Section name is required");
  const existingSnap = await sectionsCol(input.subAccountId, input.groupId).get();
  const order = existingSnap.docs.reduce(
    (m, d) => Math.max(m, typeof d.data().order === "number" ? d.data().order : 0),
    -1,
  ) + 1;

  const doc = {
    subAccountId: input.subAccountId,
    groupId: input.groupId,
    name,
    icon: input.icon || "📁",
    private: input.private === true,
    order,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await sectionsCol(input.subAccountId, input.groupId).add(doc);
  return { id: ref.id, ...doc, createdAt: null, updatedAt: null };
}

export interface UpdateSectionPatch {
  name?: string;
  icon?: string;
  private?: boolean;
  order?: number;
}

export async function updateSectionServerSide(
  saId: string,
  groupId: string,
  sectionId: string,
  patch: UpdateSectionPatch,
): Promise<CommunitySection | null> {
  const ref = sectionsCol(saId, groupId).doc(sectionId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 60);
    if (!name) throw new Error("Section name is required");
    updates.name = name;
  }
  if (typeof patch.icon === "string") updates.icon = patch.icon;
  if (typeof patch.private === "boolean") updates.private = patch.private;
  if (typeof patch.order === "number") updates.order = patch.order;

  await ref.update(updates);
  const fresh = await ref.get();
  return docToSection(fresh.id, fresh.data()!);
}

/** Deleting a Section never deletes its Channels — they become
 *  unsectioned, content and all existing relationships intact (Part
 *  "Delete Section"'s explicit safe default). */
export async function deleteSectionServerSide(
  saId: string,
  groupId: string,
  sectionId: string,
): Promise<{ ok: true; unsectionedCount: number } | { ok: false; error: string }> {
  const ref = sectionsCol(saId, groupId).doc(sectionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Section not found" };

  const channelsSnap = await channelsCol(saId, groupId).where("sectionId", "==", sectionId).get();
  const batch = getAdminDb().batch();
  channelsSnap.docs.forEach((d) => batch.update(d.ref, { sectionId: null, updatedAt: FieldValue.serverTimestamp() }));
  batch.delete(ref);
  await batch.commit();
  return { ok: true, unsectionedCount: channelsSnap.size };
}
