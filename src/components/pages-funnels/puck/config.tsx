import type { Config, CustomField } from "@puckeditor/core";
import type {
  PuckPageMetadata,
  PageAction,
  BackgroundConfig,
  StyleConfig,
  StyleCompatibility,
} from "@/types/pages-funnels-puck";
import { DEFAULT_PAGE_ACTION } from "@/types/pages-funnels-puck";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";
import {
  WIDTH_OPTIONS,
  ALIGN_OPTIONS,
} from "@/lib/pages-funnels/puck/constants";
import {
  DEFAULT_BACKGROUND,
  HERO_DEFAULT_BACKGROUND,
} from "@/lib/pages-funnels/puck/background";
import { BackgroundFieldEditor } from "@/components/pages-funnels/puck/background-field";
import { StyleFieldEditor } from "@/components/pages-funnels/puck/style-field";
import { FormFieldEditor } from "@/components/pages-funnels/puck/form-field";
import { ImageFieldEditor } from "@/components/pages-funnels/puck/image-field";
import {
  SectionRender,
  RowRender,
  ColumnRender,
} from "@/components/pages-funnels/puck/layout";
import {
  HeadingRender,
  TextRender,
  RichTextRenderElement,
  ButtonRender,
  ImageRender,
  VideoRender,
  DividerRender,
  SpacerRender,
  AccordionRender,
} from "@/components/pages-funnels/puck/elements";
import {
  DEFAULT_IMAGE_SIZE,
  DEFAULT_VIDEO_SIZE,
} from "@/lib/pages-funnels/puck/media-size";

/**
 * Production Puck component registry (master spec §6/§7) — the CLIENT and
 * SERVER configs (config below) are both produced by ONE shared factory,
 * `createPuckConfig`, parameterized only by which Form render variant to
 * use (master spec §10: "share prop types and pure helpers between
 * configs, avoid unnecessary duplication" — Form is the only component that
 * genuinely differs between an interactive client editor and a server
 * `<Render>` pass; see form-client.tsx/form-server.tsx for why).
 *
 * Registry scope is deliberately Phase 1 only, per the master spec's
 * explicit instruction: LAYOUT (Section/Row/Column) + core ELEMENTS
 * (Heading/Text/Button/Image/Video/Divider/Spacer/Accordion) + BUSINESS
 * (Form only — NOT Booking/Checkout yet). No Funnel logic anywhere in this
 * file (master spec §12 — Puck must never be taught what a funnel is).
 */

export interface FormComponentProps {
  id: string;
  formId: string;
  formName: string;
  style?: StyleConfig;
  metadata?: PuckPageMetadata;
}

const ACTION_TYPE_OPTIONS = [
  { label: "None", value: "none" },
  { label: "URL", value: "url" },
] as const;

/**
 * `object` field composing a `PageAction` (master spec §9's Action System
 * foundation) — only `type: "none" | "url"` are exposed in the Fields
 * panel in Phase 1 (matching "do not implement those behaviors yet"); every
 * other `PageAction` variant already exists on the TYPE so Phase 3 can add
 * its own field UI without changing what Button/Image store. `url`/
 * `openInNewTab` are always shown regardless of the selected type — Puck's
 * `object` field doesn't support conditional sub-fields without a custom
 * field, which is out of scope for this foundation phase; an inert `url`
 * row when `type` is "none" is a small, acceptable Phase 1 UX cost.
 */
const actionField = {
  type: "object" as const,
  label: "Action",
  objectFields: {
    type: {
      type: "select" as const,
      label: "Type",
      options: ACTION_TYPE_OPTIONS,
    },
    url: { type: "text" as const, label: "URL" },
    openInNewTab: {
      type: "radio" as const,
      label: "Open in new tab",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
  },
};

/** Normalizes the object-field's flat shape (`{type, url, openInNewTab}`)
 *  back into a real discriminated `PageAction` for `resolveActionHref` —
 *  the object field can't itself produce a discriminated union, so this is
 *  the one, explicit, well-documented seam where that translation happens. */
function toPageAction(raw: {
  type: string;
  url?: string;
  openInNewTab?: boolean;
}): PageAction {
  if (raw.type === "url")
    return { type: "url", url: raw.url ?? "", openInNewTab: raw.openInNewTab };
  return { type: "none" };
}

// ---------- Shared Background field (Phase 2D task §3/§4/§5/§6/§7) ----------

/**
 * ONE `CustomField<BackgroundConfig>` used verbatim by Section, Hero, Row,
 * AND Column (task §6: "use the same shared data model and renderer
 * helper... do not implement three unrelated copies") — replaces Phase
 * 2C's per-component `resolveSectionFields`/`resolveFields` approach, which
 * only ever needed to toggle one flat 3-way enum. This phase's UI (source
 * tabs, solid/gradient, 3 gradient types, up to 10 stops, blur) is
 * cohesive enough that a single custom field owning its own render layout
 * is the right tool — see background-field.tsx's own doc comment for the
 * full reasoning on `custom` vs `object`/`resolveFields`. Because it's one
 * field definition object (not a function producing per-component fields),
 * Section/Hero/Row/Column referencing it can never drift from each other.
 */
const backgroundField: CustomField<BackgroundConfig> = {
  type: "custom",
  label: "Background",
  render: ({ value, onChange }) => (
    <BackgroundFieldEditor value={value} onChange={onChange} />
  ),
};

/**
 * Real Magnetix Form selector (real user QA blocker — see form-field.tsx's
 * own doc comment). Bound to the Form component's existing `formId: string`
 * prop — the persisted Data shape is unchanged, only the Settings-panel
 * editor for it. `label: "Choose Form"` is set on `FormFieldEditor` itself
 * (not here) since the field needs its own `<Label>` styled consistently
 * with the rest of that component's states (loading/empty/loaded).
 */
const formIdField: CustomField<string> = {
  type: "custom",
  label: "Form",
  render: ({ value, onChange }) => (
    <FormFieldEditor value={value} onChange={onChange} />
  ),
};

/**
 * Real Upload Image UX (real user QA blocker — see image-field.tsx's own
 * doc comment). Bound to the Image component's existing `src: string`
 * prop — persisted shape is unchanged, only the Settings-panel editor for
 * it. Alt Text stays its OWN separate, plain Puck `text` field (unchanged)
 * — no cross-field write problem to solve there, unlike Form's
 * formId/formName pair.
 */
const imageSrcField: CustomField<string> = {
  type: "custom",
  label: "Image",
  render: ({ value, onChange }) => (
    <ImageFieldEditor value={value} onChange={onChange} />
  ),
};

// ---------- Image/Video size + playback fields (System B — master spec §24.6) ----------

/**
 * Plain Puck `object` field (the same first-class mechanism `actionField`
 * above already uses) — deliberately NOT a `custom` field like
 * `imageSrcField`/`formIdField`: these are simple discrete
 * select/number/radio controls with no live external data source or rich
 * internal layout, so Puck's own built-in field renderer is the right,
 * lower-effort tool (matching `Section`'s own `maxWidth`/`paddingTop`
 * plain-field precedent), not a reason to build a bespoke component.
 * `ImageSizeConfig` (pages-funnels-puck.ts) is entirely optional-shaped —
 * an unset field here resolves to zero extra CSS (`media-size.ts`), so
 * this is purely additive for every image element that predates it.
 */
const imageSizeField = {
  type: "object" as const,
  label: "Size",
  objectFields: {
    width: {
      type: "select" as const,
      label: "Width",
      options: [
        { label: "Auto (natural size)", value: "auto" },
        { label: "25%", value: "25" },
        { label: "50%", value: "50" },
        { label: "75%", value: "75" },
        { label: "100%", value: "100" },
      ],
    },
    maxWidthPx: {
      type: "number" as const,
      label: "Max Width (px, optional)",
      min: 0,
    },
    heightPx: {
      type: "number" as const,
      label: "Height (px, optional)",
      min: 0,
    },
    objectFit: {
      type: "select" as const,
      label: "Object Fit (with Height set)",
      options: [
        { label: "Cover", value: "cover" },
        { label: "Contain", value: "contain" },
        { label: "Fill", value: "fill" },
      ],
    },
    objectPosition: {
      type: "select" as const,
      label: "Object Position",
      options: [
        { label: "Center", value: "center" },
        { label: "Top", value: "top" },
        { label: "Bottom", value: "bottom" },
        { label: "Left", value: "left" },
        { label: "Right", value: "right" },
      ],
    },
    alignment: {
      type: "radio" as const,
      label: "Alignment",
      options: ALIGN_OPTIONS,
    },
  },
};

/** Same "plain built-in `object` field" reasoning as `imageSizeField` —
 *  `VideoSizeConfig`'s own doc comment explains why it's a separate,
 *  smaller config from Image's (aspect ratio has no Image equivalent;
 *  Image's height/object-fit have no Video equivalent). */
const videoSizeField = {
  type: "object" as const,
  label: "Size",
  objectFields: {
    width: {
      type: "select" as const,
      label: "Width",
      options: [
        { label: "Auto (fill column)", value: "auto" },
        { label: "50%", value: "50" },
        { label: "75%", value: "75" },
        { label: "100%", value: "100" },
      ],
    },
    maxWidthPx: {
      type: "number" as const,
      label: "Max Width (px, optional)",
      min: 0,
    },
    aspectRatio: {
      type: "select" as const,
      label: "Aspect Ratio",
      options: [
        { label: "16:9 (widescreen)", value: "16:9" },
        { label: "9:16 (vertical)", value: "9:16" },
        { label: "1:1 (square)", value: "1:1" },
        { label: "4:3 (classic)", value: "4:3" },
      ],
    },
    alignment: {
      type: "radio" as const,
      label: "Alignment",
      options: ALIGN_OPTIONS,
    },
  },
};

/**
 * `VideoPlaybackConfig` (master spec §8/§24.6 "autoplay, muted, controls,
 * loop, poster"). Kept separate from `videoSizeField` (playback behavior,
 * not layout). The Settings UI exposes all four flags — the
 * browser-cannot-honor-unmuted-autoplay coercion (`resolveVideoEmbed`,
 * video.ts) happens once at RENDER time, not by hiding/disabling the Mute
 * toggle here, so the user always sees exactly what they set and the
 * render is what's actually guaranteed correct — same "resolve, don't
 * gate the UI" principle `resolveBaseStyleProps` already uses everywhere.
 */
const videoPlaybackField = {
  type: "object" as const,
  label: "Playback",
  objectFields: {
    autoplay: {
      type: "radio" as const,
      label: "Autoplay",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
    muted: {
      type: "radio" as const,
      label: "Muted",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
    loop: {
      type: "radio" as const,
      label: "Loop",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
    showControls: {
      type: "radio" as const,
      label: "Show Controls",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    posterUrl: {
      type: "text" as const,
      label: "Poster Image URL (direct video files only)",
    },
  },
};

// ---------- Shared Style field (System A — master spec §24.3/§24.20) ----------

/**
 * The literal, in-code component-compatibility matrix master spec §24
 * asks for ("define which shared style groups apply to which
 * components"). One `StyleCompatibility` object per component, passed to
 * `makeStyleField()` once at registration below — this IS the source of
 * truth for which groups each component's Settings panel shows; nothing
 * else needs to be kept in sync with it by hand. Matches the master spec's
 * own §24.20/§15 worked examples (Heading gets typography but not border;
 * Section gets border but not typography; Button gets everything relevant
 * to a clickable label).
 */
const LAYOUT_CONTAINER_STYLE: StyleCompatibility = {
  layout: true,
  spacing: true,
  border: true,
  radius: true,
  boxShadow: true,
  responsive: true,
  visibility: true,
};
/** Column-only — everything Section/Row get, plus the per-breakpoint
 *  Column Width override (System A closeout task §4). A separate constant
 *  (not a mutation of `LAYOUT_CONTAINER_STYLE`) so Section/Row/Column's
 *  base compatibility stays visibly identical at a glance, with Column's
 *  one real difference spelled out explicitly right here. */
const COLUMN_STYLE: StyleCompatibility = {
  ...LAYOUT_CONTAINER_STYLE,
  columnWidth: true,
};
const TEXT_ELEMENT_STYLE: StyleCompatibility = {
  typography: true,
  spacing: true,
  textShadow: true,
  responsive: true,
  visibility: true,
};
const BUTTON_STYLE_COMPAT: StyleCompatibility = {
  typography: true,
  spacing: true,
  border: true,
  radius: true,
  boxShadow: true,
  textShadow: true,
  responsive: true,
  visibility: true,
};
const MEDIA_ELEMENT_STYLE: StyleCompatibility = {
  spacing: true,
  border: true,
  radius: true,
  boxShadow: true,
  responsive: true,
  visibility: true,
};
const DIVIDER_STYLE: StyleCompatibility = {
  spacing: true,
  responsive: true,
  visibility: true,
};
const ACCORDION_STYLE: StyleCompatibility = {
  typography: true,
  spacing: true,
  border: true,
  radius: true,
  responsive: true,
  visibility: true,
};
const FORM_CONTAINER_STYLE: StyleCompatibility = {
  spacing: true,
  border: true,
  radius: true,
  responsive: true,
  visibility: true,
};

/**
 * Builds one `CustomField<StyleConfig>` — defined and CALLED entirely
 * within this module (never imported from a "use client" file and invoked
 * as a function), matching exactly how `backgroundField` below safely
 * renders `BackgroundFieldEditor` via JSX from a module that must stay
 * importable from the server config. See `StyleFieldEditor`'s own doc
 * comment in style-field.tsx for the full "why" (a real `next build`
 * failure this was fixed in response to, not a hypothetical concern).
 */
function makeStyleField(
  compatibility: StyleCompatibility
): CustomField<StyleConfig> {
  return {
    type: "custom",
    label: "Styles",
    render: ({ value, onChange }) => (
      <StyleFieldEditor
        value={value}
        onChange={onChange}
        compatibility={compatibility}
      />
    ),
  };
}

// Section/Hero/Row/Column all share the exact same compatibility (they're
// all plain containers, not text/media elements) — one field instance,
// referenced by all four, exactly like `backgroundField` above.
const layoutStyleField = makeStyleField(LAYOUT_CONTAINER_STYLE);
const columnStyleField = makeStyleField(COLUMN_STYLE);
const textStyleField = makeStyleField(TEXT_ELEMENT_STYLE);
const buttonStyleField = makeStyleField(BUTTON_STYLE_COMPAT);
const mediaStyleField = makeStyleField(MEDIA_ELEMENT_STYLE);
const dividerStyleField = makeStyleField(DIVIDER_STYLE);
const accordionStyleField = makeStyleField(ACCORDION_STYLE);
const formStyleField = makeStyleField(FORM_CONTAINER_STYLE);

/** The fields every Section/Hero shares besides `background` — factored out
 *  once so Section and Hero's field sets can never drift from each other
 *  (they already share `SectionRender` and its whole prop shape). */
const SECTION_SHARED_FIELDS = {
  background: backgroundField,
  style: layoutStyleField,
  maxWidth: {
    type: "select" as const,
    label: "Max Width",
    options: [
      { label: "Contained", value: "contained" },
      { label: "Wide", value: "wide" },
      { label: "Full", value: "full" },
    ],
  },
  // System A closeout task §3 — deliberately a SEPARATE field from
  // `maxWidth` above, never coupled into one setting: `maxWidth` controls
  // the CONTENT'S width, this controls whether the BACKGROUND spans the
  // full section or matches that same content width. See SectionRender's
  // own doc comment in layout.tsx for the rendering mechanics.
  fullWidthBackground: {
    type: "radio" as const,
    label: "Full-Width Background",
    options: [
      { label: "Yes", value: true },
      { label: "No (match content width)", value: false },
    ],
  },
  paddingTop: {
    type: "number" as const,
    label: "Padding Top (px)",
    min: 0,
    max: 200,
  },
  paddingBottom: {
    type: "number" as const,
    label: "Padding Bottom (px)",
    min: 0,
    max: 200,
  },
  rows: { type: "slot" as const, allow: ["Row"] },
};

export function createPuckConfig(
  FormComponent: React.ComponentType<FormComponentProps>
): Config {
  return {
    categories: {
      layout: { title: "Layout", components: ["Section", "Row", "Column"] },
      elements: {
        title: "Elements",
        components: [
          "Heading",
          "Text",
          "RichText",
          "Button",
          "Image",
          "Video",
          "Divider",
          "Spacer",
          "Accordion",
        ],
      },
      // Category order matches master spec §6's approved customer-facing
      // taxonomy exactly: Layout, Elements, Prebuilt Sections, Business.
      prebuiltSections: { title: "Prebuilt Sections", components: ["Hero"] },
      business: { title: "Business", components: ["Form"] },
    },
    components: {
      Section: {
        label: "Section",
        fields: SECTION_SHARED_FIELDS,
        defaultProps: {
          background: DEFAULT_BACKGROUND,
          style: DEFAULT_STYLE_CONFIG,
          maxWidth: "contained",
          fullWidthBackground: true,
          paddingTop: 64,
          paddingBottom: 64,
          rows: [],
        },
        render: ({
          id,
          background,
          style,
          maxWidth,
          fullWidthBackground,
          paddingTop,
          paddingBottom,
          rows,
        }) => (
          <SectionRender
            id={id}
            background={background}
            style={style}
            maxWidth={maxWidth}
            fullWidthBackground={fullWidthBackground}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            rows={rows}
          />
        ),
      },

      // PREBUILT SECTIONS category (master spec §5/§15, Phase 2A task §7):
      // a REAL library drag-item, not the header-button demo Phase 1 used
      // (`buildHeroSection()`, still used separately for the migration
      // converter's Hero decomposition — see migrate-v1.ts). Registered as
      // its own component (not reusing the literal "Section" type) so it
      // shows as "Hero" in the Outline and is a genuine one-drag insert from
      // the library, matching the exact behavior every other library item
      // has (Puck's `components` registry is what makes an entry draggable
      // from the drawer at all — there's no separate "insert a multi-node
      // template" primitive to reach for). It reuses `SectionRender` and
      // Section's own fields verbatim (same background/maxWidth/spacing
      // controls) and its `defaultProps` are real nested Column/Heading/
      // Text/Button/Image data — per master spec §5, "Hero must NOT be an
      // indivisible component": every primitive inside is independently
      // selectable/editable/deletable immediately after the drag, exactly
      // like a hand-built Section. Static string ids in defaultProps (not
      // `newPuckNodeId()`) match the same precedent Row's own defaultProps
      // already established just above — Puck assigns real ids to
      // defaultProps-sourced slot content at insertion time.
      Hero: {
        label: "Hero",
        fields: SECTION_SHARED_FIELDS,
        defaultProps: {
          background: HERO_DEFAULT_BACKGROUND,
          style: DEFAULT_STYLE_CONFIG,
          maxWidth: "contained",
          fullWidthBackground: true,
          paddingTop: 96,
          paddingBottom: 96,
          rows: [
            {
              type: "Row",
              props: {
                id: "hero-row",
                background: DEFAULT_BACKGROUND,
                gap: 32,
                verticalAlign: "center",
                columns: [
                  {
                    type: "Column",
                    props: {
                      id: "hero-col-1",
                      background: DEFAULT_BACKGROUND,
                      width: "1/2",
                      alignment: "left",
                      elements: [
                        {
                          type: "Heading",
                          props: {
                            id: "hero-heading",
                            text: "Grow your list with a page that converts",
                            level: "h1",
                            alignment: "left",
                          },
                        },
                        {
                          type: "Text",
                          props: {
                            id: "hero-text",
                            text: "Magnetix helps you build native pages made of the same blocks you can click and edit individually.",
                            alignment: "left",
                          },
                        },
                        {
                          type: "Button",
                          props: {
                            id: "hero-button",
                            text: "Get Started",
                            action: { type: "none" },
                            style: "primary",
                            alignment: "left",
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: "Column",
                    props: {
                      id: "hero-col-2",
                      background: DEFAULT_BACKGROUND,
                      width: "1/2",
                      alignment: "left",
                      elements: [
                        {
                          type: "Image",
                          props: {
                            id: "hero-image",
                            src: "",
                            alt: "Product screenshot",
                            action: { type: "none" },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
        render: ({
          id,
          background,
          style,
          maxWidth,
          fullWidthBackground,
          paddingTop,
          paddingBottom,
          rows,
        }) => (
          <SectionRender
            id={id}
            background={background}
            style={style}
            maxWidth={maxWidth}
            fullWidthBackground={fullWidthBackground}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            rows={rows}
          />
        ),
      },

      Row: {
        label: "Row",
        fields: {
          background: backgroundField,
          style: layoutStyleField,
          gap: { type: "number", label: "Gap (px)", min: 0, max: 96 },
          verticalAlign: {
            type: "select",
            label: "Vertical Align",
            options: [
              { label: "Top", value: "top" },
              { label: "Center", value: "center" },
              { label: "Bottom", value: "bottom" },
            ],
          },
          columns: { type: "slot", allow: ["Column"] },
        },
        defaultProps: {
          background: DEFAULT_BACKGROUND,
          style: DEFAULT_STYLE_CONFIG,
          gap: 24,
          verticalAlign: "top",
          // Seeded with two empty Columns so a freshly-dropped Row is
          // immediately a usable 2-column layout. Ids are placeholders
          // Puck replaces on insert — see COLUMN_SEED note in ids.ts if
          // this ever needs to change; a static default here is fine
          // because Puck assigns real ids at insertion time for
          // defaultProps-provided slot content.
          columns: [
            {
              type: "Column",
              props: {
                id: "column-a",
                background: DEFAULT_BACKGROUND,
                width: "1/2",
                alignment: "left",
                elements: [],
              },
            },
            {
              type: "Column",
              props: {
                id: "column-b",
                background: DEFAULT_BACKGROUND,
                width: "1/2",
                alignment: "left",
                elements: [],
              },
            },
          ],
        },
        render: ({ id, background, style, gap, verticalAlign, columns }) => (
          <RowRender
            id={id}
            background={background}
            style={style}
            gap={gap}
            verticalAlign={verticalAlign}
            columns={columns}
          />
        ),
      },

      // `inline: true` + `puck.dragRef` — see layout.tsx's `ColumnRender`
      // doc comment and master spec §3/§7. Do not drop this even though it
      // looks redundant with the render component already handling it;
      // `inline: true` is the config-level flag that makes Puck hand this
      // component `puck.dragRef` in the first place instead of wrapping it.
      Column: {
        label: "Column",
        inline: true,
        fields: {
          background: backgroundField,
          style: columnStyleField,
          width: { type: "select", label: "Width", options: WIDTH_OPTIONS },
          alignment: {
            type: "radio",
            label: "Content Alignment",
            options: ALIGN_OPTIONS,
          },
          elements: {
            type: "slot",
            allow: [
              "Heading",
              "Text",
              "RichText",
              "Button",
              "Image",
              "Video",
              "Divider",
              "Spacer",
              "Accordion",
              "Form",
            ],
          },
        },
        defaultProps: {
          background: DEFAULT_BACKGROUND,
          style: DEFAULT_STYLE_CONFIG,
          width: "auto",
          alignment: "left",
          elements: [],
        },
        render: ({
          id,
          background,
          style,
          width,
          alignment,
          elements,
          puck,
        }) => (
          <ColumnRender
            id={id}
            background={background}
            style={style}
            width={width}
            alignment={alignment}
            elements={elements}
            dragRef={puck.dragRef}
          />
        ),
      },

      Heading: {
        label: "Heading",
        fields: {
          // `contentEditable: true` — Puck's own native inline-canvas-
          // editing mechanism (master spec §3/§5). Harmless and unused in
          // the server config (`<Render>` never reads `fields` for UI at
          // all), so one shared field definition serves both configs —
          // see this file's top doc comment.
          text: { type: "textarea", label: "Text", contentEditable: true },
          level: {
            type: "select",
            label: "Level",
            options: [
              { label: "H1", value: "h1" },
              { label: "H2", value: "h2" },
              { label: "H3", value: "h3" },
            ],
          },
          alignment: {
            type: "radio",
            label: "Alignment",
            options: ALIGN_OPTIONS,
          },
          style: textStyleField,
        },
        defaultProps: {
          text: "Heading",
          level: "h2",
          alignment: "left",
          style: DEFAULT_STYLE_CONFIG,
        },
        render: ({ id, text, level, alignment, style }) => (
          <HeadingRender
            id={id}
            text={text}
            level={level}
            alignment={alignment}
            style={style}
          />
        ),
      },

      Text: {
        label: "Text",
        fields: {
          text: { type: "textarea", label: "Text", contentEditable: true },
          alignment: {
            type: "radio",
            label: "Alignment",
            options: ALIGN_OPTIONS,
          },
          style: textStyleField,
        },
        defaultProps: {
          text: "Add your copy here.",
          alignment: "left",
          style: DEFAULT_STYLE_CONFIG,
        },
        render: ({ id, text, alignment, style }) => (
          <TextRender id={id} text={text} alignment={alignment} style={style} />
        ),
      },

      // System B (master spec §24.3.1/§24.6 — Rich Text is LAUNCH). A real,
      // separate element — see RichTextRenderElement's own doc comment in
      // elements.tsx for the full "why a native `richtext` field, why a
      // separate element rather than upgrading Text" reasoning. `content`
      // uses Puck's default Tiptap extension set (no custom fork) —
      // paragraphs/headings/bold/italic/underline/strike/links/bulleted+
      // numbered (nested) lists/blockquote/code/code block. No separate
      // `alignment` field, unlike Heading/Text — Tiptap's own `textAlign`
      // extension already gives per-block alignment control inside the
      // rich-text toolbar itself, so a second top-level control would be
      // redundant/conflicting rather than additive.
      RichText: {
        label: "Rich Text",
        fields: {
          content: {
            type: "richtext",
            label: "Content",
            contentEditable: true,
          },
          style: textStyleField,
        },
        defaultProps: {
          content: "<p>Add your rich text here.</p>",
          style: DEFAULT_STYLE_CONFIG,
        },
        render: ({ id, content, style }) => (
          <RichTextRenderElement id={id} content={content} style={style} />
        ),
      },

      Button: {
        label: "Button",
        fields: {
          text: { type: "text", label: "Button Text" },
          action: actionField,
          style: {
            type: "select",
            label: "Style",
            options: [
              { label: "Primary", value: "primary" },
              { label: "Secondary", value: "secondary" },
              { label: "Outline", value: "outline" },
            ],
          },
          alignment: {
            type: "radio",
            label: "Alignment",
            options: ALIGN_OPTIONS,
          },
          // Button already had a field literally named `style` (the
          // primary/secondary/outline preset above, unchanged) before
          // System A — the shared styling field is `styleConfig` here
          // instead, and `background` reuses the exact same Phase 2D
          // `backgroundField`/`BackgroundConfig` Section/Row/Column use
          // (master spec §24, "Button: ...background/color..."), layered
          // behind the label so it shows only when explicitly set — see
          // `ButtonRender`'s own doc comment in elements.tsx.
          background: backgroundField,
          styleConfig: buttonStyleField,
        },
        defaultProps: {
          text: "Click here",
          action: { ...DEFAULT_PAGE_ACTION },
          style: "primary",
          alignment: "left",
          background: DEFAULT_BACKGROUND,
          styleConfig: DEFAULT_STYLE_CONFIG,
        },
        render: ({
          id,
          text,
          action,
          style,
          alignment,
          background,
          styleConfig,
        }) => (
          <ButtonRender
            id={id}
            text={text}
            action={toPageAction(action)}
            style={style}
            alignment={alignment}
            background={background}
            styleConfig={styleConfig}
          />
        ),
      },

      Image: {
        label: "Image",
        fields: {
          src: imageSrcField,
          alt: { type: "text", label: "Alt Text" },
          action: actionField,
          size: imageSizeField,
          style: mediaStyleField,
        },
        defaultProps: {
          src: "",
          alt: "",
          action: { ...DEFAULT_PAGE_ACTION },
          size: DEFAULT_IMAGE_SIZE,
          style: DEFAULT_STYLE_CONFIG,
        },
        render: ({ id, src, alt, action, size, style }) => (
          <ImageRender
            id={id}
            src={src}
            alt={alt}
            action={toPageAction(action)}
            size={size}
            style={style}
          />
        ),
      },

      Video: {
        label: "Video",
        fields: {
          url: { type: "text", label: "Video URL" },
          caption: { type: "text", label: "Caption (optional)" },
          size: videoSizeField,
          playback: videoPlaybackField,
          style: mediaStyleField,
        },
        defaultProps: {
          url: "",
          caption: "",
          size: DEFAULT_VIDEO_SIZE,
          playback: {},
          style: DEFAULT_STYLE_CONFIG,
        },
        render: ({ id, url, caption, size, playback, style }) => (
          <VideoRender
            id={id}
            url={url}
            caption={caption}
            size={size}
            playback={playback}
            style={style}
          />
        ),
      },

      Divider: {
        label: "Divider",
        fields: {
          style: {
            type: "radio",
            label: "Style",
            options: [
              { label: "Line", value: "line" },
              { label: "Space", value: "space" },
            ],
          },
          // Same `style`-name collision as Button — see DividerRender's
          // own doc comment in elements.tsx.
          styleConfig: dividerStyleField,
        },
        defaultProps: { style: "line", styleConfig: DEFAULT_STYLE_CONFIG },
        render: ({ id, style, styleConfig }) => (
          <DividerRender id={id} style={style} styleConfig={styleConfig} />
        ),
      },

      Spacer: {
        label: "Spacer",
        fields: {
          height: { type: "number", label: "Height (px)", min: 0, max: 400 },
        },
        defaultProps: { height: 48 },
        render: ({ height }) => <SpacerRender height={height} />,
      },

      Accordion: {
        label: "Accordion",
        fields: {
          items: {
            type: "array",
            label: "Items",
            arrayFields: {
              title: { type: "text", label: "Title" },
              content: { type: "textarea", label: "Content" },
            },
            defaultItemProps: { title: "Question", content: "Answer" },
            getItemSummary: (item) => item.title || "Untitled item",
          },
          allowMultiple: {
            type: "radio",
            label: "Allow multiple open",
            options: [
              { label: "Yes", value: true },
              { label: "No", value: false },
            ],
          },
          style: accordionStyleField,
        },
        defaultProps: {
          items: [{ title: "Question", content: "Answer" }],
          allowMultiple: true,
          style: DEFAULT_STYLE_CONFIG,
        },
        // Puck's `array` field manages each item's own stable `id` — passed
        // straight through to AccordionRender, which needs real per-item
        // ids anyway (React keys, and the single-open `name` grouping).
        render: ({ id, items, allowMultiple, style }) => (
          <AccordionRender
            id={id}
            items={items}
            allowMultiple={allowMultiple}
            style={style}
          />
        ),
      },

      Form: {
        label: "Form",
        fields: {
          // Real user QA blocker: this used to be a raw text field asking
          // for a Magnetix Form ID directly ("unacceptable customer UX" per
          // that task). `formIdField` is a real dropdown of this
          // sub-account's own Forms, showing human-readable names — see
          // form-field.tsx. The underlying stored prop is still the same
          // flat `formId: string` (schema-compatible with every
          // already-persisted page), so nothing downstream (`resolve.ts`'s
          // `collectPuckFormIds`, the publish/save flow, migrate-v1.ts)
          // needed to change. `formName` is intentionally no longer a
          // separately user-editable field — the selector itself already
          // shows the real form name, and the render side's `formName` prop
          // (still accepted, for the "not found" fallback label) is simply
          // never written by new selections; harmless on any page that
          // already had one from before this fix.
          formId: formIdField,
          style: formStyleField,
        },
        defaultProps: { formId: "", formName: "", style: DEFAULT_STYLE_CONFIG },
        // `puck.metadata` — the tenant-scoping/pre-resolved-data channel
        // proven in the POC (master spec §11). Cast is safe: both configs
        // below always construct `metadata` as a real `PuckPageMetadata`.
        render: ({ id, formId, formName, style, puck }) => (
          <FormComponent
            id={id}
            formId={formId}
            formName={formName}
            style={style}
            metadata={puck.metadata as PuckPageMetadata}
          />
        ),
      },
    },
  };
}
