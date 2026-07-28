"use client";

import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockListRow } from "./block-list-row";
import { BlockForm, ProgressBlockForm, InstructorBlockForm } from "./block-form";
import {
  createDefaultBlock,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_ICONS,
  SIDEBAR_ADDABLE_BLOCK_TYPES,
} from "@/lib/standalone-courses/theme-block-defaults";
import { uploadCourseThemeImage } from "@/lib/community/upload-image";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { SidebarBlock, CourseBlockType } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";

const CORE_LABELS: Record<"progress" | "instructor", string> = {
  progress: "Progress",
  instructor: "Instructor",
};

/** Sidebar region — the 2 core blocks (Progress, Instructor; reorderable,
 *  hideable, never deletable) mixed into the same ordered list as the 6
 *  optional block types. List and the selected block's settings form are
 *  two full-width views (not a side-by-side split) — the settings panel is
 *  only ~320px wide, and splitting that further left the form column too
 *  narrow for its own content (the rich-text editor in particular). */
export function SidebarPanel({
  blocks,
  onChange,
  saId,
  courseId,
  otherOffers,
}: {
  blocks: SidebarBlock[];
  onChange: (blocks: SidebarBlock[]) => void;
  saId: string;
  courseId: string;
  otherOffers: CourseOffer[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const selected = sorted.find((b) => b.id === selectedId) ?? null;

  function addBlock(type: CourseBlockType) {
    const maxOrder = blocks.reduce((m, b) => Math.max(m, b.order), -1);
    const next = createDefaultBlock(type, maxOrder + 1);
    onChange([...blocks, next]);
    setSelectedId(next.id);
    setAddOpen(false);
  }
  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((b) => b.id === id);
    const other = sorted[idx + dir];
    if (!other) return;
    const a = sorted[idx];
    onChange(
      blocks.map((b) =>
        b.id === a.id ? { ...b, order: other.order } : b.id === other.id ? { ...b, order: a.order } : b,
      ),
    );
  }
  function remove(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  if (selected) {
    const label = isCoreSidebarBlock(selected) ? CORE_LABELS[selected.type] : BLOCK_TYPE_LABELS[selected.type];
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {label}
        </button>
        {selected.type === "progress" && (
          <ProgressBlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            saId={saId}
            courseId={courseId}
          />
        )}
        {selected.type === "instructor" && (
          <InstructorBlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            saId={saId}
            courseId={courseId}
          />
        )}
        {!isCoreSidebarBlock(selected) && (
          <BlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            onUploadImage={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
            otherOffers={otherOffers}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((b, i) => (
        <BlockListRow
          key={b.id}
          label={isCoreSidebarBlock(b) ? CORE_LABELS[b.type] : BLOCK_TYPE_LABELS[b.type]}
          icon={BLOCK_TYPE_ICONS[b.type]}
          selected={false}
          onSelect={() => setSelectedId(b.id)}
          onMoveUp={() => move(b.id, -1)}
          onMoveDown={() => move(b.id, 1)}
          onDelete={isCoreSidebarBlock(b) ? undefined : () => remove(b.id)}
          canMoveUp={i > 0}
          canMoveDown={i < sorted.length - 1}
        />
      ))}
      <div className="relative pt-1">
        <Button
          size="sm"
          onClick={() => setAddOpen((o) => !o)}
          className="w-full rounded-full bg-rose-100 text-rose-950 hover:bg-rose-200"
        >
          <Plus className="h-4 w-4" /> Add Block
        </Button>
        {addOpen && (
          <div className="absolute z-10 mt-1 w-full space-y-0.5 rounded-xl border bg-background p-1.5 shadow-lg">
            {SIDEBAR_ADDABLE_BLOCK_TYPES.map((t) => {
              const Icon = BLOCK_TYPE_ICONS[t];
              return (
                <button
                  key={t}
                  onClick={() => addBlock(t)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {BLOCK_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
