"use client";

import { useDraggable } from "@dnd-kit/core";
import {
  AlignLeft,
  ArrowUpDown,
  Columns2,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ELEMENT_TYPES, type BuilderBlockType } from "./block-factory";

/**
 * Left "Elements" rail — mockup's Content/Sections/Saved tabs collapse to
 * just "Content" for v1 (Sections/Saved Blocks have no backing schema
 * support yet — see report section 21/true-remaining-gaps rather than
 * fabricating either). Each card is a real dnd-kit drag SOURCE
 * (`useDraggable`), not a click-only "Add block" button, per task
 * instruction 3.
 */

const ELEMENT_META: Record<
  BuilderBlockType,
  { label: string; icon: typeof AlignLeft }
> = {
  text: { label: "Text", icon: AlignLeft },
  image: { label: "Image", icon: ImageIcon },
  button: { label: "Button", icon: MousePointerClick },
  divider: { label: "Divider", icon: Minus },
  spacer: { label: "Spacer", icon: ArrowUpDown },
  video: { label: "Video", icon: Video },
  columns: { label: "Columns", icon: Columns2 },
};

export function ElementsPanel({
  onAdd,
}: {
  onAdd: (type: BuilderBlockType) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <div className="flex gap-1 text-sm">
          <span className="bg-muted text-foreground rounded-md px-2.5 py-1 font-medium">
            Content
          </span>
          <span
            className="text-muted-foreground/60 rounded-md px-2.5 py-1"
            title="Coming soon"
          >
            Sections
          </span>
          <span
            className="text-muted-foreground/60 rounded-md px-2.5 py-1"
            title="Coming soon"
          >
            Saved
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3">
        {ELEMENT_TYPES.map((type) => (
          <ElementCard key={type} type={type} onAdd={onAdd} />
        ))}
      </div>
      <div className="text-muted-foreground mx-3 mb-3 rounded-lg border border-dashed p-3 text-center text-xs">
        Saved Blocks — save and reuse your favorite content blocks (coming
        soon).
      </div>
    </div>
  );
}

function ElementCard({
  type,
  onAdd,
}: {
  type: BuilderBlockType;
  onAdd: (type: BuilderBlockType) => void;
}) {
  const { label, icon: Icon } = ELEMENT_META[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { source: "palette", blockType: type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAdd(type)}
      className={cn(
        "bg-background text-foreground hover:border-primary/50 hover:bg-muted/50 flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
    >
      <Icon className="text-muted-foreground h-5 w-5" />
      {label}
    </button>
  );
}
