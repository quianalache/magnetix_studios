import type { Config } from "@puckeditor/core";
import { HeadingRender, TextRender, ButtonRender, ImageRender, FormRender } from "./elements";

/**
 * Puck Proof-of-Concept config — an isolated experiment, NOT the production
 * Magnetix Pages & Funnels config. Deliberately reproduces the fixed
 * Section -> Row -> Column -> Element shape approved for V2
 * (src/types/pages-funnels-v2.ts) using Puck's own `slot` field, per the
 * architecture audit's Layout Architecture finding: each of Section/Row/
 * Column is a real component with exactly one `allow`-restricted slot.
 *
 * Kept deliberately hook-free in every `render` function (per Puck's own
 * React Server Components guide) so this ONE config can be used both by the
 * client-only <Puck> editor and by a server-rendered <Render> — the render
 * page in this same folder imports it directly to prove that. The one
 * component with real interactivity (Form, which renders the actual
 * Magnetix PublicForm) is isolated in its own "use client" file
 * (./elements.tsx) and referenced from here, matching Puck's documented
 * "mark interactive components with use client" pattern.
 */

const WIDTH_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "1/4", value: "1/4" },
  { label: "1/3", value: "1/3" },
  { label: "1/2", value: "1/2" },
  { label: "2/3", value: "2/3" },
  { label: "3/4", value: "3/4" },
  { label: "Full", value: "full" },
];

const ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

/**
 * 12-column grid span per Column width value. Every entry is `col-span-12`
 * below `sm:` (mobile: always full-width, i.e. stacked) and only takes its
 * real fraction at `sm:` and up — same mobile-safe pattern as everywhere
 * else in this repo's responsive CSS, just expressed as a grid span instead
 * of a flex-basis. "auto" has no natural grid-span meaning (it's a
 * flex-only concept — "share remaining space") so it falls back to half
 * width; it isn't part of the required Column-width acceptance matrix.
 */
const COLUMN_SPAN_CLASS: Record<"auto" | "1/4" | "1/3" | "1/2" | "2/3" | "3/4" | "full", string> = {
  auto: "col-span-12 sm:col-span-6",
  "1/4": "col-span-12 sm:col-span-3",
  "1/3": "col-span-12 sm:col-span-4",
  "1/2": "col-span-12 sm:col-span-6",
  "2/3": "col-span-12 sm:col-span-8",
  "3/4": "col-span-12 sm:col-span-9",
  full: "col-span-12",
};

const config: Config = {
  categories: {
    layout: { title: "Layout", components: ["Section", "Row", "Column"] },
    elements: { title: "Elements", components: ["Heading", "Text", "Button", "Image"] },
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
        paddingTop: { type: "number", label: "Padding Top (px)", min: 0, max: 200 },
        paddingBottom: { type: "number", label: "Padding Bottom (px)", min: 0, max: 200 },
        rows: { type: "slot", allow: ["Row"] },
      },
      defaultProps: {
        background: "none",
        maxWidth: "contained",
        paddingTop: 64,
        paddingBottom: 64,
        rows: [],
      },
      render: ({ background, maxWidth, paddingTop, paddingBottom, rows: Rows }) => (
        <section
          style={{
            paddingTop,
            paddingBottom,
            background:
              background === "gradient"
                ? "linear-gradient(120deg, #E8B7C8 0%, #5E2574 100%)"
                : background === "solid"
                  ? "#f1eef2"
                  : undefined,
          }}
          className="px-6"
        >
          <div
            className="mx-auto flex flex-col gap-8"
            style={{ maxWidth: maxWidth === "contained" ? 1024 : maxWidth === "wide" ? 1280 : undefined }}
          >
            <Rows allow={["Row"]} />
          </div>
        </section>
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
        // immediately a usable 2-column layout, proving that a slot's
        // defaultProps can carry real nested ComponentData -- the same
        // mechanism a production "2 Columns" library preset would use.
        // Explicit ids here even though this is only 1 level of nesting --
        // see hero-preset.ts's doc comment for why every nested node in
        // this POC gets one regardless of depth, after finding the crash
        // this avoids.
        columns: [
          { type: "Column", props: { id: `Column-${Math.random().toString(36).slice(2, 8)}`, width: "1/2", alignment: "left", elements: [] } },
          { type: "Column", props: { id: `Column-${Math.random().toString(36).slice(2, 8)}`, width: "1/2", alignment: "left", elements: [] } },
        ],
      },
      // The Row->Column relationship needs BOTH fixes found in this repo's
      // Puck testing, for two DIFFERENT reasons:
      //  1. The container (this Row): className/style go on the <Columns>
      //     slot component call itself, not a separate wrapping <div> --
      //     Puck wraps each slot item in its own DOM node, so a wrapping
      //     div here would put "display:grid" one level too deep to
      //     actually contain those per-item wrapper nodes as grid children.
      //  2. Per-item WIDTH (Column, below): the container fix alone isn't
      //     enough for sizing that depends on each item's OWN field value
      //     (width), because Puck's per-item wrapper -- not Column's own
      //     rendered <div> -- is what the grid actually sizes. That needs
      //     `inline: true` + `puck.dragRef` on Column itself; see there.
      // CSS Grid (not flexbox) here specifically because grid-column spans
      // give each Column a clean, independent way to declare its own size
      // as a class on itself, once dragRef makes that div the real grid
      // child -- flexbox's flex-basis needs the same fix but grid spans map
      // more directly onto "1/4, 1/3, 1/2, 2/3, 3/4" as documented in the
      // task and are simpler to reason about.
      render: ({ gap, verticalAlign, columns: Columns }) => (
        <Columns
          allow={["Column"]}
          className="grid grid-cols-12"
          style={{
            gap,
            alignItems: verticalAlign === "center" ? "center" : verticalAlign === "bottom" ? "flex-end" : "start",
          }}
        />
      ),
    },

    Column: {
      label: "Column",
      // `inline: true` tells Puck NOT to wrap this component's rendered
      // output in its own internal positioning wrapper when it's a slot
      // item -- instead Puck hands the component `puck.dragRef` (a ref
      // callback) to attach to whichever DOM node should be treated as the
      // real slot item for drag/selection/layout purposes. Without this,
      // Column's own width-bearing <div> sits one level BELOW the actual
      // grid child Puck creates, so `col-span-*` classes on it are inert --
      // confirmed via computed-style inspection in the prior POC pass (both
      // columns landed at the same `top`, full width, regardless of their
      // width field). With `inline` + `dragRef` on Column's own root <div>,
      // that div IS the real grid child, and its `col-span-*` class
      // (COLUMN_SPAN_CLASS[width]) genuinely controls the grid layout.
      inline: true,
      fields: {
        width: { type: "select", label: "Width", options: WIDTH_OPTIONS },
        alignment: { type: "radio", label: "Content Alignment", options: ALIGN_OPTIONS },
        elements: { type: "slot", allow: ["Heading", "Text", "Button", "Image", "Form"] },
      },
      defaultProps: { width: "auto", alignment: "left", elements: [] },
      render: ({ width, alignment, elements: Elements, puck }) => (
        <div
          ref={puck.dragRef}
          className={
            `min-w-0 flex flex-col gap-4 ${COLUMN_SPAN_CLASS[width as keyof typeof COLUMN_SPAN_CLASS]}` +
            (alignment === "center" ? " items-center text-center" : alignment === "right" ? " items-end text-right" : "")
          }
        >
          <Elements allow={["Heading", "Text", "Button", "Image", "Form"]} />
        </div>
      ),
    },

    Heading: {
      label: "Heading",
      fields: {
        // `contentEditable: true` is Puck's own native inline-canvas-editing
        // mechanism (shipped in 0.20, confirmed present in the installed
        // 0.23.0 types) -- clicking into the rendered Heading on the canvas
        // edits it directly, no custom implementation, no parallel state.
        // The Fields-panel textarea (below, in the sidebar) keeps working
        // as a second, always-available way to edit the same field.
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
        alignment: { type: "radio", label: "Alignment", options: ALIGN_OPTIONS },
      },
      defaultProps: { text: "Heading", level: "h2", alignment: "left" },
      render: ({ text, level, alignment }) => <HeadingRender text={text} level={level} alignment={alignment} />,
    },

    Text: {
      label: "Text",
      fields: {
        text: { type: "textarea", label: "Text", contentEditable: true },
        alignment: { type: "radio", label: "Alignment", options: ALIGN_OPTIONS },
      },
      defaultProps: { text: "Add your copy here.", alignment: "left" },
      render: ({ text, alignment }) => <TextRender text={text} alignment={alignment} />,
    },

    Button: {
      label: "Button",
      fields: {
        text: { type: "text", label: "Button Text" },
        link: { type: "text", label: "Destination URL" },
        openInNewTab: {
          type: "radio",
          label: "Open in new tab",
          options: [
            { label: "No", value: false },
            { label: "Yes", value: true },
          ],
        },
        style: {
          type: "select",
          label: "Style",
          options: [
            { label: "Primary", value: "primary" },
            { label: "Secondary", value: "secondary" },
            { label: "Outline", value: "outline" },
          ],
        },
        alignment: { type: "radio", label: "Alignment", options: ALIGN_OPTIONS },
      },
      defaultProps: { text: "Click here", link: "#", openInNewTab: false, style: "primary", alignment: "left" },
      render: ({ text, link, openInNewTab, style, alignment }) => (
        <ButtonRender text={text} link={link} openInNewTab={openInNewTab} style={style} alignment={alignment} />
      ),
    },

    Image: {
      label: "Image",
      fields: {
        src: { type: "text", label: "Image URL" },
        alt: { type: "text", label: "Alt Text" },
        link: { type: "text", label: "Link (optional)" },
      },
      defaultProps: { src: "", alt: "", link: "" },
      render: ({ src, alt, link }) => <ImageRender src={src} alt={alt} link={link} />,
    },

    Form: {
      label: "Form",
      fields: {
        formId: { type: "text", label: "Magnetix Form ID" },
        formName: { type: "text", label: "Display Name (optional)" },
      },
      defaultProps: { formId: "", formName: "" },
      // `puck.metadata` is how tenant scoping (agencyId/subAccountId) would
      // flow into a real form picker's resolveFields() in production --
      // proven here by just reading it, not by building the full picker
      // (out of scope for this POC per the task).
      render: ({ formId, formName, puck }) => (
        <FormRender formId={formId} formName={formName} subAccountId={String(puck.metadata?.subAccountId ?? "")} />
      ),
    },
  },
};

export default config;
