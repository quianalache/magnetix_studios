import "server-only";

/**
 * Re-exports the pure evaluator from lib/segmentation/eval-condition-group.ts
 * (Broadcast Segmentation V1, 2026-08-27) — extracted there so the exact
 * same logic can also run client-side for Broadcast's live audience-count
 * preview. This file keeps its `server-only` marker and its existing import
 * path/name unchanged for `workflows/engine.ts` (trigger filters, if/else
 * branch nodes) — nothing about that call site needed to change.
 */
export { evalConditionGroup } from "@/lib/segmentation/eval-condition-group";
