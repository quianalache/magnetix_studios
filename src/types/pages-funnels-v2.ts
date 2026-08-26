import type { BackgroundStyle, BlockAlignment, BlockSpacing, ButtonStyle } from "@/types/pages-funnels";

/**
 * Pages & Funnels V2 — the fixed 4-level tree (Section → Row → Column →
 * Element) approved in the V2 architecture audit. This is PHASE A ONLY:
 * types + a recursive renderer, added ALONGSIDE the V1 flat `PageBlock[]`
 * system in src/types/pages-funnels.ts. Nothing here is wired into the
 * editor, `/p/[pageId]`, Firestore, or templates yet — see that file's own
 * doc comment for the V1 model this sits next to, untouched.
 *
 * Deliberately NOT a generic recursive `Node` type — the type system itself
 * enforces the fixed depth: a Section's `rows` can only hold `RowNode`s, a
 * Row's `columns` only `ColumnNode`s, a Column's `elements` only
 * `ElementNode`s, and `ElementNode` has no `children` field at all. There is
 * no way to accidentally nest a Column inside a Column, or a Row inside a
 * Row, because no type offers a slot for it.
 *
 * Shared vocabulary (`BlockAlignment`, `BackgroundStyle`, `ButtonStyle`,
 * `BlockSpacing`) is imported and reused from the V1 types file rather than
 * redefined — per the audit, style should mean one thing across the whole
 * feature, not a V1 dialect and a V2 dialect.
 */

// ---------- ids ----------

/** Every node at every level (Section/Row/Column/Element) gets one of
 *  these — see src/lib/pages-funnels/v2/nodes.ts for the generator, which
 *  reuses the V1 `newBlockId()` scheme rather than inventing a new one.
 *  Deliberately flat/opaque — NOT path-encoded (e.g. not
 *  "section1.row0.col1") — the tree's fixed, shallow depth makes walking
 *  from any id to its ancestors cheap on demand, so a path never needs to
 *  be baked into the id itself. */
export type NodeId = string;

// ---------- responsive foundation (types only — see file doc comment) ----------

/**
 * Minimal typed foundation for future per-breakpoint overrides — desktop
 * values live on the node's own fields; `tablet`/`mobile` only carry the
 * (partial) deltas from those, never a full second copy of the node. This
 * is deliberately just a type-level placeholder in Phase A: nothing in the
 * renderer reads `responsive` yet, and only `ColumnStyle` (the field where
 * responsive behavior is most obviously needed — column stacking/width)
 * carries it, to prove the shape without speculatively bolting it onto
 * every node. Extending it to Section (e.g. `hiddenOn`) or other node
 * styles is a later, additive change to this same generic — not a
 * redesign — once a real rendering behavior needs it.
 */
export interface Responsive<T> {
  tablet?: Partial<T>;
  mobile?: Partial<T>;
}

// ---------- element (leaf) types ----------

interface ElementBase {
  id: NodeId;
}

export interface HeadingElementContent {
  text: string;
  level: "h1" | "h2" | "h3";
  alignment: BlockAlignment;
}
export interface HeadingElement extends ElementBase {
  type: "heading";
  content: HeadingElementContent;
}

export interface TextElementContent {
  text: string;
  alignment: BlockAlignment;
}
export interface TextElement extends ElementBase {
  type: "text";
  content: TextElementContent;
}

export interface ButtonElementContent {
  text: string;
  link: string;
  openInNewTab: boolean;
  style: ButtonStyle;
  alignment: BlockAlignment;
}
export interface ButtonElement extends ElementBase {
  type: "button";
  content: ButtonElementContent;
}

export interface ImageElementContent {
  src: string;
  alt: string;
  link: string;
}
export interface ImageElement extends ElementBase {
  type: "image";
  content: ImageElementContent;
}

/** New in Phase A — Video didn't exist as a V1 block. Kept intentionally
 *  minimal: a raw embeddable URL (YouTube/Vimeo/Loom/mp4) + an optional
 *  caption. No oEmbed/provider-parsing logic — that's renderer behavior,
 *  not a type-completeness concern for this phase. */
export interface VideoElementContent {
  url: string;
  caption: string;
}
export interface VideoElement extends ElementBase {
  type: "video";
  content: VideoElementContent;
}

export interface DividerElementContent {
  style: "line" | "space";
}
export interface DividerElement extends ElementBase {
  type: "divider";
  content: DividerElementContent;
}

export interface SpacerElementContent {
  height: number;
}
export interface SpacerElement extends ElementBase {
  type: "spacer";
  content: SpacerElementContent;
}

/** References an existing native Magnetix Form by id — same architecture
 *  V1's Form block already uses. `formName` is a denormalized display
 *  snapshot only; the renderer always resolves the live `LeadForm` by
 *  `formId` rather than storing field data here. See ElementView's "form"
 *  case and the file doc comment on src/types/forms.ts's `LeadForm`. */
export interface FormElementContent {
  formId: string | null;
  formName: string | null;
}
export interface FormElement extends ElementBase {
  type: "form";
  content: FormElementContent;
}

/** Phase A leaf types — matches the V1 primitives that map 1:1 onto a
 *  future Element (heading/text/button/image/divider/spacer/form) plus the
 *  new Video element. Hero/Features/Testimonials/FAQ/CTA are deliberately
 *  NOT here — per the audit, those become Section *templates* (compositions
 *  of these primitives) in a later phase, not element types of their own. */
export type ElementNode =
  | HeadingElement
  | TextElement
  | ButtonElement
  | ImageElement
  | VideoElement
  | DividerElement
  | SpacerElement
  | FormElement;

export type ElementType = ElementNode["type"];

// ---------- column ----------

/** Constrained fraction presets — not an arbitrary percentage/px input, per
 *  the audit's "structured control" principle applied to style too. */
export type ColumnWidth = "auto" | "1/4" | "1/3" | "1/2" | "2/3" | "3/4" | "full";

export interface ColumnStyle {
  /** Content alignment *within* the column (text/inline elements) — reuses
   *  the same `BlockAlignment` vocabulary as every V1 block already did. */
  alignment: BlockAlignment;
}

export interface ColumnNode {
  id: NodeId;
  type: "column";
  width: ColumnWidth;
  style: ColumnStyle;
  /** Type-completeness only in Phase A — nothing reads this yet. Column
   *  width is the field responsive overrides are most obviously needed for
   *  (stacking on mobile), so it's the one place this phase proves the
   *  `Responsive<T>` shape actually composes cleanly. */
  responsive?: Responsive<Pick<ColumnNode, "width"> & ColumnStyle>;
  elements: ElementNode[];
}

// ---------- row ----------

/** A Row's column *count* is implied by how many `ColumnNode`s it holds —
 *  `preset` is metadata the left-panel "1/2/3 Column" inserts use to know
 *  what they built and to offer sensible add/remove-column affordances
 *  later; it is not itself the source of truth for column count. */
export type RowColumnPreset = "1col" | "2col" | "3col" | "flex";

export interface RowLayout {
  preset: RowColumnPreset;
  /** Gap between columns, in px. */
  gap: number;
  verticalAlign: "top" | "center" | "bottom";
}

export interface RowNode {
  id: NodeId;
  type: "row";
  layout: RowLayout;
  columns: ColumnNode[];
}

// ---------- section ----------

export type SectionMaxWidth = "contained" | "wide" | "full";

export interface SectionStyle {
  background: BackgroundStyle;
  maxWidth: SectionMaxWidth;
}

export interface SectionNode {
  id: NodeId;
  type: "section";
  style: SectionStyle;
  /** Reuses V1's `BlockSpacing` (top/bottom padding only) as-is rather than
   *  inventing a V2-specific spacing shape in this phase — left/right
   *  padding and other spacing controls are a later, additive change to
   *  whichever type ends up owning them, not a Phase A concern. */
  spacing: BlockSpacing;
  rows: RowNode[];
}

/** A whole page's V2 content — NOT yet attached to `PageDoc` (that's Phase
 *  B, deliberately deferred so this phase stays fully additive and
 *  isolated). Exported so fixtures/renderer code have one canonical name
 *  for "an array of sections" instead of repeating `SectionNode[]`. */
export type PageSectionTree = SectionNode[];
