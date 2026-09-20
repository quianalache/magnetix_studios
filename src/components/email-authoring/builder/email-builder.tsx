"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Laptop, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { ElementsPanel } from "./elements-panel";
import { InspectorPanel } from "./inspector-panel";
import { CanvasDropZone } from "./canvas";
import { CanvasBlock } from "./canvas-block";
import { PreviewModal } from "./preview-modal";
import { newBlock, type BuilderBlockType } from "./block-factory";
import type { BroadcastContent, EmailBlock } from "@/types/broadcast-content";

/**
 * Shared visual Email Builder shell (2026-09-20) — the ONE authoring
 * surface for Tenant Broadcasts, Tenant Email Templates, Agency Broadcasts,
 * and Agency Email Templates (task's standing "shared-first" rule). Knows
 * nothing about tenant-vs-Agency business rules, drafts vs sends, or
 * broadcast vs template workflow — those all live in the four consumer
 * files, which render their own top bar (Save/Preview/Send/step controls)
 * around this component and pass a thin set of props/callbacks in.
 *
 * `content`/`onChange` is the existing legacy `BroadcastContent` shape both
 * Broadcasts AND Templates already persist — no new document shape, no
 * migration (task instructions 13, 16).
 */

export interface EmailBuilderProps {
  content: BroadcastContent;
  onChange: (content: BroadcastContent) => void;
  subject: string;
  preheader: string;
  onSubjectChange: (value: string) => void;
  onPreheaderChange: (value: string) => void;
  /** Scopes uploaded image/video-thumbnail storage paths (tenant subAccountId, or the Agency's own storage scope id). */
  saId: string;
  /** Stable id (broadcast/template/draft id) — scopes uploaded storage paths. */
  draftId: string;
  /** Resolves the exact same-renderer preview HTML the parent's "Preview" top-bar button triggers. */
  getPreviewHtml: () => Promise<string>;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  /** Optional accessory next to Subject/Preheader labels — e.g. Email
   *  Templates' "Insert personalization" tag menu. Omitted where the
   *  consumer surface has no equivalent (both Broadcast composers today). */
  subjectAccessory?: React.ReactNode;
  preheaderAccessory?: React.ReactNode;
  /** Id of a block Strict Send validation wants to jump to (see firstIncompleteBlockId). */
  jumpToBlockId?: string | null;
}

export function EmailBuilder({
  content,
  onChange,
  subject,
  preheader,
  onSubjectChange,
  onPreheaderChange,
  saId,
  draftId,
  getPreviewHtml,
  previewOpen,
  onPreviewOpenChange,
  subjectAccessory,
  preheaderAccessory,
  jumpToBlockId,
}: EmailBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    jumpToBlockId ?? null
  );
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  // KeyboardSensor gives block reordering a keyboard fallback (task
  // instruction 20) — tab to a block's drag handle, then arrow
  // keys/space reorder it, matching dnd-kit's built-in sortable keyboard
  // support.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Strict Send validation (task instruction 10/11) — when a consumer's
  // blocked Send/Test Send names an incomplete block via `jumpToBlockId`,
  // select it here so it's visibly highlighted and scrolled to, even if
  // it's the SAME block id as a previous jump (the owner may click Send
  // again after a failed fix attempt).
  useEffect(() => {
    if (jumpToBlockId) setSelectedId(jumpToBlockId);
  }, [jumpToBlockId]);

  const blocks = content.blocks;
  function setBlocks(next: EmailBlock[]) {
    onChange({ ...content, blocks: next });
  }

  function handleAdd(type: BuilderBlockType, atIndex?: number) {
    const block = newBlock(type);
    const next = [...blocks];
    next.splice(atIndex ?? next.length, 0, block);
    setBlocks(next);
    setSelectedId(block.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { source?: string; blockType?: BuilderBlockType }
      | undefined;

    if (activeData?.source === "palette" && activeData.blockType) {
      const overIndex = blocks.findIndex((b) => b.id === over.id);
      handleAdd(
        activeData.blockType,
        overIndex === -1 ? undefined : overIndex + 1
      );
      return;
    }

    if (active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setBlocks(arrayMove(blocks, oldIndex, newIndex));
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-center">
          <div className="bg-muted/40 flex items-center gap-1 rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                viewport === "desktop"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              <Laptop className="h-4 w-4" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                viewport === "mobile"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              <Smartphone className="h-4 w-4" /> Mobile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          <div className="bg-background rounded-lg border lg:h-[calc(100vh-260px)] lg:min-h-[520px]">
            <ElementsPanel onAdd={(type) => handleAdd(type)} />
          </div>

          <div className="bg-muted/20 flex justify-center overflow-y-auto rounded-lg border p-4 lg:h-[calc(100vh-260px)] lg:min-h-[520px]">
            <div
              className={cn(
                "w-full rounded-lg bg-white shadow-sm transition-all",
                viewport === "desktop" ? "max-w-[640px]" : "max-w-[375px]"
              )}
            >
              <CanvasDropZone
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                emptyState={
                  <div className="text-muted-foreground flex min-h-[400px] flex-col items-center justify-center gap-2 p-8 text-center text-sm">
                    <p className="font-medium">This email is empty</p>
                    <p className="text-xs">
                      Drag an element from the left panel to get started.
                    </p>
                  </div>
                }
                renderBlock={(block) => (
                  <CanvasBlock
                    block={block}
                    onChange={(next) =>
                      setBlocks(
                        blocks.map((b) => (b.id === next.id ? next : b))
                      )
                    }
                    onDelete={() => {
                      setBlocks(blocks.filter((b) => b.id !== block.id));
                      if (selectedId === block.id) setSelectedId(null);
                    }}
                  />
                )}
              />
            </div>
          </div>

          <div className="bg-background rounded-lg border lg:h-[calc(100vh-260px)] lg:min-h-[520px]">
            <InspectorPanel
              subject={subject}
              preheader={preheader}
              onSubjectChange={onSubjectChange}
              onPreheaderChange={onPreheaderChange}
              selectedBlock={selectedBlock}
              onBlockChange={(next) =>
                setBlocks(blocks.map((b) => (b.id === next.id ? next : b)))
              }
              saId={saId}
              draftId={draftId}
              subjectAccessory={subjectAccessory}
              preheaderAccessory={preheaderAccessory}
            />
          </div>
        </div>
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={() => onPreviewOpenChange(false)}
        getHtml={getPreviewHtml}
      />
    </DndContext>
  );
}
