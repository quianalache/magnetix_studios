"use client";

import { ChevronDown, ChevronUp, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One row in a block list — icon + label, up/down arrows to reorder (swaps
 * `order` with the sibling, mirroring `LessonNavRow` in the lessons editor
 * rather than introducing drag-and-drop), click to select, optional delete
 * (core sidebar blocks like Progress/Instructor omit it — not deletable,
 * only hideable).
 */
export function BlockListRow({
  label,
  icon: Icon,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors",
        selected ? "bg-rose-50" : "hover:bg-muted/60",
      )}
    >
      <div className="flex flex-col opacity-0 group-hover:opacity-100">
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onSelect}
        className={cn(
          "flex flex-1 items-center gap-2 truncate py-0.5 text-left text-sm",
          selected ? "font-medium text-rose-950" : "text-foreground",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-rose-950" : "text-muted-foreground")} />
        <span className="truncate">{label}</span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
          title="Delete block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
