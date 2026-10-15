import { cn } from "@/lib/utils";
import { stageColor } from "@/lib/pipelines/stage-color";

/** Stage name with its identity dot (same color as the board column + Dashboard snapshot). */
export function StageLabel({
  stageId,
  label,
  index,
  className,
}: {
  stageId: string;
  label: string;
  /** Position in the pipeline's stage list (custom stages rotate colors by position). */
  index: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: stageColor(stageId, index) }} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}
