"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronsLeftRight, ChevronsRightLeft, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageColor } from "@/lib/pipelines/stage-color";
import type { PipelineStage } from "@/types/deals";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";
import type { BoardDeal, CurrencyTotals } from "@/types/pipeline-board";
import type { CardFieldKey } from "@/types/pipeline-cards";
import { DealCard } from "@/components/pipeline/deal-card";
import { LostReasonDialog } from "@/components/pipeline/lost-reason-dialog";
import { MoveStageSheet } from "@/components/pipeline/move-stage-sheet";
import { CurrencyTotalsText } from "@/components/pipeline/currency-totals";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * One pipeline's Kanban board (Multiple Pipelines, 2026-09-25). Columns come
 * from the selected pipeline's own stages; cards come from the server-side
 * board query one page per stage ("Load more" fetches the next page), with
 * exact per-stage counts/totals from the server so statistics stay right
 * while cards load incrementally.
 *
 * Preserved from the previous board: @dnd-kit drag between stages, the
 * lost-reason prompt, the mobile "Move stage" sheet, priority badges,
 * stage age, contact links, territory labels and the Won "completed" tick.
 * Changed per the approved spec: a single click opens the deal (was a
 * double-click editor); columns can be collapsed.
 *
 * Wave 4 (Visual Direction 2): quiet near-white columns with a thin border
 * and a stage-identity accent line (the Dashboard's stage colors), compact
 * white cards, Royal Violet drop target. On md+ each column's cards scroll
 * inside the column so every stage header stays in view; the board itself
 * scrolls sideways inside its own strip (never the page).
 */

export interface BoardColumnState {
  count: number;
  totals: CurrencyTotals;
  deals: BoardDeal[];
}

interface PipelineBoardProps {
  stages: PipelineStage[];
  columns: Map<string, BoardColumnState>;
  territories: TerritoryDoc[];
  collapsed: Set<string>;
  cardFields: CardFieldKey[];
  /** Pipeline archived → no drag/add (deals stay viewable). */
  readOnly?: boolean;
  onToggleCollapse: (stageId: string) => void;
  onLoadMore: (stageId: string) => void;
  loadingMore: Set<string>;
  onOpenDeal: (deal: BoardDeal) => void;
  onAddDeal: (stageId: string) => void;
  /** Move a deal; resolves when the server accepted it. */
  onMoveDeal: (deal: BoardDeal, stageId: string, lostReason?: string) => Promise<void>;
  onCompletedChange: () => void;
}

function territoryName(
  id: string | null | undefined,
  byId: Map<string, string>,
): string | undefined {
  if (!id) return undefined;
  return byId.get(id) ?? (id === GLOBAL_TERRITORY_ID ? "Global" : undefined);
}

export function PipelineBoard({
  stages,
  columns,
  territories,
  collapsed,
  cardFields,
  readOnly = false,
  onToggleCollapse,
  onLoadMore,
  loadingMore,
  onOpenDeal,
  onAddDeal,
  onMoveDeal,
  onCompletedChange,
}: PipelineBoardProps) {
  const territoryNameById = useMemo(
    () => new Map(territories.map((t) => [t.id, t.name])),
    [territories],
  );
  const allDeals = useMemo(
    () => [...columns.values()].flatMap((c) => c.deals),
    [columns],
  );

  const [activeDeal, setActiveDeal] = useState<BoardDeal | null>(null);
  const [pendingLost, setPendingLost] = useState<BoardDeal | null>(null);
  const [movingDeal, setMovingDeal] = useState<BoardDeal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveDeal(allDeals.find((d) => d.id === e.active.id) ?? null);
  }

  function requestMove(deal: BoardDeal, stageId: string) {
    if (stageId === deal.stageId) return;
    if (stageId === "lost") {
      setPendingLost(deal);
      return;
    }
    void onMoveDeal(deal, stageId);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDeal(null);
    const overId = e.over?.id;
    if (!overId) return;
    const deal = allDeals.find((d) => d.id === e.active.id);
    if (!deal) return;
    const stageId = String(overId);
    if (!stages.some((s) => s.id === stageId)) return;
    requestMove(deal, stageId);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDeal(null)}
      >
        <div
          role="region"
          aria-label="Pipeline board"
          className="relative -mx-1 flex snap-x items-start gap-3 overflow-x-auto px-1 pb-3"
        >
          {stages.map((stage, index) => {
            const col = columns.get(stage.id) ?? { count: 0, totals: {}, deals: [] };
            return collapsed.has(stage.id) ? (
              <CollapsedColumn
                key={stage.id}
                stage={stage}
                accent={stageColor(stage.id, index)}
                count={col.count}
                onExpand={() => onToggleCollapse(stage.id)}
              />
            ) : (
              <Column
                key={stage.id}
                stage={stage}
                accent={stageColor(stage.id, index)}
                column={col}
                readOnly={readOnly}
                activeId={activeDeal?.id}
                cardFields={cardFields}
                territoryNameById={territoryNameById}
                loadingMore={loadingMore.has(stage.id)}
                onCollapse={() => onToggleCollapse(stage.id)}
                onAdd={() => onAddDeal(stage.id)}
                onLoadMore={() => onLoadMore(stage.id)}
                onOpenDeal={onOpenDeal}
                onMoveRequest={(d) => setMovingDeal(d)}
                onCompletedChange={onCompletedChange}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <DealCard
              deal={activeDeal}
              contact={activeDeal.contact ?? undefined}
              fields={cardFields}
              territoryName={territoryName(activeDeal.territoryId, territoryNameById)}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <MoveStageSheet
        deal={movingDeal}
        stages={stages}
        onClose={() => setMovingDeal(null)}
        onMove={(stageId) => {
          const deal = movingDeal;
          setMovingDeal(null);
          if (deal) requestMove(deal, stageId);
        }}
      />

      <LostReasonDialog
        open={!!pendingLost}
        dealTitle={pendingLost?.title}
        onCancel={() => setPendingLost(null)}
        onConfirm={async (reason) => {
          const deal = pendingLost;
          setPendingLost(null);
          if (deal) await onMoveDeal(deal, "lost", reason);
        }}
      />
    </>
  );
}

function Column({
  stage,
  accent,
  column,
  readOnly,
  activeId,
  cardFields,
  territoryNameById,
  loadingMore,
  onCollapse,
  onAdd,
  onLoadMore,
  onOpenDeal,
  onMoveRequest,
  onCompletedChange,
}: {
  stage: PipelineStage;
  /** Stage identity color (CSS color). */
  accent: string;
  column: BoardColumnState;
  readOnly: boolean;
  activeId?: string;
  cardFields: CardFieldKey[];
  territoryNameById: Map<string, string>;
  loadingMore: boolean;
  onCollapse: () => void;
  onAdd: () => void;
  onLoadMore: () => void;
  onOpenDeal: (deal: BoardDeal) => void;
  onMoveRequest: (deal: BoardDeal) => void;
  onCompletedChange: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: readOnly });
  const remaining = column.count - column.deals.length;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.label}, ${column.count} deals`}
      data-drop-over={isOver ? "true" : undefined}
      className={cn(
        "flex w-[82vw] max-w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-card border border-border bg-surface-sunken transition-colors sm:w-72",
        isOver && "border-violet-ds-300 bg-tint-violet ring-2 ring-ring/30",
      )}
    >
      <header className="border-t-[3px] bg-card px-3 pt-2 pb-2.5" style={{ borderTopColor: accent }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-body-sm font-semibold text-foreground">
            <span className="truncate">{stage.label}</span>
            <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-micro leading-5 font-semibold text-muted-foreground tabular-nums">
              {column.count}
            </span>
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1.5 size-11 text-muted-foreground md:size-8"
                  aria-label={`${stage.label} options`}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onCollapse}>
                <ChevronsRightLeft className="size-4" /> Collapse column
              </DropdownMenuItem>
              {!readOnly && (
                <DropdownMenuItem onClick={onAdd}>
                  <Plus className="size-4" /> Add deal here
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-caption text-muted-foreground">
          <span className="sr-only">{column.count} {column.count === 1 ? "deal" : "deals"} · </span>
          <CurrencyTotalsText totals={column.totals} className="font-semibold text-foreground tabular-nums" />
        </p>
      </header>

      <div className="relative flex flex-1 flex-col gap-2 border-t border-border p-2 md:max-h-[calc(100dvh-21rem)] md:min-h-48 md:overflow-y-auto">
        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-control border border-dashed border-border-strong/60 text-caption font-medium text-link transition-colors outline-none hover:border-violet-ds-300 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
          >
            <Plus className="size-3.5" aria-hidden="true" /> Add deal
          </button>
        )}
        {column.deals.length === 0 ? (
          <p className="rounded-control px-3 py-6 text-center text-caption text-ink-tertiary">
            {readOnly ? "No deals" : isOver ? "Release to move here" : "No deals · drop one here"}
          </p>
        ) : (
          column.deals.map((deal) => (
            <DraggableDeal
              key={deal.id}
              deal={deal}
              readOnly={readOnly}
              fields={cardFields}
              territoryName={territoryName(deal.territoryId, territoryNameById)}
              dragging={activeId === deal.id}
              onOpen={() => onOpenDeal(deal)}
              onMoveRequest={() => onMoveRequest(deal)}
              onCompletedChange={onCompletedChange}
            />
          ))
        )}
        {remaining > 0 && (
          <Button variant="ghost" size="sm" className="shrink-0 text-link" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${Math.min(remaining, 25)} more of ${remaining}`}
          </Button>
        )}
      </div>
    </section>
  );
}

function CollapsedColumn({
  stage,
  accent,
  count,
  onExpand,
}: {
  stage: PipelineStage;
  accent: string;
  count: number;
  onExpand: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${stage.label} (${count} deals)`}
      style={{ borderTopColor: accent }}
      className={cn(
        "flex min-h-11 w-11 shrink-0 flex-col items-center gap-3 rounded-card border border-t-[3px] border-border bg-card py-3 transition-colors outline-none hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0",
        isOver && "border-violet-ds-300 bg-tint-violet ring-2 ring-ring/30",
      )}
    >
      <ChevronsLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="rounded-full bg-surface-sunken px-1.5 text-micro leading-5 font-semibold text-muted-foreground tabular-nums">{count}</span>
      <span className="text-caption font-semibold text-foreground [writing-mode:vertical-rl]">{stage.label}</span>
    </button>
  );
}

function DraggableDeal({
  deal,
  readOnly,
  fields,
  territoryName,
  dragging,
  onOpen,
  onMoveRequest,
  onCompletedChange,
}: {
  deal: BoardDeal;
  readOnly: boolean;
  fields: CardFieldKey[];
  territoryName?: string;
  dragging: boolean;
  onOpen: () => void;
  onMoveRequest: () => void;
  onCompletedChange: () => void;
}) {
  // The DragOverlay is what follows the pointer; the source card stays in
  // place as a faded placeholder (no transform), so its column doesn't show
  // a gap and the two copies never overlap. Drop detection uses the active
  // rect + pointer delta, not this element's style, so moves are unchanged.
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: deal.id,
    disabled: readOnly,
  });
  return (
    <DealCard
      deal={deal}
      contact={deal.contact ?? undefined}
      fields={fields}
      territoryName={territoryName}
      dragging={dragging}
      setNodeRef={setNodeRef}
      listeners={listeners as unknown as React.HTMLAttributes<HTMLElement>}
      attributes={attributes as unknown as React.HTMLAttributes<HTMLElement>}
      onOpen={onOpen}
      onMoveRequest={readOnly ? undefined : onMoveRequest}
      onCompletedChange={onCompletedChange}
    />
  );
}
