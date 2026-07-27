"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockListRow } from "@/components/standalone-courses/theme-editor/block-list-row";
import { BlockForm } from "@/components/standalone-courses/theme-editor/block-form";
import {
  createDefaultBlock,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_ICONS,
  BODY_ADDABLE_BLOCK_TYPES,
  SIDEBAR_ADDABLE_BLOCK_TYPES,
} from "@/lib/standalone-courses/theme-block-defaults";
import { uploadCourseOfferThemeImage } from "@/lib/community/upload-image";
import type { CourseBlock, CourseBlockType } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";

/**
 * Offer Body/Sidebar region — both are just a freely-ordered list of the 6
 * optional block types, same as `BodyPanel` for courses. One shared
 * component covers both tabs since, unlike courses, an Offer's sidebar has
 * no core Progress/Instructor blocks to special-case (see
 * `DEFAULT_OFFER_THEME`'s doc comment).
 */
export function OfferBlockPanel({
  blocks,
  onChange,
  saId,
  offerId,
  otherOffers,
  region,
}: {
  blocks: CourseBlock[];
  onChange: (blocks: CourseBlock[]) => void;
  saId: string;
  offerId: string;
  otherOffers: CourseOffer[];
  /** Which "Add block" menu to offer — matches the region restriction the
   *  Standalone Course editor uses (Body: text/image/video/custom; Sidebar:
   *  image/crossSell/callToAction/custom). */
  region: "body" | "sidebar";
}) {
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const selected = sorted.find((b) => b.id === selectedId) ?? null;
  const addableTypes =
    region === "body" ? BODY_ADDABLE_BLOCK_TYPES : SIDEBAR_ADDABLE_BLOCK_TYPES;

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
            label={BLOCK_TYPE_LABELS[b.type]}
            icon={BLOCK_TYPE_ICONS[b.type]}
            selected={selectedId === b.id}
            onSelect={() => setSelectedId(b.id)}
            onMoveUp={() => move(b.id, -1)}
            onMoveDown={() => move(b.id, 1)}
            onDelete={() => remove(b.id)}
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
              {addableTypes.map((t) => {
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
        {selected ? (
          <BlockForm
            block={selected}
            onChange={(next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)))}
            onUploadImage={(file) => uploadCourseOfferThemeImage(file, saId, offerId, "block")}
            otherOffers={otherOffers}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {blocks.length === 0 ? "No blocks yet — add one to get started." : "Select a block to edit."}
          </p>
        )}
      </div>
    </div>
  );
}
