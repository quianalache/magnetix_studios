import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Shared reader/writer for `subAccounts/{id}/ytcsScriptGenerations` —
 * originally a write-only telemetry stream (2026-09-03 AI usage/cost
 * visibility pass), now ALSO the storage for the "last 3 recoverable
 * script generations per video" feature (2026-09-09 Script + Titles AI
 * UX pass). One collection, two uses of the same doc: every attempt
 * still gets a lightweight telemetry record forever (model/tokens/
 * cost/duration/status — unchanged), and only successful/truncated
 * generations ALSO carry the full `scriptText`, capped to the 3 most
 * recently retained per video (see `evictOldScriptGenerations` below).
 * This was judged safer than a second parallel collection — no new
 * schema, no new place for a 4th generation's write to race a 3-doc
 * cap, and reuses the exact write path `generate-script/route.ts`
 * already had.
 *
 * Deliberately does NOT use `.orderBy()` in any query — combining the
 * existing `videoId ==` equality filter with an `orderBy` on a
 * different field (`generatedAt`) would need a Firestore composite
 * index that doesn't exist yet for this collection, and this service
 * has no way to provision one from here. Every read below does a plain
 * equality-only query (always safe, no index required) and sorts in
 * memory instead — trivially cheap at the per-video generation volumes
 * this feature will ever see.
 */

export const MAX_RETAINED_SCRIPT_GENERATIONS = 3;

export interface ScriptGenerationRecord {
  id: string;
  videoId: string;
  status: "success" | "failed" | "truncated";
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  durationMs: number | null;
  providerReportedCostUsd: number | null;
  estimatedCostUsd: number | null;
  pricingSource: string | null;
  pricingVerifiedDate: string | null;
  scriptOutputType: string | null;
  depthPreference: string | null;
  /** Full generated script text — present only while this generation is
   *  still within the 3 most recently retained for its video; cleared
   *  (not deleted as a doc) once evicted. The rest of the record stays
   *  forever as plain telemetry. */
  scriptText: string | null;
  generatedAt: string;
}

function col(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/ytcsScriptGenerations`);
}

function toRecord(doc: FirebaseFirestore.QueryDocumentSnapshot): ScriptGenerationRecord {
  const d = doc.data();
  const generatedAt = d.generatedAt?.toDate
    ? (d.generatedAt.toDate() as Date).toISOString()
    : typeof d.generatedAt === "string"
      ? d.generatedAt
      : new Date(0).toISOString();
  return {
    id: doc.id,
    videoId: d.videoId,
    status: d.status,
    model: d.model ?? null,
    promptTokens: d.promptTokens ?? null,
    completionTokens: d.completionTokens ?? null,
    totalTokens: d.totalTokens ?? null,
    finishReason: d.finishReason ?? null,
    durationMs: d.durationMs ?? null,
    providerReportedCostUsd: d.providerReportedCostUsd ?? null,
    estimatedCostUsd: d.estimatedCostUsd ?? null,
    pricingSource: d.pricingSource ?? null,
    pricingVerifiedDate: d.pricingVerifiedDate ?? null,
    scriptOutputType: d.scriptOutputType ?? null,
    depthPreference: d.depthPreference ?? null,
    scriptText: d.scriptText ?? null,
    generatedAt,
  };
}

/** All generation records (any status, with or without retained text)
 *  for one video, newest first — sorted in memory, see the file-level
 *  doc comment for why. Not paginated: bounded by real per-video
 *  generation volume, never large enough to matter. */
async function listAllForVideo(subAccountId: string, videoId: string): Promise<ScriptGenerationRecord[]> {
  const snap = await col(subAccountId).where("videoId", "==", videoId).get();
  return snap.docs
    .map(toRecord)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

/** Writes one new generation-attempt record (success, failure, or
 *  truncation — mirrors the pre-existing telemetry write exactly, now
 *  with `scriptText` added for successful/truncated attempts only) and
 *  returns its new doc id. Never blocks the caller's response by
 *  itself — caller decides whether to await it (needed when the id is
 *  used immediately, e.g. to set `activeScriptGenerationId`). */
export async function recordScriptGeneration(
  subAccountId: string,
  videoId: string,
  data: {
    status: "success" | "failed" | "truncated";
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: string;
    durationMs?: number;
    providerReportedCostUsd?: number;
    estimatedCostUsd?: number;
    pricingSource?: string;
    pricingVerifiedDate?: string;
    scriptOutputType?: string;
    depthPreference?: string;
    scriptText?: string;
  },
): Promise<string> {
  const ref = await col(subAccountId).add({
    subAccountId,
    videoId,
    feature: "ytcs_script_generation",
    model: data.model,
    promptTokens: data.promptTokens ?? null,
    completionTokens: data.completionTokens ?? null,
    totalTokens: data.totalTokens ?? null,
    status: data.status,
    finishReason: data.finishReason ?? null,
    durationMs: data.durationMs ?? null,
    providerReportedCostUsd: data.providerReportedCostUsd ?? null,
    estimatedCostUsd: data.estimatedCostUsd ?? null,
    pricingSource: data.pricingSource ?? null,
    pricingVerifiedDate: data.pricingVerifiedDate ?? null,
    scriptOutputType: data.scriptOutputType ?? null,
    depthPreference: data.depthPreference ?? null,
    scriptText: data.scriptText ?? null,
    generatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Enforces the "last 3 retained" rule for one video: of all records
 * that currently carry `scriptText`, keeps the 3 newest and clears
 * `scriptText` (never deletes the doc — its telemetry stays forever)
 * on any older ones. Call after every new successful/truncated
 * generation is recorded. Best-effort, safe to fire-and-forget — a
 * missed eviction just means one extra retained generation until the
 * next successful call, never data loss or a broken UI.
 */
export async function evictOldScriptGenerations(subAccountId: string, videoId: string): Promise<void> {
  try {
    const all = await listAllForVideo(subAccountId, videoId);
    const retained = all.filter((r) => !!r.scriptText);
    const toEvict = retained.slice(MAX_RETAINED_SCRIPT_GENERATIONS);
    if (toEvict.length === 0) return;
    const batch = getAdminDb().batch();
    for (const record of toEvict) {
      batch.update(col(subAccountId).doc(record.id), { scriptText: FieldValue.delete() });
    }
    await batch.commit();
  } catch (err) {
    console.warn("[ytcs-script-generations-service] eviction failed", err);
  }
}

/** Up to the 3 most recently retained (scriptText-having) generations
 *  for a video, newest first — the "Previous Generations" list's data
 *  source. */
export async function listRetainedScriptGenerations(
  subAccountId: string,
  videoId: string,
): Promise<ScriptGenerationRecord[]> {
  const all = await listAllForVideo(subAccountId, videoId);
  return all.filter((r) => !!r.scriptText).slice(0, MAX_RETAINED_SCRIPT_GENERATIONS);
}

/** One specific generation record by id, scoped to (and verified
 *  against) the given video — "Use as Current" reads through this so a
 *  generation id can never be replayed against a different video. */
export async function getScriptGenerationForVideo(
  subAccountId: string,
  videoId: string,
  generationId: string,
): Promise<ScriptGenerationRecord | null> {
  const snap = await col(subAccountId).doc(generationId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || data.videoId !== videoId) return null;
  return toRecord(snap as FirebaseFirestore.QueryDocumentSnapshot);
}
