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
import { CSS } from "@dnd-kit/utilities";
import { ChevronsLeftRight, ChevronsRightLeft, FileText, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
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
        <div className="flex snap-x gap-3 overflow-x-auto pb-3">
          {stages.map((stage) => {
            const col = columns.get(stage.id) ?? { count: 0, totals: {}, deals: [] };
            return collapsed.has(stage.id) ? (
              <CollapsedColumn
                key={stage.id}
                stage={stage}
                count={col.count}
                onExpand={() => onToggleCollapse(stage.id)}
              />
            ) : (
              <Column
                key={stage.id}
                stage={stage}
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

function stageHeaderTone(stage: PipelineStage): string {
  if (stage.terminal === "won") return "bg-emerald-500/10";
  if (stage.terminal === "lost") return "bg-rose-500/10";
  return "bg-primary/5";
}

function Column({
  stage,
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
      className={cn(
        "flex w-[82vw] max-w-[18rem] shrink-0 snap-start flex-col rounded-2xl border bg-muted/20 transition-colors sm:w-72",
        isOver && "border-primary/60 bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <header className={cn("rounded-t-2xl px-3 pb-2 pt-3", stageHeaderTone(stage))}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{stage.label}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${stage.label} options`} />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onCollapse}>
                <ChevronsRightLeft className="mr-2 h-4 w-4" /> Collapse column
              </DropdownMenuItem>
              {!readOnly && (
                <DropdownMenuItem onClick={onAdd}>
                  <Plus className="mr-2 h-4 w-4" /> Add deal here
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {column.count} {column.count === 1 ? "deal" : "deals"}
          </span>
          <CurrencyTotalsText totals={column.totals} className="truncate font-semibold tabular-nums text-foreground" />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-9 items-center justify-center gap-1 rounded-lg bg-background/70 text-xs font-medium text-primary transition-colors hover:bg-background"
          >
            <Plus className="h-3.5 w-3.5" /> Add deal
          </button>
        )}
        {column.deals.length === 0 ? (
          <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
            <FileText className="h-5 w-5" />
            {readOnly ? (
              "No deals"
            ) : (
              <>
                <span>Drop deals here</span>
                <span className="text-[11px]">or drag from another stage</span>
              </>
            )}
          </div>
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
          <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${Math.min(remaining, 25)} more of ${remaining}`}
          </Button>
        )}
      </div>
    </section>
  );
}

function CollapsedColumn({
  stage,
  count,
  onExpand,
}: {
  stage: PipelineStage;
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
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-3 rounded-2xl border py-3 transition-colors hover:bg-muted/40",
        stageHeaderTone(stage),
        isOver && "ring-2 ring-primary/30",
      )}
    >
      <ChevronsLeftRight className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs font-semibold tabular-nums">{count}</span>
      <span className="text-xs font-semibold [writing-mode:vertical-rl]">{stage.label}</span>
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
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    disabled: readOnly,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <DealCard
      deal={deal}
      contact={deal.contact ?? undefined}
      fields={fields}
      territoryName={territoryName}
      dragging={dragging}
      setNodeRef={setNodeRef}
      style={style}
      listeners={listeners as unknown as React.HTMLAttributes<HTMLElement>}
      attributes={attributes as unknown as React.HTMLAttributes<HTMLElement>}
      onOpen={onOpen}
      onMoveRequest={readOnly ? undefined : onMoveRequest}
      onCompletedChange={onCompletedChange}
    />
  );
}
