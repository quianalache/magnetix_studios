"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageLabel } from "@/components/pipeline/stage-label";
import { formatCurrency } from "@/lib/format";
import type { Deal, PipelineStage, PipelineStageId } from "@/types/deals";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Mobile bottom sheet for moving a deal between stages — the phone-native
 * alternative to cross-column touch-drag (which stays as the desktop
 * pattern). Opened from the deal card's "Move stage" button (itself only
 * rendered below md). Selecting "lost" routes through the same lost-reason
 * dialog the drag path uses — the caller handles that in onMove.
 */
export function MoveStageSheet({
  deal,
  stages,
  onClose,
  onMove,
}: {
  deal: Deal | null;
  stages: PipelineStage[];
  onClose: () => void;
  onMove: (stageId: PipelineStageId) => void;
}) {
  return (
    <Sheet open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle className="truncate text-left text-body-sm">
            {deal
              ? `Move "${deal.title}" · ${formatCurrency(deal.value, deal.currency)}`
              : "Move deal"}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-1 px-4 pb-4">
          {stages.map((stage, index) => {
            const current = deal?.stageId === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                disabled={current}
                onClick={() => onMove(stage.id)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border px-3 text-body-sm transition-colors active:bg-tint-violet",
                  current
                    ? "cursor-default border-violet-ds-300 bg-accent font-semibold text-accent-foreground"
                    : "border-border hover:bg-surface-sunken",
                )}
              >
                <StageLabel stageId={stage.id} label={stage.label} index={index} />
                {current && <Check className="size-4 shrink-0 text-link" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
