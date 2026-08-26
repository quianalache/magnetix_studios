import { newBlockId } from "@/lib/pages-funnels/blocks";
import {
  DEFAULT_BLOCK_SPACING,
  type BlockSpacing,
} from "@/types/pages-funnels";
import type {
  ColumnNode,
  ColumnWidth,
  ElementNode,
  ElementType,
  RowColumnPreset,
  RowNode,
  SectionNode,
} from "@/types/pages-funnels-v2";

/**
 * V2 tree factories — the Phase A equivalent of
 * src/lib/pages-funnels/blocks.ts's `createBlock`/`duplicateBlock`, one
 * level deeper. Not wired into the editor or Firestore yet; used by the V2
 * fixtures (fixtures.ts) and, later, by Phase D's canvas "add block" flow.
 */

/** Reuses the exact V1 id scheme (see blocks.ts) rather than inventing a
 *  parallel generator — a Section/Row/Column/Element id looks identical to
 *  a V1 block id, which is fine: ids are opaque, uniqueness is all that
 *  matters, and there's no reason for a second random-id implementation. */
export const newNodeId = newBlockId;

export function defaultElementContent(type: ElementType): ElementNode["content"] {
  switch (type) {
    case "heading":
      return { text: "Heading", level: "h2", alignment: "left" };
    case "text":
      return { text: "Add your copy here.", alignment: "left" };
    case "button":
      return { text: "Click here", link: "#", openInNewTab: false, style: "primary", alignment: "left" };
    case "image":
      return { src: "", alt: "", link: "" };
    case "video":
      return { url: "", caption: "" };
    case "divider":
      return { style: "line" };
    case "spacer":
      return { height: 48 };
    case "form":
      return { formId: null, formName: null };
  }
}

export function createElement(type: ElementType): ElementNode {
  return { id: newNodeId(), type, content: defaultElementContent(type) } as ElementNode;
}

export function createColumn(width: ColumnWidth = "auto", elements: ElementNode[] = []): ColumnNode {
  return {
    id: newNodeId(),
    type: "column",
    width,
    style: { alignment: "left" },
    elements,
  };
}

const PRESET_COLUMN_WIDTHS: Record<RowColumnPreset, ColumnWidth[]> = {
  "1col": ["full"],
  "2col": ["1/2", "1/2"],
  "3col": ["1/3", "1/3", "1/3"],
  flex: ["auto", "auto"],
};

/** Builds a Row with empty columns matching the chosen preset — the "1
 *  Column / 2 Columns / 3 Columns / Flexible Row" left-panel inserts from
 *  the V2 audit's Layout category will call this once wired in a later
 *  phase; for now it's exercised by the fixtures below. */
export function createRow(preset: RowColumnPreset = "1col"): RowNode {
  return {
    id: newNodeId(),
    type: "row",
    layout: { preset, gap: 24, verticalAlign: "top" },
    columns: PRESET_COLUMN_WIDTHS[preset].map((w) => createColumn(w)),
  };
}

export function createSection(rows: RowNode[] = [], spacing: BlockSpacing = { ...DEFAULT_BLOCK_SPACING }): SectionNode {
  return {
    id: newNodeId(),
    type: "section",
    style: { background: "none", maxWidth: "contained" },
    spacing,
    rows,
  };
}
