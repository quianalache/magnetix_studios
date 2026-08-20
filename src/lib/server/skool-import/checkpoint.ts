import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ImportEntity, ImportMappingDoc } from "@/types/import";

/**
 * Phase 3 operational safeguard — NOT a general rollback framework (per
 * explicit instruction). A single, minimal capability: capture a snapshot
 * of what this Skool import's provenance ledger already contains right
 * BEFORE a real write pass, then use that snapshot to compute exactly what
 * changed if a rollback is ever needed — never a bare "delete everything
 * in this collection" operation.
 *
 * Reuses the EXISTING `importMappings` ledger as the source of truth
 * (src/types/import.ts, import-mappings.ts) rather than inventing a
 * parallel tracking system. As of this pass, EVERY entity this importer
 * touches (members, channels, memberships, posts, comments) writes a
 * mapping doc on real creation — channels/memberships didn't before this
 * change; extended in importer.ts so the manifest below has complete,
 * consistent coverage across all 5 entity types, not just 3 of them.
 *
 * A mapping doc's mere EXISTENCE at rollback time doesn't say whether it
 * predates this checkpoint — that's exactly what the checkpoint's
 * `preExistingMappingKeys` snapshot is for: anything with a mapping key in
 * that set already existed (Phase 2's test run, or an earlier Skool
 * import); anything NOT in that set was created by the run that happened
 * AFTER this checkpoint was captured.
 */

const CHECKPOINTS_COLLECTION = "skoolImportCheckpoints";

export interface SkoolImportCheckpoint {
  id: string;
  subAccountId: string;
  targetGroupId: string;
  targetGroupSlug: string;
  capturedAt: FirebaseFirestore.Timestamp | FieldValue;
  /** Every system==="skool" importMappings doc id (the mapping key) that
   *  already existed at capture time — i.e. everything an EARLIER Skool
   *  import run already created. */
  preExistingMappingKeys: string[];
  preExistingCountsByEntity: Partial<Record<ImportEntity, number>>;
}

function mappingsCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/importMappings`);
}

function checkpointsCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/${CHECKPOINTS_COLLECTION}`);
}

/**
 * Reads current system==="skool" mapping docs — ALWAYS filtered, never a
 * bare collection scan — and returns them keyed by their own doc id (the
 * mapping key), which is what both capture and rollback below diff against.
 */
async function readAllSkoolMappings(subAccountId: string): Promise<Map<string, ImportMappingDoc>> {
  const snap = await mappingsCol(subAccountId).where("system", "==", "skool").get();
  const out = new Map<string, ImportMappingDoc>();
  snap.docs.forEach((d) => out.set(d.id, d.data() as ImportMappingDoc));
  return out;
}

/**
 * Call this ONCE, immediately before the first real (`commit: true`) Phase
 * 3 write — capturing the checkpoint is itself the one Firestore write that
 * happens first, and it's purely additive (a new doc in a new collection),
 * never a mutation of anything this import will touch.
 */
export async function capturePreImportCheckpoint(opts: {
  subAccountId: string;
  targetGroupId: string;
  targetGroupSlug: string;
}): Promise<SkoolImportCheckpoint> {
  const existing = await readAllSkoolMappings(opts.subAccountId);
  const preExistingMappingKeys = [...existing.keys()];
  const preExistingCountsByEntity: Partial<Record<ImportEntity, number>> = {};
  for (const doc of existing.values()) {
    preExistingCountsByEntity[doc.entity] = (preExistingCountsByEntity[doc.entity] ?? 0) + 1;
  }

  const id = `phase3-${Date.now()}`;
  const record: Omit<SkoolImportCheckpoint, "id"> = {
    subAccountId: opts.subAccountId,
    targetGroupId: opts.targetGroupId,
    targetGroupSlug: opts.targetGroupSlug,
    capturedAt: FieldValue.serverTimestamp(),
    preExistingMappingKeys,
    preExistingCountsByEntity,
  };
  await checkpointsCol(opts.subAccountId).doc(id).set(record);
  return { id, ...record };
}

export async function getCheckpoint(subAccountId: string, checkpointId: string): Promise<SkoolImportCheckpoint | null> {
  const snap = await checkpointsCol(subAccountId).doc(checkpointId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<SkoolImportCheckpoint, "id">) };
}

// ---------------------------------------------------------------------------
// Rollback — reverses ONLY what changed since a given checkpoint.
// ---------------------------------------------------------------------------

/** Where a given entity's real doc lives, given its mapping's leadstackId/
 *  parentId. Every path is built from explicit ids, never a collection scan. */
function resolveEntityDocPath(
  entity: ImportEntity,
  subAccountId: string,
  targetGroupId: string,
  leadstackId: string,
  parentId: string | null,
): string | null {
  switch (entity) {
    case "community_members":
      return `subAccounts/${subAccountId}/members/${leadstackId}`;
    case "community_channels":
      return `subAccounts/${subAccountId}/communityGroups/${targetGroupId}/channels/${leadstackId}`;
    case "community_memberships":
      return `subAccounts/${subAccountId}/communityGroups/${targetGroupId}/memberships/${leadstackId}`;
    case "community_posts":
      return `subAccounts/${subAccountId}/communityGroups/${targetGroupId}/posts/${leadstackId}`;
    case "community_comments":
      return parentId
        ? `subAccounts/${subAccountId}/communityGroups/${targetGroupId}/posts/${parentId}/comments/${leadstackId}`
        : null; // a comment mapping with no recorded parent post can't be safely located — skip, never guess
    default:
      return null; // CRM entities (contacts/deals/tasks/events/notes) are GHL's, never touched by this rollback
  }
}

export interface RollbackItem {
  mappingKey: string;
  entity: ImportEntity;
  externalId: string;
  leadstackId: string;
  path: string;
}

export interface RollbackReport {
  commit: boolean;
  checkpointId: string;
  targetGroupId: string;
  /** Mappings created since the checkpoint, grouped by entity, that WOULD
   *  be (or were) deleted. */
  toDelete: RollbackItem[];
  deleted: RollbackItem[];
  /** A mapping created since the checkpoint whose underlying doc either no
   *  longer exists, or exists but belongs to a DIFFERENT group than the
   *  checkpoint's targetGroupId — never deleted, reported instead. This is
   *  the concrete enforcement of "never delete outside this specific
   *  import's scope," beyond the system==="skool" filter alone. */
  skippedOutOfScope: { mappingKey: string; entity: ImportEntity; reason: string }[];
  errors: { mappingKey: string; message: string }[];
}

/**
 * Reverses everything created SINCE `checkpointId` — and ONLY that. Two
 * independent, mandatory scope guards, matching the explicit instruction:
 *  1. `system === "skool"` — hardcoded inside readAllSkoolMappings above,
 *     never a caller-supplied parameter (same permanent pattern as
 *     deleteAllSkoolMappings in import-mappings.ts).
 *  2. every mapping considered must be ABSENT from the checkpoint's
 *     preExistingMappingKeys (so anything that predates this checkpoint —
 *     e.g. the Phase 2 test run — is never touched), AND for every
 *     group-scoped entity (channels/memberships/posts/comments) the real
 *     doc's own `groupId` field must exactly equal the checkpoint's
 *     targetGroupId before it is ever deleted. A mismatch or a missing doc
 *     is reported in `skippedOutOfScope`, never silently deleted and never
 *     silently ignored.
 * There is no code path here that deletes by a bare collection query —
 * every delete is a direct doc reference resolved from a specific mapping.
 */
export async function rollbackSkoolImportSinceCheckpoint(
  subAccountId: string,
  checkpointId: string,
  opts: { commit: boolean },
): Promise<RollbackReport> {
  const db = getAdminDb();
  const checkpoint = await getCheckpoint(subAccountId, checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint ${checkpointId} not found for sub-account ${subAccountId} — refusing to guess scope.`);
  }
  const preExisting = new Set(checkpoint.preExistingMappingKeys);
  const current = await readAllSkoolMappings(subAccountId);

  const report: RollbackReport = {
    commit: opts.commit,
    checkpointId,
    targetGroupId: checkpoint.targetGroupId,
    toDelete: [],
    deleted: [],
    skippedOutOfScope: [],
    errors: [],
  };

  for (const [mappingKey, mapping] of current.entries()) {
    if (preExisting.has(mappingKey)) continue; // predates this checkpoint — never touched

    const path = resolveEntityDocPath(
      mapping.entity,
      subAccountId,
      checkpoint.targetGroupId,
      mapping.leadstackId,
      mapping.parentId ?? null,
    );
    if (!path) {
      report.skippedOutOfScope.push({
        mappingKey,
        entity: mapping.entity,
        reason: "entity type not group-scoped or missing parentId — cannot safely locate the real doc",
      });
      continue;
    }

    try {
      const docSnap = await db.doc(path).get();
      if (!docSnap.exists) {
        report.skippedOutOfScope.push({ mappingKey, entity: mapping.entity, reason: "referenced doc no longer exists" });
        continue;
      }
      if (mapping.entity !== "community_members") {
        // community_members isn't group-scoped (an identity, not a
        // per-group relationship) — every other entity carries a real
        // groupId field on the doc itself, checked here.
        const docGroupId = (docSnap.data() as { groupId?: string }).groupId;
        if (docGroupId !== checkpoint.targetGroupId) {
          report.skippedOutOfScope.push({
            mappingKey,
            entity: mapping.entity,
            reason: `doc's groupId (${docGroupId}) does not match checkpoint's targetGroupId (${checkpoint.targetGroupId})`,
          });
          continue;
        }
      }

      const item: RollbackItem = { mappingKey, entity: mapping.entity, externalId: mapping.externalId, leadstackId: mapping.leadstackId, path };
      report.toDelete.push(item);
      if (opts.commit) {
        await db.doc(path).delete();
        await mappingsCol(subAccountId).doc(mappingKey).delete();
        report.deleted.push(item);
      }
    } catch (err) {
      report.errors.push({ mappingKey, message: String(err) });
    }
  }

  return report;
}
