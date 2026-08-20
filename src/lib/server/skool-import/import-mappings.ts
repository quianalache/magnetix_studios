import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ImportEntity, ImportMappingDoc } from "@/types/import";

/**
 * Reuses the EXISTING generic import provenance system (src/types/import.ts,
 * mirroring bulk-write.ts's own `mappingKey`) rather than inventing a
 * second one — see the migration investigation report for why. Every
 * Skool-sourced Magnetix doc this importer creates is indexed here by
 * `skool:{entity}:{skoolId}`, which is what makes a rerun idempotent: check
 * this ledger before creating anything, skip/reuse if already mapped.
 */

const SYSTEM = "skool" as const;

function mappingKey(entity: ImportEntity, externalId: string): string {
  return `skool:${entity}:${externalId}`.replace(/[/.#$[\]]/g, "_").slice(0, 300);
}

function col(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/importMappings`);
}

export async function getExistingMapping(
  subAccountId: string,
  entity: ImportEntity,
  externalId: string,
): Promise<ImportMappingDoc | null> {
  const snap = await col(subAccountId).doc(mappingKey(entity, externalId)).get();
  return snap.exists ? (snap.data() as ImportMappingDoc) : null;
}

/** Batch-read every mapping for a set of external ids in one entity —
 *  avoids one read per record during a dry-run/plan pass over hundreds of
 *  Skool objects. Firestore `getAll` has no hard cap worth guarding here at
 *  this Community's real scale (69 members / 121 posts). */
export async function getExistingMappingsBulk(
  subAccountId: string,
  entity: ImportEntity,
  externalIds: string[],
): Promise<Map<string, ImportMappingDoc>> {
  if (externalIds.length === 0) return new Map();
  const db = getAdminDb();
  const refs = externalIds.map((id) => col(subAccountId).doc(mappingKey(entity, id)));
  const snaps = await db.getAll(...refs);
  const out = new Map<string, ImportMappingDoc>();
  snaps.forEach((snap, i) => {
    if (snap.exists) out.set(externalIds[i], snap.data() as ImportMappingDoc);
  });
  return out;
}

export async function writeMapping(opts: {
  subAccountId: string;
  entity: ImportEntity;
  externalId: string;
  leadstackId: string;
  parentId?: string | null;
}): Promise<void> {
  const doc: ImportMappingDoc = {
    entity: opts.entity,
    system: SYSTEM,
    externalId: opts.externalId,
    leadstackId: opts.leadstackId,
    parentId: opts.parentId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await col(opts.subAccountId).doc(mappingKey(opts.entity, opts.externalId)).set(doc);
}

/**
 * Deletes ONLY this Skool importer's own mapping docs for one sub-account
 * — used to tear down a test/aborted run before redoing it.
 *
 * Incident-driven design (2026-08-20): an earlier one-off cleanup script
 * queried and batch-deleted the ENTIRE `importMappings` collection with no
 * filter at all, destroying 613 unrelated pre-existing GHL-import mapping
 * docs that had nothing to do with the Skool test being torn down (492 of
 * the 613 were reconstructed from surviving Contact/Deal `externalId`
 * stamps; 120 — 119 notes + 1 dedup-merged contact — were permanently
 * unrecoverable; see the Build Log's incident entry for the full account).
 *
 * This function is the permanent fix, not a one-off patch: `system` is
 * hardcoded to `"skool"` here — not a caller-supplied parameter — so it is
 * structurally impossible for Skool cleanup code, however it's called, to
 * ever target `"ghl"` (or any other system's) mapping docs. There is no
 * "delete everything" code path left anywhere in this module.
 */
export async function deleteAllSkoolMappings(subAccountId: string): Promise<number> {
  const db = getAdminDb();
  const snap = await col(subAccountId).where("system", "==", SYSTEM).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (snap.size > 0) await batch.commit();
  return snap.size;
}
