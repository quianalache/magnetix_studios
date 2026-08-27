import type { Data, ComponentData } from "@puckeditor/core";
import type { PageBlock } from "@/types/pages-funnels";
import type { BackgroundConfig } from "@/types/pages-funnels-puck";
import { DEFAULT_PAGE_ACTION } from "@/types/pages-funnels-puck";
import { DEFAULT_BACKGROUND } from "@/lib/pages-funnels/puck/background";
import { migratedNodeId } from "@/lib/pages-funnels/puck/ids";

/**
 * DIRECT, deterministic V1 -> Puck Data converter — master spec §16/§18's
 * approved migration path: `PageBlock[] -> Puck Data`, NOT the two-hop
 * `PageBlock[] -> SectionNode[] -> Puck Data` V2 already proved is possible.
 * `src/lib/pages-funnels/v2/migrate.ts` (`migrateBlocksToSections`) is used
 * as a DESIGN reference only, per the master spec — its actual
 * block-by-block mapping decisions are echoed here, but this function does
 * not call it or depend on V2 types at all.
 *
 * NOT persisted anywhere yet, NOT wired into any live route yet (master
 * spec §16/§17 — this is Phase 1 foundation only, not a migration script).
 *
 * Every V1 block becomes its OWN Section (mirrors how V1 already treats
 * blocks as independently-padded top-level units — `block.spacing` maps
 * directly onto the generated Section's `paddingTop`/`paddingBottom`),
 * holding one or more Rows of real Puck primitives. Composite V1 blocks
 * (Hero/Features/Testimonials/FAQ/CTA) are DECOMPOSED into real Puck
 * primitives during migration too — not preserved as indivisible blobs —
 * because master spec §5's "prebuilt sections are factories, not
 * mega-blocks" rule applies just as much to a migrated page as to a
 * freshly-inserted one. A migrated Hero block ends up structurally
 * identical to one inserted via `buildHeroSection()` (presets/hero.ts).
 *
 * Ids are DETERMINISTIC (`migratedNodeId(block.id, suffix)` /
 * `migratedNodeId(item.id, suffix)` for array-item content), never
 * `newPuckNodeId()`'s random ids — master spec §16: "use stable
 * deterministic ids derived from existing block ids", so re-running this
 * function on the same `PageDoc` produces byte-identical output.
 *
 * The `switch` in `migrateBlockToRows` is EXHAUSTIVE over
 * `PageBlock["type"]` (the `never` check at the bottom fails to compile if
 * a new V1 block type is ever added without updating this function) —
 * master spec §16: "prefer exhaustive TypeScript handling."
 */
export function migratePageBlocksToPuckData(blocks: PageBlock[]): Data {
  return {
    content: blocks.map(migrateBlockToSection),
    root: { props: {} },
  };
}

function migrateBlockToSection(block: PageBlock): ComponentData {
  return {
    type: "Section",
    props: {
      id: migratedNodeId(block.id, "section"),
      background: migrateBackgroundStyle(block),
      maxWidth: "contained",
      paddingTop: block.spacing.paddingTop,
      paddingBottom: block.spacing.paddingBottom,
      rows: migrateBlockToRows(block),
    },
  } as ComponentData;
}

/**
 * Phase 2C task §3 / Phase 2D task §9 ("preserve gradient/color INTENT,
 * never invent historic color data that never existed in V1"): only V1's
 * `hero` and `cta` block types ever carried a `backgroundStyle` field at
 * all (`HeroBlockContent`/`CtaBlockContent`, src/types/pages-funnels.ts) —
 * every other block type has no background concept in V1, so those always
 * migrate to `DEFAULT_BACKGROUND` (`source: "none"`). Crucially, V1's
 * `backgroundStyle` was ALWAYS just the enum (`"none" | "solid" |
 * "gradient" | "image"`) with no color/direction data anywhere alongside it
 * (confirmed: V1's own renderer, block-view.tsx/tree-view.tsx, hardcodes
 * one fixed Tailwind gradient class for `"gradient"` — there is no per-page
 * color to read). So this function preserves the TYPE/MODE only — exactly
 * what real data exists — and never invents a `solid`/`stops` value V1
 * never had:
 *
 * - `"solid"` migrates to `color.mode: "solid"` with `solid: ""` (empty,
 *   not a guessed color) — `backgroundCssValue` treats an empty solid as
 *   unset, so it renders transparent until the user picks a real color.
 * - `"gradient"` migrates to `color.mode: "gradient"` with `stops: []`
 *   (zero real stops, not invented ones) — `gradientCssValue` treats an
 *   empty stop list as unset for the exact same honest-transparency reason.
 *
 * Both cases leave the Background field editor open and ready — the user
 * sees "Color" + the right Solid/Gradient toggle already selected, and just
 * needs to add real color(s), rather than starting over from "None."
 *
 * V1's `"image"` option has no equivalent in the new background shape yet
 * (§8: image backgrounds have no field UI this phase either) — maps to
 * `DEFAULT_BACKGROUND` rather than silently dropping the block's content;
 * a real image-background migration is future scope, not part of this fix.
 */
function migrateBackgroundStyle(block: PageBlock): BackgroundConfig {
  if (block.type !== "hero" && block.type !== "cta") return DEFAULT_BACKGROUND;

  switch (block.content.backgroundStyle) {
    case "solid":
      return {
        source: "color",
        color: {
          mode: "solid",
          solid: "",
          gradient: { type: "linear", angle: 135, stops: [] },
        },
        blur: { enabled: false, intensity: 0 },
      };
    case "gradient":
      return {
        source: "color",
        color: {
          mode: "gradient",
          solid: "",
          gradient: { type: "linear", angle: 135, stops: [] },
        },
        blur: { enabled: false, intensity: 0 },
      };
    case "image":
    case "none":
    case undefined:
      return DEFAULT_BACKGROUND;
  }
}

function oneColumnRow(
  block: PageBlock,
  elements: ComponentData[]
): ComponentData[] {
  return [
    {
      type: "Row",
      props: {
        id: migratedNodeId(block.id, "row"),
        gap: 24,
        verticalAlign: "top",
        columns: [
          {
            type: "Column",
            props: {
              id: migratedNodeId(block.id, "col"),
              width: "full",
              alignment: "left",
              elements,
            },
          },
        ] as ComponentData[],
      },
    } as ComponentData,
  ];
}

/** Optional heading row shared by Features/Testimonials: an eyebrow + a
 *  headline, centered, above the per-item row. Omitted entirely when both
 *  are empty (matches V1's own rendering, which also skips an empty
 *  eyebrow/headline pair). */
function headingRow(
  block: PageBlock,
  eyebrow: string,
  headline: string
): ComponentData[] {
  if (!eyebrow && !headline) return [];
  const elements: ComponentData[] = [];
  if (eyebrow)
    elements.push({
      type: "Text",
      props: {
        id: migratedNodeId(block.id, "eyebrow"),
        text: eyebrow,
        alignment: "center",
      },
    } as ComponentData);
  if (headline) {
    elements.push({
      type: "Heading",
      props: {
        id: migratedNodeId(block.id, "headline"),
        text: headline,
        level: "h2",
        alignment: "center",
      },
    } as ComponentData);
  }
  return [
    {
      type: "Row",
      props: {
        id: migratedNodeId(block.id, "heading-row"),
        gap: 24,
        verticalAlign: "top",
        columns: [
          {
            type: "Column",
            props: {
              id: migratedNodeId(block.id, "heading-col"),
              width: "full",
              alignment: "center",
              elements,
            },
          },
        ] as ComponentData[],
      },
    } as ComponentData,
  ];
}

/** 1/2/3-up column width for a row of N items — matches the same fraction
 *  vocabulary every Column already uses (COLUMN_SPAN_CLASS), never an
 *  arbitrary percentage. Four or more items still uses "1/3" (three per
 *  visual row, wrapping) rather than inventing a narrower fraction. */
function itemColumnWidth(itemCount: number): "full" | "1/2" | "1/3" {
  if (itemCount <= 1) return "full";
  if (itemCount === 2) return "1/2";
  return "1/3";
}

function migrateBlockToRows(block: PageBlock): ComponentData[] {
  switch (block.type) {
    case "hero":
      return migrateHeroRows(block);

    case "heading":
      return oneColumnRow(block, [
        {
          type: "Heading",
          props: {
            id: migratedNodeId(block.id, "el"),
            text: block.content.text,
            level: block.content.level,
            alignment: block.content.alignment,
          },
        } as ComponentData,
      ]);

    case "text":
      return oneColumnRow(block, [
        {
          type: "Text",
          props: {
            id: migratedNodeId(block.id, "el"),
            text: block.content.text,
            alignment: block.content.alignment,
          },
        } as ComponentData,
      ]);

    case "button":
      return oneColumnRow(block, [
        {
          type: "Button",
          props: {
            id: migratedNodeId(block.id, "el"),
            text: block.content.text,
            action: block.content.link
              ? {
                  type: "url",
                  url: block.content.link,
                  openInNewTab: block.content.openInNewTab,
                }
              : { ...DEFAULT_PAGE_ACTION },
            style: block.content.style,
            alignment: block.content.alignment,
          },
        } as ComponentData,
      ]);

    case "image":
      return oneColumnRow(block, [
        {
          type: "Image",
          props: {
            id: migratedNodeId(block.id, "el"),
            src: block.content.src,
            alt: block.content.alt,
            action: block.content.link
              ? { type: "url", url: block.content.link }
              : { ...DEFAULT_PAGE_ACTION },
          },
        } as ComponentData,
      ]);

    case "divider":
      return oneColumnRow(block, [
        {
          type: "Divider",
          props: {
            id: migratedNodeId(block.id, "el"),
            style: block.content.style,
          },
        } as ComponentData,
      ]);

    case "spacer":
      return oneColumnRow(block, [
        {
          type: "Spacer",
          props: {
            id: migratedNodeId(block.id, "el"),
            height: block.content.height,
          },
        } as ComponentData,
      ]);

    case "form":
      return oneColumnRow(block, [
        {
          type: "Form",
          props: {
            id: migratedNodeId(block.id, "el"),
            formId: block.content.formId ?? "",
            formName: block.content.formName ?? "",
          },
        } as ComponentData,
      ]);

    case "faq":
      // Maps directly onto the general-purpose Accordion element (same
      // shape V2's migrate.ts already proved: FaqItem{question,answer} ->
      // AccordionItem{title,content}) — the cleanest 1:1 mapping in this
      // whole converter.
      return [
        ...headingRow(block, block.content.eyebrow, block.content.headline),
        ...oneColumnRow(block, [
          {
            type: "Accordion",
            props: {
              id: migratedNodeId(block.id, "accordion"),
              items: block.content.items.map((item) => ({
                id: migratedNodeId(item.id, "item"),
                title: item.question,
                content: item.answer,
              })),
              allowMultiple: true,
            },
          } as ComponentData,
        ]),
      ];

    case "cta":
      return oneColumnRow(block, [
        {
          type: "Heading",
          props: {
            id: migratedNodeId(block.id, "headline"),
            text: block.content.headline,
            level: "h2",
            alignment: "center",
          },
        } as ComponentData,
        {
          type: "Text",
          props: {
            id: migratedNodeId(block.id, "subheadline"),
            text: block.content.subheadline,
            alignment: "center",
          },
        } as ComponentData,
        {
          type: "Button",
          props: {
            id: migratedNodeId(block.id, "button"),
            text: block.content.buttonText,
            action: block.content.buttonLink
              ? { type: "url", url: block.content.buttonLink }
              : { ...DEFAULT_PAGE_ACTION },
            style: "primary",
            alignment: "center",
          },
        } as ComponentData,
      ]);

    case "features": {
      const c = block.content;
      const width = itemColumnWidth(c.items.length);
      const itemsRow: ComponentData[] =
        c.items.length === 0
          ? []
          : [
              {
                type: "Row",
                props: {
                  id: migratedNodeId(block.id, "items-row"),
                  gap: 24,
                  verticalAlign: "top",
                  columns: c.items.map(
                    (item) =>
                      ({
                        type: "Column",
                        props: {
                          id: migratedNodeId(item.id, "col"),
                          width,
                          alignment: "left",
                          elements: [
                            {
                              type: "Heading",
                              props: {
                                id: migratedNodeId(item.id, "title"),
                                text: item.title,
                                level: "h3",
                                alignment: "left",
                              },
                            },
                            {
                              type: "Text",
                              props: {
                                id: migratedNodeId(item.id, "desc"),
                                text: item.description,
                                alignment: "left",
                              },
                            },
                          ],
                        },
                      }) as ComponentData
                  ),
                },
              } as ComponentData,
            ];
      return [...headingRow(block, c.eyebrow, c.headline), ...itemsRow];
    }

    case "testimonials": {
      const c = block.content;
      const width = itemColumnWidth(c.items.length);
      const itemsRow: ComponentData[] =
        c.items.length === 0
          ? []
          : [
              {
                type: "Row",
                props: {
                  id: migratedNodeId(block.id, "items-row"),
                  gap: 24,
                  verticalAlign: "top",
                  columns: c.items.map(
                    (item) =>
                      ({
                        type: "Column",
                        props: {
                          id: migratedNodeId(item.id, "col"),
                          width,
                          alignment: "left",
                          elements: [
                            {
                              type: "Text",
                              props: {
                                id: migratedNodeId(item.id, "quote"),
                                text: item.quote,
                                alignment: "left",
                              },
                            },
                            {
                              type: "Heading",
                              props: {
                                id: migratedNodeId(item.id, "name"),
                                text: item.name,
                                level: "h3",
                                alignment: "left",
                              },
                            },
                          ],
                        },
                      }) as ComponentData
                  ),
                },
              } as ComponentData,
            ];
      return [...headingRow(block, c.eyebrow, c.headline), ...itemsRow];
    }

    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function migrateHeroRows(
  block: Extract<PageBlock, { type: "hero" }>
): ComponentData[] {
  const c = block.content;
  const elements: ComponentData[] = [
    {
      type: "Heading",
      props: {
        id: migratedNodeId(block.id, "heading"),
        text: c.headline,
        level: "h1",
        alignment: c.alignment,
      },
    } as ComponentData,
    {
      type: "Text",
      props: {
        id: migratedNodeId(block.id, "text"),
        text: c.subheadline,
        alignment: c.alignment,
      },
    } as ComponentData,
    {
      type: "Button",
      props: {
        id: migratedNodeId(block.id, "button"),
        text: c.buttonText,
        action: c.buttonLink
          ? {
              type: "url",
              url: c.buttonLink,
              openInNewTab: c.buttonOpenInNewTab,
            }
          : { ...DEFAULT_PAGE_ACTION },
        style: c.buttonStyle ?? "primary",
        alignment: c.alignment,
      },
    } as ComponentData,
  ];
  // V1 Hero's optional "secondary link" becomes a second, outline-style
  // Button primitive — there's no dedicated "secondary link" element type
  // in the Phase 1 registry, and a Button is the closest real primitive,
  // matching how a hand-built page would represent the same content.
  if (c.secondaryLinkText) {
    elements.push({
      type: "Button",
      props: {
        id: migratedNodeId(block.id, "button-secondary"),
        text: c.secondaryLinkText,
        action: c.secondaryLinkLink
          ? { type: "url", url: c.secondaryLinkLink }
          : { ...DEFAULT_PAGE_ACTION },
        style: "outline",
        alignment: c.alignment,
      },
    } as ComponentData);
  }
  return [
    {
      type: "Row",
      props: {
        id: migratedNodeId(block.id, "row"),
        gap: 24,
        verticalAlign: "top",
        columns: [
          {
            type: "Column",
            props: {
              id: migratedNodeId(block.id, "col"),
              width: "full",
              alignment: c.alignment,
              elements,
            },
          },
        ] as ComponentData[],
      },
    } as ComponentData,
  ];
}
