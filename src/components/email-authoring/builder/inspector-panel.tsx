"use client";

import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ButtonBlockEditor,
  ColumnsBlockEditor,
  ImageBlockEditor,
  VideoBlockEditor,
} from "@/components/broadcasts/block-editors";
import type {
  EmailBlock,
  EmailBlockAlign,
  EmailBlockNonColumn,
} from "@/types/broadcast-content";

/**
 * Right "Settings" inspector. Two sections per task instruction 6:
 *  - Email Details (Subject/Preheader) — always visible, since it applies
 *    to the whole EmailDocument, not a block.
 *  - Selected Block — appears only once a canvas block is selected;
 *    reuses ImageBlockEditor/VideoBlockEditor/ButtonBlockEditor/
 *    ColumnsBlockEditor VERBATIM (same components block-editors.tsx already
 *    shipped for the old stacked-card composer) — no second implementation
 *    of image/video/button/columns settings exists anywhere in the app.
 *
 * Text blocks are edited directly in the canvas (TextBlockEditor inline —
 * see canvas-block.tsx), so their Selected Block section here is limited to
 * alignment, which is the one Text setting that doesn't make sense as an
 * in-canvas gesture.
 */

const ALIGN_OPTIONS: { value: EmailBlockAlign; icon: typeof AlignLeft }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

function InlineAlignPicker({
  value,
  onChange,
}: {
  value: EmailBlockAlign | undefined;
  onChange: (align: EmailBlockAlign) => void;
}) {
  return (
    <div className="flex gap-1">
      {ALIGN_OPTIONS.map(({ value: v, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-label={`Align ${v}`}
          onClick={() => onChange(v)}
          className={cn(
            "rounded border p-1.5",
            (value ?? "left") === v
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

export function InspectorPanel({
  subject,
  preheader,
  onSubjectChange,
  onPreheaderChange,
  selectedBlock,
  onBlockChange,
  saId,
  draftId,
  subjectAccessory,
  preheaderAccessory,
}: {
  subject: string;
  preheader: string;
  onSubjectChange: (value: string) => void;
  onPreheaderChange: (value: string) => void;
  selectedBlock: EmailBlock | null;
  onBlockChange: (next: EmailBlock) => void;
  saId: string;
  draftId: string;
  /** Optional accessory rendered next to each label — e.g. Email Templates'
   *  "Insert personalization" tag menu. Neither Broadcast surface has an
   *  equivalent today, so both are omitted there rather than fabricated. */
  subjectAccessory?: React.ReactNode;
  preheaderAccessory?: React.ReactNode;
}) {
  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Email Details</h3>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="builder-subject" className="text-xs">
              Subject Line
            </Label>
            {subjectAccessory}
          </div>
          <Input
            id="builder-subject"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Subject line"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="builder-preheader" className="text-xs">
              Preheader Text
            </Label>
            {preheaderAccessory}
          </div>
          <Input
            id="builder-preheader"
            value={preheader}
            onChange={(e) => onPreheaderChange(e.target.value)}
            placeholder="Preview text shown in the inbox"
          />
        </div>
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Selected Block</h3>
        {!selectedBlock && (
          <p className="text-muted-foreground text-xs">
            Click a block in the canvas to edit its settings here.
          </p>
        )}
        {selectedBlock?.type === "text" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Alignment</Label>
            <InlineAlignPicker
              value={selectedBlock.align}
              onChange={(align) => onBlockChange({ ...selectedBlock, align })}
            />
            <p className="text-muted-foreground text-xs">
              Edit the text directly in the canvas.
            </p>
          </div>
        )}
        {selectedBlock?.type === "image" && (
          <ImageBlockEditor
            block={selectedBlock}
            saId={saId}
            draftId={draftId}
            onChange={onBlockChange}
          />
        )}
        {selectedBlock?.type === "video" && (
          <VideoBlockEditor
            block={selectedBlock}
            saId={saId}
            draftId={draftId}
            onChange={onBlockChange}
          />
        )}
        {selectedBlock?.type === "button" && (
          <ButtonBlockEditor block={selectedBlock} onChange={onBlockChange} />
        )}
        {selectedBlock?.type === "divider" && (
          <p className="text-muted-foreground text-xs">
            A horizontal divider — no settings.
          </p>
        )}
        {selectedBlock?.type === "spacer" && (
          <div className="space-y-1.5">
            <Label htmlFor="spacer-height" className="text-xs">
              Height (px)
            </Label>
            <Input
              id="spacer-height"
              type="number"
              min={0}
              max={600}
              value={selectedBlock.heightPx ?? 24}
              onChange={(e) =>
                onBlockChange({
                  ...selectedBlock,
                  heightPx: Number(e.target.value) || 0,
                } as EmailBlockNonColumn)
              }
            />
          </div>
        )}
        {selectedBlock?.type === "columns" && (
          <ColumnsBlockEditor block={selectedBlock} onChange={onBlockChange} />
        )}
      </section>
    </div>
  );
}
