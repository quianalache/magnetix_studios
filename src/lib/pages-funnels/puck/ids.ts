import { newBlockId } from "@/lib/pages-funnels/blocks";

/**
 * Id generation for the production Puck foundation. Reuses the exact V1 id
 * scheme (`newBlockId`) rather than inventing a third generator — the same
 * choice V2's `nodes.ts` already made (`export const newNodeId = newBlockId`).
 * Ids are opaque everywhere in this stack; uniqueness is all that matters.
 *
 * Explicit, stable ids are required on EVERY nested Puck node, at every
 * depth — not optional despite `ComponentDataOptionalId`'s types — per the
 * POC's crash/hang finding (master spec §3). Anything that builds Puck
 * `ComponentData` programmatically (prebuilt-section factories, the V1
 * migration converter) must call one of these, never rely on Puck to infer
 * an id.
 */
export const newPuckNodeId = newBlockId;

/**
 * Deterministic id for a node produced by MIGRATING an existing V1
 * `PageBlock`, keyed off that block's own real id plus a fixed suffix —
 * NOT `newPuckNodeId()`. Per the master spec §16 ("use stable deterministic
 * ids derived from existing block ids"): re-running the converter on the
 * same `PageDoc` must produce byte-identical output, so a diff/dry-run tool
 * can compare two conversions and a re-migration doesn't silently mint a
 * new id for content that didn't change. Only used by migrate-v1.ts —
 * hand-authored content (prebuilt sections, the harness) always uses
 * `newPuckNodeId()` instead, since there's no source block id to derive from.
 */
export function migratedNodeId(sourceBlockId: string, suffix: string): string {
  return `${sourceBlockId}__${suffix}`;
}
