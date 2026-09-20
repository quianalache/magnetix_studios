import type {
  EmailBlock,
  EmailBlockNonColumn,
} from "@/types/broadcast-content";

/**
 * Shared visual Email Builder (2026-09-20) — the one place a brand-new
 * block is instantiated and the one place "is this block incomplete"
 * lives, so the Elements panel, the Canvas's draft-tolerant placeholder
 * state, and Strict Send validation can never quietly drift apart from
 * each other. Mirrors the existing `newBlock`/`BLOCK_LABELS` pattern in
 * email-blocks-editor.tsx (Workflow Design Email) — extracted here rather
 * than imported from there since that file's own factory intentionally
 * omits Columns' 2-column default shape variations this builder needs and
 * is scoped to a different, already-shipped consumer this task isn't
 * touching.
 */

let idCounter = 0;
export function newBlockId(): string {
  idCounter += 1;
  return `blk_${Date.now()}_${idCounter}`;
}

export type BuilderBlockType = EmailBlock["type"];

export const ELEMENT_TYPES: BuilderBlockType[] = [
  "text",
  "image",
  "button",
  "divider",
  "spacer",
  "video",
  "columns",
];

export function newBlock(type: BuilderBlockType): EmailBlock {
  switch (type) {
    case "text":
      // Genuinely empty — TextBlockEditor's own Placeholder extension shows
      // "Write something…" visually without it ever being stored content.
      return { id: newBlockId(), type: "text", html: "<p></p>" };
    case "image":
      return { id: newBlockId(), type: "image", src: "", alt: "" };
    case "video":
      return {
        id: newBlockId(),
        type: "video",
        videoUrl: "",
        thumbnailSrc: "",
        alt: "",
      };
    case "button":
      return {
        id: newBlockId(),
        type: "button",
        label: "Click here",
        href: "",
      };
    case "divider":
      return { id: newBlockId(), type: "divider" };
    case "spacer":
      return { id: newBlockId(), type: "spacer", heightPx: 24 };
    case "columns":
      return {
        id: newBlockId(),
        type: "columns",
        columns: [
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
        ],
      };
  }
}

/**
 * Draft-tolerant completeness check for ONE block — the canvas's own
 * "incomplete" placeholder/badge state (never omit, always show
 * something), matching the SAME rules `validateBlock` (lib/email/validate.ts)
 * enforces at Send time, just evaluated directly against the legacy
 * `BroadcastContent` block shape the builder edits, so a keystroke doesn't
 * need a round-trip through the canonical EmailDocument adapter just to
 * light up a warning badge.
 */
export function isBlockIncomplete(block: EmailBlockNonColumn): boolean {
  switch (block.type) {
    case "image":
      return !block.src.trim() || !block.alt.trim();
    case "button":
      return !block.label.trim() || !block.href.trim();
    case "video":
      return (
        !block.videoUrl.trim() ||
        !block.thumbnailSrc.trim() ||
        !block.alt.trim()
      );
    case "spacer":
      return (block.heightPx ?? 16) < 0 || (block.heightPx ?? 16) > 600;
    case "text":
    case "divider":
      return false;
  }
}

/** True if ANY block in the document (including nested column children) is
 *  incomplete — drives Send/Continue being blocked, and is the thing
 *  `jumpToFirstIncomplete` below finds the target for. */
export function documentHasIncompleteBlock(blocks: EmailBlock[]): boolean {
  return blocks.some((b) =>
    b.type === "columns"
      ? b.columns.some((c) => c.blocks.some(isBlockIncomplete))
      : isBlockIncomplete(b)
  );
}

/** First incomplete block's id (top-level, or the top-level Columns block
 *  that contains an incomplete child) — used to scroll/select it in the
 *  canvas so the owner can jump straight to the problem instead of hunting
 *  for it after a blocked Send. */
export function firstIncompleteBlockId(blocks: EmailBlock[]): string | null {
  for (const b of blocks) {
    if (b.type === "columns") {
      if (b.columns.some((c) => c.blocks.some(isBlockIncomplete))) return b.id;
      continue;
    }
    if (isBlockIncomplete(b)) return b.id;
  }
  return null;
}
