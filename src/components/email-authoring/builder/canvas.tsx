"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isBlockIncomplete } from "./block-factory";
import type { EmailBlock, EmailBlockAlign } from "@/types/broadcast-content";

/**
 * The Canvas — the email itself is the thing being edited (Shared Visual
 * Email Builder, 2026-09-20). Every block renders its REAL visual
 * representation directly (an actual <img>, an actual button-styled <a>,
 * actual TipTap-rendered rich text) rather than a config-card describing
 * it — a separate detached preview is no longer needed to see what the
 * email currently looks like.
 *
 * Draft-tolerant by construction: `isBlockIncomplete` NEVER hides a block
 * here (unlike the Preview/Send renderer's `allowIncomplete` mode, which
 * omits an incomplete block entirely) — it only adds a small amber
 * "Incomplete" badge + dashed outline, exactly the "must NOT blank the
 * rest of the email" requirement. This is the piece that makes the
 * regression case (an incomplete Image sitting next to a valid "hello"
 * Text block) structurally impossible to reproduce: the canvas never runs
 * `assertRenderable`/throws at all, it just renders each block's own
 * React representation independently.
 */

const ALIGN_TO_FLEX: Record<EmailBlockAlign, string> = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
};

export function CanvasDropZone({
  blocks,
  selectedId,
  onSelect,
  renderBlock,
  emptyState,
}: {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderBlock: (block: EmailBlock) => React.ReactNode;
  emptyState: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-root" });

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelect(null)}
      className={cn(
        "min-h-[400px] space-y-0 rounded-lg border-2 border-dashed p-1 transition-colors",
        isOver ? "border-primary/50 bg-primary/5" : "border-transparent"
      )}
    >
      {blocks.length === 0 ? (
        emptyState
      ) : (
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((block) => (
            <CanvasBlockWrapper
              key={block.id}
              id={block.id}
              selected={selectedId === block.id}
              onSelect={onSelect}
            >
              {renderBlock(block)}
            </CanvasBlockWrapper>
          ))}
        </SortableContext>
      )}
    </div>
  );
}

function CanvasBlockWrapper({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      className={cn(
        "group relative rounded-md border-2 px-2 py-1.5 transition-colors",
        selected
          ? "border-primary"
          : "hover:border-primary/30 border-transparent",
        isDragging && "opacity-50",
        isOver && !selected && "border-primary/60 bg-primary/5"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:bg-muted absolute top-1/2 -left-7 hidden -translate-y-1/2 cursor-grab rounded p-1 opacity-0 group-hover:opacity-100 sm:block"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export function IncompleteBadge() {
  return (
    <span className="absolute top-1 right-1 z-10 flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
      <AlertTriangle className="h-2.5 w-2.5" /> Incomplete
    </span>
  );
}

export function BlockDeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      type="button"
      aria-label="Delete block"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      className="text-muted-foreground hover:bg-muted hover:text-destructive absolute top-1 right-1 hidden rounded p-1 opacity-0 group-hover:opacity-100 sm:block"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export { isBlockIncomplete, ALIGN_TO_FLEX };
