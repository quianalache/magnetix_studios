import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  communityGroupsRoot,
  tenantScope,
  agencyScope,
  type CommunityOwnerScope,
} from "@/lib/server/community-scope";
import type { ChannelType, CommunityChannel, CommunitySection } from "@/types/community";

/**
 * Left rail Channels/Sections data layer — Community Shared Architecture
 * Phase 1 (2026-09-19). This is now the ONE place Channel/Section business
 * logic (create/update/delete, ordering, private/read-only state,
 * name-uniqueness, category-list sync, cascade-rename) lives for BOTH
 * tenant and Agency Community, parameterized by `CommunityOwnerScope`
 * (see community-scope.ts). Every exported tenant function below keeps its
 * exact pre-existing signature — no tenant call site changes. The Agency
 * equivalents in community-agency-service.ts (`createAgencyChannelServerSide`
 * etc.) now delegate to the `*ByScope` functions here instead of carrying
 * their own second implementation — see that file's own updated doc
 * comments at each function for what changed.
 *
 * One deliberate, disclosed behavior change from consolidating onto ONE
 * implementation: the Agency channel-rename path previously had no
 * duplicate-name guard (only channel CREATION checked for an existing
 * name) — a gap, not an intentional scope difference. The shared
 * `updateChannelServerSideByScope` now enforces the SAME uniqueness rule
 * tenant always had on rename, for both scopes, since "a channel name is
 * unique within its community" is a business rule, not a tenant-only one.
 * See the Phase 1 report's "Duplicated Logic Removed" section.
 *
 * See `CommunityChannel`'s own module comment (types/community.ts) for the
 * full architecture rationale — short version: a Channel's `name` IS the
 * plain `category` string every post already uses, so this is a metadata
 * layer on top of the existing post/feed model, not a migration of it.
 */

function channelsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${communityGroupsRoot(scope)}/${groupId}/channels`);
}

function sectionsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${communityGroupsRoot(scope)}/${groupId}/sections`);
}

function postsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${communityGroupsRoot(scope)}/${groupId}/posts`);
}

/** Categories are read/written directly against the group doc's own
 *  `categories` field regardless of scope — deliberately NOT routed through
 *  `getGroupById`/`updateGroupServerSide` (tenant-only) or
 *  `getAgencyGroupById`/`updateAgencyGroupServerSide` (agency-only, and
 *  importing either here from community-agency-service.ts would be a
 *  needless cross-file coupling for one array field) to keep this module
 *  free of a circular import in either direction. */
async function getGroupCategories(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<string[]> {
  const snap = await getAdminDb().doc(`${communityGroupsRoot(scope)}/${groupId}`).get();
  return (snap.data()?.categories as string[] | undefined) ?? [];
}

async function setGroupCategories(
  scope: CommunityOwnerScope,
  groupId: string,
  categories: string[],
): Promise<void> {
  await getAdminDb()
    .doc(`${communityGroupsRoot(scope)}/${groupId}`)
    .update({ categories, updatedAt: FieldValue.serverTimestamp() });
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
 * Lazily backfills a real `CommunityChannel` doc for any legacy
 * `group.categories` entry that doesn't have one yet. Tenant-only
 * behavior, preserved exactly: every pre-Channels-feature tenant community
 * had only a flat `categories` array, so this idempotent backfill is what
 * gives it real Channel metadata the first time its left rail renders,
 * with no migration script. Agency Community was built AFTER the Channels
 * feature existed — every agency group has always had real Channel docs
 * from creation, so there is no legacy state to backfill from; agency
 * scope skips this and just lists what already exists (see
 * `listChannelsByScope` below), exactly matching its pre-consolidation
 * behavior.
 */
async function ensureChannelsForGroupByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<CommunityChannel[]> {
  if (scope.kind === "agency") return listChannelsByScope(scope, groupId);

  const [categories, snap] = await Promise.all([
    getGroupCategories(scope, groupId),
    channelsColByScope(scope, groupId).get(),
  ]);
  const existing = snap.docs.map((d) => docToChannel(d.id, d.data()));
  const existingNames = new Set(existing.map((c) => c.name));
  const missing = categories.filter((c) => !existingNames.has(c));
  if (missing.length === 0) return existing;

  const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), -1);
  const db = getAdminDb();
  const batch = db.batch();
  const created: CommunityChannel[] = [];
  missing.forEach((name, i) => {
    const ref = channelsColByScope(scope, groupId).doc();
    const order = maxOrder + 1 + i;
    const doc = {
      subAccountId: scope.kind === "subAccount" ? scope.subAccountId : undefined,
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

async function listChannelsByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<CommunityChannel[]> {
  const snap = await channelsColByScope(scope, groupId).get();
  return snap.docs
    .map((d) => docToChannel(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

export interface ChannelsAndSections {
  sections: CommunitySection[];
  channels: CommunityChannel[];
}

/**
 * The left rail's one read — sections + channels, already filtered for the
 * viewer: a non-moderator never sees a private Section's heading, never
 * sees a Channel nested inside a private Section (regardless of that
 * Channel's OWN `private` value — Section privacy is an additional gate
 * layered on top, not a replacement for Channel-level rules), and never
 * sees a Channel whose own `private` is true. Both lists are sorted by
 * `order`. Shared core for both scopes.
 */
async function listChannelsAndSectionsForViewerByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  isModerator: boolean;
}): Promise<ChannelsAndSections> {
  const [channels, sectionsSnap] = await Promise.all([
    ensureChannelsForGroupByScope(opts.scope, opts.groupId),
    sectionsColByScope(opts.scope, opts.groupId).get(),
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
 * channels, plus every channel nested in a private section. Shared core
 * for both scopes; moderators always get an empty set.
 */
async function getInaccessibleChannelNamesByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  isModerator: boolean;
}): Promise<Set<string>> {
  if (opts.isModerator) return new Set();
  const { channels } = await listChannelsAndSectionsForViewerByScope(opts);
  const visibleNames = new Set(channels.map((c) => c.name));
  const allChannels = await ensureChannelsForGroupByScope(opts.scope, opts.groupId);
  const inaccessible = new Set<string>();
  for (const c of allChannels) {
    if (!visibleNames.has(c.name)) inaccessible.add(c.name);
  }
  return inaccessible;
}

async function getChannelByNameByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  name: string,
): Promise<CommunityChannel | null> {
  const snap = await channelsColByScope(scope, groupId).where("name", "==", name).limit(1).get();
  if (snap.empty) return null;
  return docToChannel(snap.docs[0].id, snap.docs[0].data());
}

/** `excludeId` omitted on create (nothing to exclude yet); passed on rename
 *  so a channel doesn't collide with its own unchanged name. */
async function nameTakenByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const snap = await channelsColByScope(scope, groupId).where("name", "==", name).limit(2).get();
  return snap.docs.some((d) => d.id !== excludeId);
}

export interface CreateChannelByScopeInput {
  scope: CommunityOwnerScope;
  groupId: string;
  name: string;
  icon: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
}

async function createChannelServerSideByScope(
  input: CreateChannelByScopeInput,
): Promise<CommunityChannel> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Channel name is required");
  if (await nameTakenByScope(input.scope, input.groupId, name)) {
    throw new Error("A channel with that name already exists");
  }
  const existing = await ensureChannelsForGroupByScope(input.scope, input.groupId);
  const order = existing.reduce((m, c) => Math.max(m, c.order), -1) + 1;

  const doc = {
    subAccountId: input.scope.kind === "subAccount" ? input.scope.subAccountId : undefined,
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
  const ref = await channelsColByScope(input.scope, input.groupId).add(doc);

  // Keep CommunityGroup.categories (the flat name list every existing
  // post-create/edit validation + the feed's own ?c= filter already read)
  // in sync — see the module comment on CommunityChannel for why this
  // dual-write exists instead of migrating those call sites.
  const categories = await getGroupCategories(input.scope, input.groupId);
  if (!categories.includes(name)) {
    await setGroupCategories(input.scope, input.groupId, [...categories, name]);
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
async function cascadeRenamePostsCategoryByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  oldName: string,
  newName: string,
) {
  const postsSnap = await postsColByScope(scope, groupId)
    .where("category", "==", oldName)
    .limit(500)
    .get();
  if (postsSnap.empty) return;
  if (postsSnap.size >= 500) {
    console.error(
      `[community-channels] cascadeRenamePostsCategory hit the 500-doc batch cap for ${communityGroupsRoot(scope)}/${groupId} "${oldName}" -> "${newName}" — some posts may still carry the old category name.`,
    );
  }
  const batch = getAdminDb().batch();
  postsSnap.docs.forEach((d) => batch.update(d.ref, { category: newName }));
  await batch.commit();
}

async function updateChannelServerSideByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<CommunityChannel | null> {
  const ref = channelsColByScope(scope, groupId).doc(channelId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const existing = docToChannel(snap.id, snap.data()!);

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  let renamedFrom: string | null = null;

  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 60);
    if (!name) throw new Error("Channel name is required");
    if (name !== existing.name) {
      if (await nameTakenByScope(scope, groupId, name, channelId)) {
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
    await cascadeRenamePostsCategoryByScope(scope, groupId, renamedFrom, newName);
    const categories = await getGroupCategories(scope, groupId);
    const nextCategories = categories.map((c) => (c === renamedFrom ? newName : c));
    await setGroupCategories(scope, groupId, Array.from(new Set(nextCategories)));
  }

  const fresh = await ref.get();
  return docToChannel(fresh.id, fresh.data()!);
}

export type DeleteChannelResult = { ok: true } | { ok: false; error: string };

/**
 * Blocks deletion if the channel has any posts — the explicitly sanctioned
 * tenant safe default when there's no reassignment flow: block rather than
 * silently cascade-delete real content. Shared core for both scopes, BUT
 * the posts-in-use guard is deliberately gated on `guardPostsInUse` rather
 * than applied unconditionally: the pre-consolidation Agency
 * implementation deleted unconditionally, with no such guard, and this
 * phase's explicit "preserve existing behavior" constraint means that
 * difference is preserved here rather than silently tightened — see the
 * Phase 1 report's "Duplicated Logic Removed" for the one guard this pass
 * DID unify (channel-rename name-uniqueness) versus this one, which it
 * deliberately did not.
 */
async function deleteChannelServerSideByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  channelId: string,
  guardPostsInUse: boolean,
): Promise<DeleteChannelResult> {
  const ref = channelsColByScope(scope, groupId).doc(channelId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Channel not found" };
  const channel = docToChannel(snap.id, snap.data()!);

  if (guardPostsInUse) {
    const postsSnap = await postsColByScope(scope, groupId)
      .where("category", "==", channel.name)
      .limit(1)
      .get();
    if (!postsSnap.empty) {
      return {
        ok: false,
        error: "This channel has posts in it. Move or delete them before deleting the channel.",
      };
    }
  }

  await ref.delete();
  const categories = await getGroupCategories(scope, groupId);
  if (categories.includes(channel.name)) {
    await setGroupCategories(
      scope,
      groupId,
      categories.filter((c) => c !== channel.name),
    );
  }
  return { ok: true };
}

export interface CreateSectionByScopeInput {
  scope: CommunityOwnerScope;
  groupId: string;
  name: string;
  icon: string;
  private?: boolean;
}

async function createSectionServerSideByScope(
  input: CreateSectionByScopeInput,
): Promise<CommunitySection> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Section name is required");
  const existingSnap = await sectionsColByScope(input.scope, input.groupId).get();
  const order =
    existingSnap.docs.reduce(
      (m, d) => Math.max(m, typeof d.data().order === "number" ? d.data().order : 0),
      -1,
    ) + 1;

  const doc = {
    subAccountId: input.scope.kind === "subAccount" ? input.scope.subAccountId : undefined,
    groupId: input.groupId,
    name,
    icon: input.icon || "📁",
    private: input.private === true,
    order,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await sectionsColByScope(input.scope, input.groupId).add(doc);
  return { id: ref.id, ...doc, createdAt: null, updatedAt: null };
}

export interface UpdateSectionPatch {
  name?: string;
  icon?: string;
  private?: boolean;
  order?: number;
}

async function updateSectionServerSideByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  sectionId: string,
  patch: UpdateSectionPatch,
): Promise<CommunitySection | null> {
  const ref = sectionsColByScope(scope, groupId).doc(sectionId);
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
 *  unsectioned, content and all existing relationships intact. Shared
 *  core for both scopes. */
async function deleteSectionServerSideByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  sectionId: string,
): Promise<{ ok: true; unsectionedCount: number } | { ok: false; error: string }> {
  const ref = sectionsColByScope(scope, groupId).doc(sectionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Section not found" };

  const channelsSnap = await channelsColByScope(scope, groupId).where("sectionId", "==", sectionId).get();
  const batch = getAdminDb().batch();
  channelsSnap.docs.forEach((d) =>
    batch.update(d.ref, { sectionId: null, updatedAt: FieldValue.serverTimestamp() }),
  );
  batch.delete(ref);
  await batch.commit();
  return { ok: true, unsectionedCount: channelsSnap.size };
}

// -------------------------------------------------------------------------
// Tenant-facing exports — EXACT pre-existing signatures, every tenant call
// site (routes, community-feed-service.ts, etc.) is unchanged. Each is now
// a thin wrapper around the shared `*ByScope` core above.
// -------------------------------------------------------------------------

export async function ensureChannelsForGroup(
  saId: string,
  groupId: string,
): Promise<CommunityChannel[]> {
  return ensureChannelsForGroupByScope(tenantScope(saId), groupId);
}

export async function listChannelsAndSectionsForViewer(opts: {
  subAccountId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<ChannelsAndSections> {
  return listChannelsAndSectionsForViewerByScope({
    scope: tenantScope(opts.subAccountId),
    groupId: opts.groupId,
    isModerator: opts.isModerator,
  });
}

export async function getInaccessibleChannelNames(opts: {
  subAccountId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<Set<string>> {
  return getInaccessibleChannelNamesByScope({
    scope: tenantScope(opts.subAccountId),
    groupId: opts.groupId,
    isModerator: opts.isModerator,
  });
}

export async function getChannelByName(
  saId: string,
  groupId: string,
  name: string,
): Promise<CommunityChannel | null> {
  return getChannelByNameByScope(tenantScope(saId), groupId, name);
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
  return createChannelServerSideByScope({ ...input, scope: tenantScope(input.subAccountId) });
}

export async function updateChannelServerSide(
  saId: string,
  groupId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<CommunityChannel | null> {
  return updateChannelServerSideByScope(tenantScope(saId), groupId, channelId, patch);
}

export async function deleteChannelServerSide(
  saId: string,
  groupId: string,
  channelId: string,
): Promise<DeleteChannelResult> {
  return deleteChannelServerSideByScope(tenantScope(saId), groupId, channelId, true);
}

export interface CreateSectionInput {
  subAccountId: string;
  groupId: string;
  name: string;
  icon: string;
  private?: boolean;
}

export async function createSectionServerSide(input: CreateSectionInput): Promise<CommunitySection> {
  return createSectionServerSideByScope({ ...input, scope: tenantScope(input.subAccountId) });
}

export async function updateSectionServerSide(
  saId: string,
  groupId: string,
  sectionId: string,
  patch: UpdateSectionPatch,
): Promise<CommunitySection | null> {
  return updateSectionServerSideByScope(tenantScope(saId), groupId, sectionId, patch);
}

export async function deleteSectionServerSide(
  saId: string,
  groupId: string,
  sectionId: string,
): Promise<{ ok: true; unsectionedCount: number } | { ok: false; error: string }> {
  return deleteSectionServerSideByScope(tenantScope(saId), groupId, sectionId);
}

// -------------------------------------------------------------------------
// Agency-facing exports — same shared core, agency scope. Called from
// community-agency-service.ts's own (now-thin) Agency-named wrappers,
// which keep THEIR pre-existing exported signatures unchanged for the
// Agency Community API dispatcher — see that file.
// -------------------------------------------------------------------------

export async function listChannelsAndSectionsForAgencyGroup(
  agencyId: string,
  groupId: string,
): Promise<ChannelsAndSections> {
  const channels = await listChannelsByScope(agencyScope(agencyId), groupId);
  const sectionsSnap = await sectionsColByScope(agencyScope(agencyId), groupId).get();
  const sections = sectionsSnap.docs
    .map((d) => docToSection(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
  return { channels, sections };
}

export async function listChannelsAndSectionsForAgencyViewer(opts: {
  agencyId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<ChannelsAndSections> {
  return listChannelsAndSectionsForViewerByScope({
    scope: agencyScope(opts.agencyId),
    groupId: opts.groupId,
    isModerator: opts.isModerator,
  });
}

export async function getInaccessibleAgencyChannelNames(opts: {
  agencyId: string;
  groupId: string;
  isModerator: boolean;
}): Promise<Set<string>> {
  return getInaccessibleChannelNamesByScope({
    scope: agencyScope(opts.agencyId),
    groupId: opts.groupId,
    isModerator: opts.isModerator,
  });
}

export async function getAgencyChannelByNameShared(
  agencyId: string,
  groupId: string,
  name: string,
): Promise<CommunityChannel | null> {
  return getChannelByNameByScope(agencyScope(agencyId), groupId, name);
}

export interface CreateAgencyChannelByScopeInput {
  agencyId: string;
  groupId: string;
  name: string;
  icon: string;
  description?: string;
  private?: boolean;
  readOnly?: boolean;
  sectionId?: string | null;
}

export async function createAgencyChannelShared(
  input: CreateAgencyChannelByScopeInput,
): Promise<CommunityChannel> {
  return createChannelServerSideByScope({ ...input, scope: agencyScope(input.agencyId) });
}

export async function updateAgencyChannelShared(
  agencyId: string,
  groupId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<CommunityChannel> {
  const updated = await updateChannelServerSideByScope(agencyScope(agencyId), groupId, channelId, patch);
  if (!updated) throw new Error("Channel not found");
  return updated;
}

/** Matches the pre-consolidation Agency signature exactly (`Promise<void>`,
 *  unconditional delete, no posts-in-use guard) — see the module comment
 *  on `deleteChannelServerSideByScope` for why this phase preserves that
 *  difference rather than tightening it. */
export async function deleteAgencyChannelShared(
  agencyId: string,
  groupId: string,
  channelId: string,
): Promise<void> {
  await deleteChannelServerSideByScope(agencyScope(agencyId), groupId, channelId, false);
}

export interface CreateAgencySectionByScopeInput {
  agencyId: string;
  groupId: string;
  name: string;
  icon: string;
  private?: boolean;
}

export async function createAgencySectionShared(
  input: CreateAgencySectionByScopeInput,
): Promise<CommunitySection> {
  return createSectionServerSideByScope({ ...input, scope: agencyScope(input.agencyId) });
}

export async function updateAgencySectionShared(
  agencyId: string,
  groupId: string,
  sectionId: string,
  patch: UpdateSectionPatch,
): Promise<CommunitySection> {
  const updated = await updateSectionServerSideByScope(agencyScope(agencyId), groupId, sectionId, patch);
  if (!updated) throw new Error("Section not found");
  return updated;
}

export async function deleteAgencySectionShared(
  agencyId: string,
  groupId: string,
  sectionId: string,
): Promise<{ ok: true; unsectionedCount: number } | { ok: false; error: string }> {
  return deleteSectionServerSideByScope(agencyScope(agencyId), groupId, sectionId);
}
