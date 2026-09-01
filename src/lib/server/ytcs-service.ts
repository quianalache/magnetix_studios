import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { YtcsIdea, YtcsVideoProject } from "@/types/ytcs";

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
 */
export async function createVideoProject(
  subAccountId: string,
  input: { name: string },
): Promise<YtcsVideoProject> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc: YtcsVideoProject = {
    id,
    name: input.name || "Untitled Video Project",
    currentStep: "Input",
    status: "Input",
    createdDate: now,
    lastUpdatedDate: now,
  };
  const data: Record<string, unknown> = { ...doc, createdAt: FieldValue.serverTimestamp() };
  delete data.id;
  await videosCol(subAccountId).doc(id).set(data);
  return doc;
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
  return snap.docs.map((d) => toDoc<YtcsIdea>(d));
}
