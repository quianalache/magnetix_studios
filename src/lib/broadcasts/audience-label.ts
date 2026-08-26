import { PIPELINE_STAGES } from "@/types/deals";
import type { BroadcastAudienceFilter } from "@/types";

/**
 * Human-readable summary of a broadcast's audience filter, for the list +
 * detail pages. Pure/no server-only marker — both call sites are client
 * components. Shared (was duplicated per-file before Segmentation V1)
 * specifically so the new "conditions" branch only needs writing once.
 */
export function audienceLabel(filter: BroadcastAudienceFilter): string {
  if (filter.kind === "all") return "All contacts";
  if (filter.kind === "tag") return `Tag: ${filter.tag}`;
  if (filter.kind === "pipeline_stage") {
    const stage = PIPELINE_STAGES.find((s) => s.id === filter.stage);
    return `Stage: ${stage?.label ?? filter.stage}`;
  }
  const count = filter.group?.all?.length ?? 0;
  if (count === 0) return "All contacts (empty filter)";
  const match = filter.group.match === "any" ? "any" : "all";
  return `${count} condition${count === 1 ? "" : "s"} (match ${match})`;
}
