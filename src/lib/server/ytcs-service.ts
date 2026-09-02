import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { YtcsIdea, YtcsSettings, YtcsVideoProject } from "@/types/ytcs";

/**
 * Admin-SDK service for YTCS's own data — video projects and saved
 * ideas, at the exact Firestore paths Phase 0's migration already wrote
 * the owner's 15 real projects and 2 real ideas to:
 * `subAccounts/{id}/ytcsVideos/{videoId}` and
 * `subAccounts/{id}/ytcsIdeas/{ideaId}`. Not a new collection, not a
 * new schema — this is the first Magnetix-native reader/writer over
 * that already-migrated data.
 *
 * Business Brain (Creator Vision/Audience/Offers/Frameworks/Stories/
 * Voice/Topics/Positioning) is deliberately NOT read or written here —
 * see @/lib/server/business-brain-service's getBusinessBrain().
 */

function videosCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/ytcsVideos`);
}
function ideasCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/ytcsIdeas`);
}
/** Sibling singleton to `ytcs/brain`, per migration spec §20's own
 *  stated direction. */
function settingsDoc(subAccountId: string) {
  return getAdminDb().doc(`subAccounts/${subAccountId}/ytcs/settings`);
}

function toDoc<T>(snap: FirebaseFirestore.DocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as Omit<T, "id">) } as T;
}

export async function listVideoProjects(
  subAccountId: string,
): Promise<YtcsVideoProject[]> {
  const snap = await videosCol(subAccountId).get();
  const projects = snap.docs.map((d) => toDoc<YtcsVideoProject>(d));
  projects.sort((a, b) => {
    const av = typeof a.lastUpdatedDate === "string" ? a.lastUpdatedDate : "";
    const bv = typeof b.lastUpdatedDate === "string" ? b.lastUpdatedDate : "";
    return bv.localeCompare(av);
  });
  return projects;
}

export async function getVideoProject(
  subAccountId: string,
  videoId: string,
): Promise<YtcsVideoProject | null> {
  const snap = await videosCol(subAccountId).doc(videoId).get();
  return snap.exists ? toDoc<YtcsVideoProject>(snap) : null;
}

/**
 * Creates a new, real (non-QA-disposable) video project. Only sets the
 * fields a brand-new project genuinely has — everything else stays
 * `undefined`/absent, matching the shape older real projects had before
 * their later steps were ever touched (Phase 0's real data confirms
 * fields simply don't exist yet on early-stage projects, not that they
 * exist as empty strings).
 *
 * `extra` covers the two real-world cases beyond a bare "start a new
 * project": Turn Into Video (populates `startingPointType`/
 * `rawTranscript`/`sourceIdeaId`/`brainDumpVoiceNotes` from a Saved
 * Idea) and Duplicate Project (see `duplicateVideoProject`, which calls
 * this with a much larger `extra`). The sub-account's YTCS Settings
 * defaults (`defaultScriptOutputType`/`defaultDepthPreference`) are
 * applied here, once, at creation time — copied onto the new project's
 * own fields, not referenced live, so changing the default later never
 * rewrites this or any other existing project.
 */
export async function createVideoProject(
  subAccountId: string,
  input: { name: string },
  extra?: Partial<YtcsVideoProject>,
): Promise<YtcsVideoProject> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const settings = await getYtcsSettings(subAccountId);
  const doc: YtcsVideoProject = {
    id,
    name: input.name || "Untitled Video Project",
    currentStep: "Input",
    status: "Input",
    createdDate: now,
    lastUpdatedDate: now,
    ...(settings?.defaultScriptOutputType ? { scriptOutputType: settings.defaultScriptOutputType } : {}),
    ...(settings?.defaultDepthPreference ? { depthPreference: settings.defaultDepthPreference } : {}),
    ...extra,
    id, // extra must never override the freshly generated id
  };
  const data: Record<string, unknown> = { ...doc, createdAt: FieldValue.serverTimestamp() };
  delete data.id;
  await videosCol(subAccountId).doc(id).set(data);
  return doc;
}

/**
 * Duplicate Project — exact semantics were unresolved by every source
 * (spec/dossier/live audit never captured this action's real
 * behavior), so this implements the smallest safe behavior and
 * discloses it (migration spec's Final Completion addendum): copies
 * the source project's real content fields (name gets " (Copy)",
 * everything else copied as-is including `currentStep`/`status` — a
 * duplicate is a snapshot, not a reset to Input) onto a brand-new id.
 * Deliberately NOT copied: `legacy`/`unknownFields`/
 * `migratedFromExport`/`migratedAt` (a duplicate is a new,
 * non-migrated record — copying migration provenance onto it would be
 * false), `archived` (a fresh copy is never pre-archived), and every
 * voice-note array (`brainDumpVoiceNotes`/`scriptBuilderVoiceNotes`/
 * `productOfferDeepDiveVoiceNotes`/`deepDiveVoiceNotes`) — per
 * instruction, to avoid two projects sharing ownership of the same
 * underlying Storage recording. If the source is already `"Published"`,
 * the duplicate's `status`/`youtubeLink`/`publishDate` are reset so a
 * fresh duplicate never falsely presents itself as already live.
 */
const DUPLICATE_EXCLUDED_KEYS = new Set<keyof YtcsVideoProject>([
  "id",
  "name",
  "createdDate",
  "lastUpdatedDate",
  "legacy",
  "unknownFields",
  "migratedFromExport",
  "migratedAt",
  "archived",
  "brainDumpVoiceNotes",
  "scriptBuilderVoiceNotes",
  "productOfferDeepDiveVoiceNotes",
  "deepDiveVoiceNotes",
  "status",
  "youtubeLink",
  "publishDate",
]);

export async function duplicateVideoProject(
  subAccountId: string,
  videoId: string,
): Promise<YtcsVideoProject | null> {
  const source = await getVideoProject(subAccountId, videoId);
  if (!source) return null;

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!DUPLICATE_EXCLUDED_KEYS.has(key as keyof YtcsVideoProject)) {
      rest[key] = value;
    }
  }

  const wasPublished = source.status === "Published";

  return createVideoProject(
    subAccountId,
    { name: `${source.name || "Untitled Video Project"} (Copy)` },
    {
      ...rest,
      status: wasPublished ? source.currentStep || "Input" : source.status,
    },
  );
}

/**
 * Partial, merge-only update — the same safety property as Business
 * Brain's PATCH route: only the keys present in `updates` are ever
 * touched, so `legacy`/`unknownFields`/migration provenance fields (never
 * included by any Phase 1 UI action) can't be wiped by an ordinary save.
 */
export async function updateVideoProject(
  subAccountId: string,
  videoId: string,
  updates: Partial<YtcsVideoProject>,
): Promise<YtcsVideoProject | null> {
  const safeUpdates: Record<string, unknown> = { ...updates };
  delete safeUpdates.id;
  await videosCol(subAccountId)
    .doc(videoId)
    .set(
      { ...safeUpdates, lastUpdatedDate: new Date().toISOString() },
      { merge: true },
    );
  return getVideoProject(subAccountId, videoId);
}

export async function deleteVideoProject(
  subAccountId: string,
  videoId: string,
): Promise<void> {
  await videosCol(subAccountId).doc(videoId).delete();
}

export async function listIdeas(subAccountId: string): Promise<YtcsIdea[]> {
  const snap = await ideasCol(subAccountId).get();
  const ideas = snap.docs.map((d) => toDoc<YtcsIdea>(d));
  // Newest-first — dossier-documented pagination default (spec §14),
  // not contradicted by anything real.
  ideas.sort((a, b) => {
    const av = typeof a.lastUpdated === "string" ? a.lastUpdated : "";
    const bv = typeof b.lastUpdated === "string" ? b.lastUpdated : "";
    return bv.localeCompare(av);
  });
  return ideas;
}

export async function getIdea(subAccountId: string, ideaId: string): Promise<YtcsIdea | null> {
  const snap = await ideasCol(subAccountId).doc(ideaId).get();
  return snap.exists ? toDoc<YtcsIdea>(snap) : null;
}

/**
 * Creates a new Saved Idea using the real, confirmed schema only
 * (migration spec §14) — `title`/`type`/`notes`/`priority`/`status`.
 * The dossier-proposed relational fields (`whatSparkedThis`,
 * `relatedTopicId`, etc.) have zero real evidence and are not part of
 * this schema at all, not even as optional unset fields.
 */
export async function createIdea(
  subAccountId: string,
  input: { title: string; type?: string; notes?: string; priority?: string; status?: string },
): Promise<YtcsIdea> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc: YtcsIdea = {
    id,
    title: input.title || "New Idea",
    type: input.type || "Random Thought",
    notes: input.notes || "",
    priority: input.priority || "Medium",
    status: input.status || "Someday",
    lastUpdated: now,
  };
  const data: Record<string, unknown> = { ...doc };
  delete data.id;
  await ideasCol(subAccountId).doc(id).set(data);
  return doc;
}

/** Partial, merge-only update — same safety property as `updateVideoProject`. */
export async function updateIdea(
  subAccountId: string,
  ideaId: string,
  updates: Partial<YtcsIdea>,
): Promise<YtcsIdea | null> {
  const safeUpdates: Record<string, unknown> = { ...updates };
  delete safeUpdates.id;
  await ideasCol(subAccountId)
    .doc(ideaId)
    .set({ ...safeUpdates, lastUpdated: new Date().toISOString() }, { merge: true });
  return getIdea(subAccountId, ideaId);
}

export async function deleteIdea(subAccountId: string, ideaId: string): Promise<void> {
  await ideasCol(subAccountId).doc(ideaId).delete();
}

/**
 * Duplicate Idea — same "smallest safe behavior, disclosed" treatment
 * as `duplicateVideoProject`: copies the real fields onto a new id,
 * does NOT copy `ideaVoiceNotes` (avoids two ideas sharing ownership of
 * the same underlying Storage recording) and does NOT copy
 * `migratedFromExport`/`migratedAt` (a duplicate is a new record).
 */
export async function duplicateIdea(subAccountId: string, ideaId: string): Promise<YtcsIdea | null> {
  const source = await getIdea(subAccountId, ideaId);
  if (!source) return null;
  return createIdea(subAccountId, {
    title: `${source.title || "New Idea"} (Copy)`,
    type: source.type,
    notes: source.notes,
    priority: source.priority,
    status: source.status,
  });
}

export async function getYtcsSettings(subAccountId: string): Promise<YtcsSettings | null> {
  const snap = await settingsDoc(subAccountId).get();
  return snap.exists ? (snap.data() as YtcsSettings) : null;
}

/** Partial, merge-only update. */
export async function updateYtcsSettings(
  subAccountId: string,
  updates: Partial<YtcsSettings>,
): Promise<YtcsSettings> {
  await settingsDoc(subAccountId).set(updates, { merge: true });
  const settings = await getYtcsSettings(subAccountId);
  return settings ?? {};
}
