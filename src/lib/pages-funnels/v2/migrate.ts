import type {
  BackgroundStyle,
  BlockAlignment,
  BlockSpacing,
  ButtonBlock,
  CtaBlock,
  DividerBlock,
  FaqBlock,
  FeaturesBlock,
  FormBlock,
  HeadingBlock,
  HeroBlock,
  ImageBlock,
  PageBlock,
  SpacerBlock,
  TestimonialsBlock,
  TextBlock,
} from "@/types/pages-funnels";
import type {
  ColumnNode,
  ColumnWidth,
  ElementNode,
  ElementType,
  RowColumnPreset,
  RowLayout,
  RowNode,
  SectionNode,
} from "@/types/pages-funnels-v2";

/**
 * Phase B — pure, deterministic V1 → V2 conversion. `migrateBlocksToSections`
 * is the only function anything outside this file should call; everything
 * else here is a private per-block-type mapper. No Firestore reads/writes,
 * no network access, no AI, no randomness — same input always produces
 * byte-identical output (see "ID STRATEGY" below and in the final report).
 *
 * NOT wired into the editor, `/p/[pageId]`, Firestore persistence, or
 * templates. `getPageSections` at the bottom is an optional read-time
 * compatibility helper for a *future* phase to call — nothing calls it yet.
 */

// ---------- deterministic ids ----------

/**
 * Migrated V2 node ids are DERIVED from the original V1 block id, not
 * randomly generated (unlike `newNodeId()` in nodes.ts, which V1 block
 * creation and the Phase A fixtures use). This matters because
 * `migrateBlocksToSections` can run repeatedly in memory — e.g. once for
 * `/p/[pageId]`'s SSR render, again for the editor's own "Preview" tab, and
 * again on every React re-render before anything is ever persisted (Phase B
 * does not persist). Random ids on every call would mean:
 *   - React keys changing every render → the V2 renderer subtree remounting
 *     from scratch instead of reconciling, discarding any in-progress local
 *     state (scroll position, open <details>, focus) on every re-migration.
 *   - Two migrations of the SAME unchanged page producing DIFFERENT trees
 *     byte-for-byte, which breaks the "deterministic" requirement outright
 *     and would make any future golden-fixture/analytics-id work unreliable.
 * Deriving from the stable V1 id (and, for repeater items, the item's own
 * already-stable `id`) means the same input always produces the same
 * output — safe to call as often as needed, in memory, before persistence
 * ever enters the picture.
 */
function deriveId(baseId: string, ...parts: string[]): string {
  return [baseId, ...parts].join("-");
}

// ---------- small deterministic node constructors ----------
// Parallel to nodes.ts's createElement/createColumn/createRow/createSection,
// but taking an explicit id instead of generating a random one — kept
// separate from nodes.ts rather than adding an id-override parameter there,
// so nodes.ts's public API (used by future "add a new block" editor flows)
// stays simple, and every deterministic-id call site is visibly migration
// code, not general-purpose node creation.

function element<T extends ElementType>(id: string, type: T, content: Extract<ElementNode, { type: T }>["content"]): ElementNode {
  return { id, type, content } as ElementNode;
}

function column(id: string, width: ColumnWidth, alignment: BlockAlignment, elements: ElementNode[]): ColumnNode {
  return { id, type: "column", width, style: { alignment }, elements };
}

function row(id: string, layout: RowLayout, columns: ColumnNode[]): RowNode {
  return { id, type: "row", layout, columns };
}

function oneColumnLayout(): RowLayout {
  return { preset: "1col", gap: 24, verticalAlign: "top" };
}

function section(id: string, background: BackgroundStyle, spacing: BlockSpacing, rows: RowNode[]): SectionNode {
  return { id, type: "section", style: { background, maxWidth: "contained" }, spacing, rows };
}

/** Column layout for an N-item repeater row (Features/Testimonials) —
 *  mirrors the preset table in nodes.ts's `createRow`, extended with a
 *  "flex" fallback for item counts that don't map to a named preset. */
function repeaterRowLayout(count: number): { preset: RowColumnPreset; widths: ColumnWidth[] } {
  if (count === 1) return { preset: "1col", widths: ["full"] };
  if (count === 2) return { preset: "2col", widths: ["1/2", "1/2"] };
  if (count === 3) return { preset: "3col", widths: ["1/3", "1/3", "1/3"] };
  return { preset: "flex", widths: Array.from({ length: count }, () => "auto" as const) };
}

// ---------- simple 1:1 blocks ----------
// heading / text / button / image / divider / spacer / form all had their
// V2 element content shapes deliberately mirrored on the V1 content shape
// back in Phase A, so these are lossless: every field the block has, the
// migrated element has too. Each becomes Section -> Row -> Column -> the
// one matching Element, with the block's own `spacing` moving onto the new
// Section (spacing was block-level in V1; Section is its new home).

function migrateHeading(block: HeadingBlock): SectionNode {
  const c = block.content;
  const el = element(deriveId(block.id, "heading"), "heading", { text: c.text, level: c.level, alignment: c.alignment });
  return wrapSingleElement(block.id, block.spacing, el, c.alignment);
}

function migrateText(block: TextBlock): SectionNode {
  const c = block.content;
  const el = element(deriveId(block.id, "text"), "text", { text: c.text, alignment: c.alignment });
  return wrapSingleElement(block.id, block.spacing, el, c.alignment);
}

function migrateButton(block: ButtonBlock): SectionNode {
  const c = block.content;
  const el = element(deriveId(block.id, "button"), "button", {
    text: c.text,
    link: c.link,
    openInNewTab: c.openInNewTab,
    style: c.style,
    alignment: c.alignment,
  });
  return wrapSingleElement(block.id, block.spacing, el, c.alignment);
}

function migrateImage(block: ImageBlock): SectionNode {
  const c = block.content;
  const el = element(deriveId(block.id, "image"), "image", { src: c.src, alt: c.alt, link: c.link });
  // ImageBlockContent has no alignment field in V1 (the block always
  // rendered centered via a hardcoded `mx-auto`) — "center" is the closest
  // available column-alignment default, not a preserved user setting.
  return wrapSingleElement(block.id, block.spacing, el, "center");
}

function migrateDivider(block: DividerBlock): SectionNode {
  const el = element(deriveId(block.id, "divider"), "divider", { style: block.content.style });
  return wrapSingleElement(block.id, block.spacing, el, "left");
}

function migrateSpacer(block: SpacerBlock): SectionNode {
  const el = element(deriveId(block.id, "spacer"), "spacer", { height: block.content.height });
  return wrapSingleElement(block.id, block.spacing, el, "left");
}

function migrateForm(block: FormBlock): SectionNode {
  const c = block.content;
  const el = element(deriveId(block.id, "form"), "form", { formId: c.formId, formName: c.formName });
  // FormBlockContent has no alignment field either (V1 centers it via a
  // hardcoded `mx-auto max-w-xl` wrapper) — same "center" default as Image.
  return wrapSingleElement(block.id, block.spacing, el, "center");
}

function wrapSingleElement(blockId: string, spacing: BlockSpacing, el: ElementNode, alignment: BlockAlignment): SectionNode {
  const col = column(deriveId(blockId, "col"), "full", alignment, [el]);
  const r = row(deriveId(blockId, "row"), oneColumnLayout(), [col]);
  return section(deriveId(blockId, "section"), "none", spacing, [r]);
}

// ---------- hero ----------

function migrateHero(block: HeroBlock): SectionNode {
  const c = block.content;
  const elements: ElementNode[] = [
    element(deriveId(block.id, "headline"), "heading", { text: c.headline, level: "h1", alignment: c.alignment }),
  ];
  if (c.subheadline) {
    elements.push(element(deriveId(block.id, "subheadline"), "text", { text: c.subheadline, alignment: c.alignment }));
  }
  if (c.buttonText) {
    elements.push(
      element(deriveId(block.id, "button"), "button", {
        text: c.buttonText,
        link: c.buttonLink,
        openInNewTab: c.buttonOpenInNewTab,
        style: c.buttonStyle ?? "primary",
        alignment: c.alignment,
      }),
    );
  }
  // Hero's `secondaryLink*` fields rendered as a plain underlined text
  // link in V1 (see block-view.tsx's hero case), NOT a button. V2's
  // element union has no dedicated "text link" element yet (§ report,
  // Migration Gaps) — migrating it as a `button` (style "outline") is a
  // deliberate choice: it's the ONLY V2 element that both carries an href
  // and is genuinely clickable, so it preserves the link's FUNCTION
  // (destination, click target) at the cost of its exact visual treatment
  // (underlined text -> outlined pill). Representing it as a `text`
  // element instead would keep the copy but silently drop the href
  // entirely, which is a strictly worse loss (no longer a link at all) —
  // rejected for that reason.
  if (c.secondaryLinkText) {
    elements.push(
      element(deriveId(block.id, "secondary-link"), "button", {
        text: c.secondaryLinkText,
        link: c.secondaryLinkLink,
        openInNewTab: false,
        style: "outline",
        alignment: c.alignment,
      }),
    );
  }
  // Hero has NO image/media field in the actual V1 shape (confirmed by
  // reading HeroBlockContent directly, not assumed) — there is nothing to
  // place in a second Column, so this stays a single-column Row.
  const col = column(deriveId(block.id, "col"), "full", c.alignment, elements);
  const r = row(deriveId(block.id, "row"), oneColumnLayout(), [col]);
  return section(deriveId(block.id, "section"), c.backgroundStyle, block.spacing, [r]);
}

// ---------- cta ----------

function migrateCta(block: CtaBlock): SectionNode {
  const c = block.content;
  // CtaBlockContent has no `alignment`, `buttonStyle`, or
  // `buttonOpenInNewTab` field in V1 — CTA was never configurable on these
  // axes; its renderer hardcodes center alignment and a bespoke white-pill
  // button (block-view.tsx's cta case), not the shared BUTTON_STYLE_CLASS
  // vocabulary at all. "center" / "primary" / false below are therefore
  // supplying values V2 requires but V1 never exposed, matched to what V1
  // actually rendered — not user data being discarded, since no such
  // setting ever existed to discard. See report §11 for the one resulting
  // cosmetic gap (V1's bespoke white-pill look has no exact V2 preset).
  const elements: ElementNode[] = [
    element(deriveId(block.id, "headline"), "heading", { text: c.headline, level: "h2", alignment: "center" }),
  ];
  if (c.subheadline) {
    elements.push(element(deriveId(block.id, "subheadline"), "text", { text: c.subheadline, alignment: "center" }));
  }
  if (c.buttonText) {
    elements.push(
      element(deriveId(block.id, "button"), "button", {
        text: c.buttonText,
        link: c.buttonLink,
        openInNewTab: false,
        style: "primary",
        alignment: "center",
      }),
    );
  }
  const col = column(deriveId(block.id, "col"), "full", "center", elements);
  const r = row(deriveId(block.id, "row"), oneColumnLayout(), [col]);
  return section(deriveId(block.id, "section"), c.backgroundStyle, block.spacing, [r]);
}

// ---------- features ----------
// FeaturesBlockContent (verified directly against the type, not assumed):
//   { eyebrow: string; headline: string; items: { id, title, description }[] }
// No icon/image/link field exists on FeatureItem — there is nothing to
// preserve beyond title/description, so nothing is lost here.
// V1 renders items in a responsive CSS grid (block-view.tsx: "grid gap-6
// sm:grid-cols-2 lg:grid-cols-3") -- a genuine multi-column layout, so one
// Row with N Columns (RowView's flex-wrap) is the right structural analog,
// not N stacked rows.

function migrateFeatures(block: FeaturesBlock): SectionNode {
  const c = block.content;
  const rows: RowNode[] = [introRow(block.id, c.eyebrow, c.headline)];

  if (c.items.length > 0) {
    const { preset, widths } = repeaterRowLayout(c.items.length);
    const columns = c.items.map((item, i) =>
      column(deriveId(item.id, "col"), widths[i], "left", [
        element(deriveId(item.id, "title"), "heading", { text: item.title, level: "h3", alignment: "left" }),
        element(deriveId(item.id, "desc"), "text", { text: item.description, alignment: "left" }),
      ]),
    );
    rows.push(row(deriveId(block.id, "items-row"), { preset, gap: 24, verticalAlign: "top" }, columns));
  }

  return section(deriveId(block.id, "section"), "none", block.spacing, rows);
}

// ---------- testimonials ----------
// TestimonialsBlockContent (verified directly): { eyebrow, headline,
// items: { id, quote, name }[] }. No avatar/image/role field exists on
// TestimonialItem in the actual shipped type -- nothing to preserve beyond
// quote/name. V1 also renders these in a responsive grid, same shape as
// Features.

function migrateTestimonials(block: TestimonialsBlock): SectionNode {
  const c = block.content;
  const rows: RowNode[] = [introRow(block.id, c.eyebrow, c.headline)];

  if (c.items.length > 0) {
    const { preset, widths } = repeaterRowLayout(c.items.length);
    const columns = c.items.map((item, i) =>
      column(deriveId(item.id, "col"), widths[i], "left", [
        // V1 renders the quote in italics and prefixes the name with an
        // em-dash ("— Sarah J.") -- both are presentational classes/JSX
        // baked into block-view.tsx, not stored data. The plain quote and
        // plain name strings are preserved in full below; only that exact
        // typographic treatment isn't reproduced by a bare `text` element
        // (V2's TextElementContent has no italic/prefix styling field).
        element(deriveId(item.id, "quote"), "text", { text: item.quote, alignment: "left" }),
        element(deriveId(item.id, "name"), "text", { text: item.name, alignment: "left" }),
      ]),
    );
    rows.push(row(deriveId(block.id, "items-row"), { preset, gap: 24, verticalAlign: "top" }, columns));
  }

  return section(deriveId(block.id, "section"), "none", block.spacing, rows);
}

/** Shared by Features/Testimonials — the leading centered eyebrow+headline
 *  row both blocks render identically in V1 (block-view.tsx's `<div
 *  className="mx-auto max-w-5xl text-center">`). Headline is included
 *  unconditionally (V1 renders it with no truthiness guard); eyebrow only
 *  when non-empty, matching V1's own `{c.eyebrow && ...}` guard exactly. */
function introRow(blockId: string, eyebrow: string, headline: string): RowNode {
  const elements: ElementNode[] = [];
  if (eyebrow) {
    elements.push(element(deriveId(blockId, "eyebrow"), "text", { text: eyebrow, alignment: "center" }));
  }
  elements.push(element(deriveId(blockId, "headline"), "heading", { text: headline, level: "h2", alignment: "center" }));
  const col = column(deriveId(blockId, "intro-col"), "full", "center", elements);
  return row(deriveId(blockId, "intro-row"), oneColumnLayout(), [col]);
}

// ---------- faq ----------
// FaqBlockContent (verified directly): { eyebrow, headline, items: { id,
// question, answer }[] }. V1 renders items as a VERTICAL STACK of native
// <details><summary> accordion elements ("mt-8 space-y-3 text-left" wrapping
// individual <details> blocks) -- real, zero-JS expand/collapse behavior.
//
// This previously migrated to static stacked Heading/Text rows, which lost
// that interactivity entirely (a documented gap in the Phase B report).
// Resolved now that V2 has a general-purpose `accordion` element: FAQ
// migrates to intro Row (eyebrow/headline, unchanged) + one content Row
// whose single Column holds ONE Accordion element containing every FAQ
// item -- restoring real expand/collapse in migrated V2 rendering.
// `allowMultiple: true` matches V1's actual behavior (plain <details> per
// item, never grouped to single-open) exactly -- not a new default choice.

function migrateFaq(block: FaqBlock): SectionNode {
  const c = block.content;
  const rows: RowNode[] = [introRow(block.id, c.eyebrow, c.headline)];

  if (c.items.length > 0) {
    const accordion = element(deriveId(block.id, "accordion"), "accordion", {
      items: c.items.map((item) => ({
        id: deriveId(item.id, "accordion-item"),
        title: item.question,
        content: item.answer,
      })),
      allowMultiple: true,
    });
    const col = column(deriveId(block.id, "content-col"), "full", "left", [accordion]);
    rows.push(row(deriveId(block.id, "content-row"), oneColumnLayout(), [col]));
  }

  return section(deriveId(block.id, "section"), "none", block.spacing, rows);
}

// ---------- exhaustive dispatch ----------

function migrateBlock(block: PageBlock): SectionNode {
  switch (block.type) {
    case "heading":
      return migrateHeading(block);
    case "text":
      return migrateText(block);
    case "button":
      return migrateButton(block);
    case "image":
      return migrateImage(block);
    case "divider":
      return migrateDivider(block);
    case "spacer":
      return migrateSpacer(block);
    case "form":
      return migrateForm(block);
    case "hero":
      return migrateHero(block);
    case "cta":
      return migrateCta(block);
    case "features":
      return migrateFeatures(block);
    case "testimonials":
      return migrateTestimonials(block);
    case "faq":
      return migrateFaq(block);
    default: {
      // Exhaustiveness guard: if a new PageBlock variant is ever added to
      // src/types/pages-funnels.ts without a matching `case` above, `block`
      // narrows to `never` here and this line fails to COMPILE (not just
      // throws at runtime) -- `tsc` catches the missing migration case
      // before it ships, per the Phase B spec's requirement. The runtime
      // throw only fires if compiled JS somehow reaches this branch anyway
      // (e.g. corrupted data), and deliberately does NOT silently return an
      // empty section for it.
      const _exhaustive: never = block;
      throw new Error(`migrateBlocksToSections: no migration case for block type "${(_exhaustive as PageBlock).type}"`);
    }
  }
}

/**
 * Converts a full V1 `blocks` array into a V2 `SectionNode[]` — one Section
 * per input block, in the same order (array position remains the sole
 * ordering signal on both sides, per the approved V2 model). Pure: no
 * Firestore reads/writes, no network access, no AI, no randomness. Calling
 * it twice with the same `blocks` array produces byte-identical output
 * (deep-equal), since every derived id is a deterministic function of the
 * input blocks' own (already-stable) ids.
 */
export function migrateBlocksToSections(blocks: PageBlock[]): SectionNode[] {
  return blocks.map(migrateBlock);
}

/**
 * Optional Phase-C-facing compatibility helper (§12 of the spec) — not
 * called anywhere yet. Structurally typed rather than importing the real
 * `PageDoc`, so `PageDoc` itself does not need a `sections` field added in
 * this phase: any object with a `blocks` array and an *optional* `sections`
 * array satisfies this parameter, including a real `PageDoc` today (which
 * simply doesn't have `sections` at all, which is fine — optional fields
 * are satisfied by absence). When a future PageDoc gains a real `sections`
 * field, this starts preferring it automatically with no change here.
 */
export function getPageSections(page: { blocks: PageBlock[]; sections?: SectionNode[] }): SectionNode[] {
  return page.sections ?? migrateBlocksToSections(page.blocks);
}
