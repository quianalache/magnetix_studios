import type { Config } from "@puckeditor/core";
import type { PuckPageMetadata, PageAction } from "@/types/pages-funnels-puck";
import { DEFAULT_PAGE_ACTION } from "@/types/pages-funnels-puck";
import {
  WIDTH_OPTIONS,
  ALIGN_OPTIONS,
} from "@/lib/pages-funnels/puck/constants";
import {
  SectionRender,
  RowRender,
  ColumnRender,
} from "@/components/pages-funnels/puck/layout";
import {
  HeadingRender,
  TextRender,
  ButtonRender,
  ImageRender,
  VideoRender,
  DividerRender,
  SpacerRender,
  AccordionRender,
} from "@/components/pages-funnels/puck/elements";

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
  formId: string;
  formName: string;
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
          "Button",
          "Image",
          "Video",
          "Divider",
          "Spacer",
          "Accordion",
        ],
      },
      business: { title: "Business", components: ["Form"] },
    },
    components: {
      Section: {
        label: "Section",
        fields: {
          background: {
            type: "select",
            label: "Background",
            options: [
              { label: "None", value: "none" },
              { label: "Solid", value: "solid" },
              { label: "Gradient", value: "gradient" },
            ],
          },
          maxWidth: {
            type: "select",
            label: "Max Width",
            options: [
              { label: "Contained", value: "contained" },
              { label: "Wide", value: "wide" },
              { label: "Full", value: "full" },
            ],
          },
          paddingTop: {
            type: "number",
            label: "Padding Top (px)",
            min: 0,
            max: 200,
          },
          paddingBottom: {
            type: "number",
            label: "Padding Bottom (px)",
            min: 0,
            max: 200,
          },
          rows: { type: "slot", allow: ["Row"] },
        },
        defaultProps: {
          background: "none",
          maxWidth: "contained",
          paddingTop: 64,
          paddingBottom: 64,
          rows: [],
        },
        render: ({ background, maxWidth, paddingTop, paddingBottom, rows }) => (
          <SectionRender
            background={background}
            maxWidth={maxWidth}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            rows={rows}
          />
        ),
      },

      Row: {
        label: "Row",
        fields: {
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
                width: "1/2",
                alignment: "left",
                elements: [],
              },
            },
            {
              type: "Column",
              props: {
                id: "column-b",
                width: "1/2",
                alignment: "left",
                elements: [],
              },
            },
          ],
        },
        render: ({ gap, verticalAlign, columns }) => (
          <RowRender
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
        defaultProps: { width: "auto", alignment: "left", elements: [] },
        render: ({ width, alignment, elements, puck }) => (
          <ColumnRender
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
        },
        defaultProps: { text: "Heading", level: "h2", alignment: "left" },
        render: ({ text, level, alignment }) => (
          <HeadingRender text={text} level={level} alignment={alignment} />
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
        },
        defaultProps: { text: "Add your copy here.", alignment: "left" },
        render: ({ text, alignment }) => (
          <TextRender text={text} alignment={alignment} />
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
        },
        defaultProps: {
          text: "Click here",
          action: { ...DEFAULT_PAGE_ACTION },
          style: "primary",
          alignment: "left",
        },
        render: ({ text, action, style, alignment }) => (
          <ButtonRender
            text={text}
            action={toPageAction(action)}
            style={style}
            alignment={alignment}
          />
        ),
      },

      Image: {
        label: "Image",
        fields: {
          src: { type: "text", label: "Image URL" },
          alt: { type: "text", label: "Alt Text" },
          action: actionField,
        },
        defaultProps: { src: "", alt: "", action: { ...DEFAULT_PAGE_ACTION } },
        render: ({ src, alt, action }) => (
          <ImageRender src={src} alt={alt} action={toPageAction(action)} />
        ),
      },

      Video: {
        label: "Video",
        fields: {
          url: { type: "text", label: "Video URL" },
          caption: { type: "text", label: "Caption (optional)" },
        },
        defaultProps: { url: "", caption: "" },
        render: ({ url, caption }) => (
          <VideoRender url={url} caption={caption} />
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
        },
        defaultProps: { style: "line" },
        render: ({ style }) => <DividerRender style={style} />,
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
        },
        defaultProps: {
          items: [{ title: "Question", content: "Answer" }],
          allowMultiple: true,
        },
        // Puck's `array` field manages each item's own stable `id` — passed
        // straight through to AccordionRender, which needs real per-item
        // ids anyway (React keys, and the single-open `name` grouping).
        render: ({ id, items, allowMultiple }) => (
          <AccordionRender
            id={id}
            items={items}
            allowMultiple={allowMultiple}
          />
        ),
      },

      Form: {
        label: "Form",
        fields: {
          formId: { type: "text", label: "Magnetix Form ID" },
          formName: { type: "text", label: "Display Name (optional)" },
        },
        defaultProps: { formId: "", formName: "" },
        // `puck.metadata` — the tenant-scoping/pre-resolved-data channel
        // proven in the POC (master spec §11). Cast is safe: both configs
        // below always construct `metadata` as a real `PuckPageMetadata`.
        render: ({ formId, formName, puck }) => (
          <FormComponent
            formId={formId}
            formName={formName}
            metadata={puck.metadata as PuckPageMetadata}
          />
        ),
      },
    },
  };
}
