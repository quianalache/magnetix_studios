"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlockView } from "@/components/pages-funnels/renderer/block-view";
import type { PageBlock } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";

export type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

interface CanvasProps {
  blocks: PageBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (blocks: PageBlock[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  device: DeviceMode;
  resolvedForms: Record<string, LeadForm | null>;
}

/** Center editing surface — a `SortableContext` of blocks, each wrapped with
 *  selection/hover chrome (drag handle, move up/down, duplicate, delete).
 *  Reordering is real drag-and-drop via @dnd-kit (already used by the
 *  broadcast composer elsewhere in this repo) backed by the same
 *  `arrayMove` + persisted `onReorder` callback pattern; the up/down
 *  buttons are a reliable, keyboard-friendly fallback for the same action. */
export function Canvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  device,
  resolvedForms,
}: CanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  }

  function move(id: string, dir: -1 | 1) {
    const index = blocks.findIndex((b) => b.id === id);
    const target = index + dir;
    if (index === -1 || target < 0 || target >= blocks.length) return;
    onReorder(arrayMove(blocks, index, target));
  }

  return (
    <div className="flex h-full justify-center overflow-y-auto bg-muted/30 py-8">
      <div
        className="min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-[var(--mx-shadow-card,0_1px_3px_rgba(0,0,0,0.08))] transition-[width] duration-150"
        style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
      >
        {blocks.length === 0 ? (
          <div className="flex h-96 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">This page is empty</p>
            <p>Add a block from the left panel to get started.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((block, i) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  selected={block.id === selectedId}
                  isFirst={i === 0}
                  isLast={i === blocks.length - 1}
                  onSelect={() => onSelect(block.id)}
                  onDuplicate={() => onDuplicate(block.id)}
                  onDelete={() => onDelete(block.id)}
                  onMoveUp={() => move(block.id, -1)}
                  onMoveDown={() => move(block.id, 1)}
                  resolvedForm={
                    block.type === "form" && block.content.formId
                      ? resolvedForms[block.content.formId]
                      : undefined
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableBlock({
  block,
  selected,
  isFirst,
  isLast,
  onSelect,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  resolvedForm,
}: {
  block: PageBlock;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  resolvedForm?: LeadForm | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "group/block relative cursor-pointer outline outline-2 -outline-offset-2 outline-transparent transition-colors",
        selected && "outline-primary",
        !selected && "hover:outline-primary/30",
        isDragging && "z-10 opacity-70",
      )}
    >
      <BlockView block={block} resolvedForm={resolvedForm} />

      <div
        className={cn(
          "pointer-events-none absolute -top-3 right-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/block:opacity-100",
          selected && "opacity-100",
        )}
      >
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-sm">
          <button
            type="button"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move up"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
