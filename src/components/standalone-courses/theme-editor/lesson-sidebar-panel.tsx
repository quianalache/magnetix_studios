"use client";

import { useState } from "react";
import { Plus, User, ListTree, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockListRow } from "./block-list-row";
import {
  BlockForm,
  InstructorBlockForm,
  CourseContentBlockForm,
  DownloadsBlockForm,
} from "./block-form";
import {
  createDefaultBlock,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_ICONS,
  SIDEBAR_ADDABLE_BLOCK_TYPES,
} from "@/lib/standalone-courses/theme-block-defaults";
import { uploadCourseThemeImage } from "@/lib/community/upload-image";
import { isLessonCoreSidebarBlock } from "@/types/course-theme";
import type { LessonSidebarBlock, CourseBlockType } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";

const CORE_LABELS: Record<"instructor" | "courseContent" | "downloads", string> = {
  instructor: "Instructor",
  courseContent: "Course Content",
  downloads: "Downloads",
};

const CORE_ICONS: Record<"instructor" | "courseContent" | "downloads", typeof User> = {
  instructor: User,
  courseContent: ListTree,
  downloads: Download,
};

/** Lesson page's Sidebar region — 3 core blocks (Course Content, Instructor,
 *  Downloads; reorderable, never deletable) mixed into the same ordered
 *  list as the 4 freely-addable block types. No Progress block (that's a
 *  Course-Home concept — a single lesson has no aggregate progress bar). */
export function LessonSidebarPanel({
  blocks,
  onChange,
  saId,
  courseId,
  otherOffers,
}: {
  blocks: LessonSidebarBlock[];
  onChange: (blocks: LessonSidebarBlock[]) => void;
  saId: string;
  courseId: string;
  otherOffers: CourseOffer[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);
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

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        {sorted.map((b, i) => (
          <BlockListRow
            key={b.id}
            label={isLessonCoreSidebarBlock(b) ? CORE_LABELS[b.type] : BLOCK_TYPE_LABELS[b.type]}
            icon={isLessonCoreSidebarBlock(b) ? CORE_ICONS[b.type] : BLOCK_TYPE_ICONS[b.type]}
            selected={selectedId === b.id}
            onSelect={() => setSelectedId(b.id)}
            onMoveUp={() => move(b.id, -1)}
            onMoveDown={() => move(b.id, 1)}
            onDelete={isLessonCoreSidebarBlock(b) ? undefined : () => remove(b.id)}
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

      <div>
        {!selected && (
          <p className="text-sm text-muted-foreground">Select a block to edit.</p>
        )}
        {selected && selected.type === "instructor" && (
          <InstructorBlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            saId={saId}
            courseId={courseId}
          />
        )}
        {selected && selected.type === "courseContent" && (
          <CourseContentBlockForm
            value={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
          />
        )}
        {selected && selected.type === "downloads" && (
          <DownloadsBlockForm
            value={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
          />
        )}
        {selected && !isLessonCoreSidebarBlock(selected) && (
          <BlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            onUploadImage={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
            otherOffers={otherOffers}
          />
        )}
      </div>
    </div>
  );
}
