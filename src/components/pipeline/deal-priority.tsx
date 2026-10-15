"use client";

import { cn } from "@/lib/utils";
import { getPriority, type DealPriority } from "@/types/deals";
import { Tag, type TagColor } from "@/components/system/status-pill";

/**
 * Deal priority as a quiet system Tag (Wave 4). Medium is the default for
 * most deals, so it stays gray; only High / Low take an accent. Labels and
 * values are unchanged — display only.
 */
const PRIORITY_TAG: Record<DealPriority, TagColor> = {
  high: "pink",
  medium: "gray",
  low: "green",
};

export function DealPriorityTag({ priority, className }: { priority: DealPriority | null | undefined; className?: string }) {
  const p = getPriority(priority);
  return (
    <Tag color={PRIORITY_TAG[p.id] ?? "gray"} className={cn("px-1.5 py-0 text-micro", className)}>
      {p.label}
    </Tag>
  );
}
