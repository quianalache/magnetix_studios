import type { ComponentData, Data } from "@puckeditor/core";
import { DEFAULT_BACKGROUND } from "@/lib/pages-funnels/puck/background";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";

/**
 * The starting point for a new Reading Result Page (2026-10-21) — a real,
 * fully editable New Builder draft (not a locked template): a welcome with
 * the MyMagnetix button, then the main Human Design sections, then a spot
 * for a next step. Every block can be moved, edited, removed, or mixed with
 * text, images, video, testimonials and Featured Offers.
 */

function el(type: string, props: Record<string, unknown>): ComponentData {
  return { type, props: { id: newPuckNodeId(), ...props } } as ComponentData;
}

function section(elements: ComponentData[], opts: { paddingTop?: number; paddingBottom?: number; alignment?: "left" | "center" } = {}): ComponentData {
  return {
    type: "Section",
    props: {
      id: newPuckNodeId(),
      background: DEFAULT_BACKGROUND,
      style: DEFAULT_STYLE_CONFIG,
      maxWidth: "contained",
      fullWidthBackground: true,
      paddingTop: opts.paddingTop ?? 40,
      paddingBottom: opts.paddingBottom ?? 40,
      rows: [
        {
          type: "Row",
          props: {
            id: newPuckNodeId(),
            background: DEFAULT_BACKGROUND,
            style: DEFAULT_STYLE_CONFIG,
            gap: 24,
            verticalAlign: "top",
            columns: [
              {
                type: "Column",
                props: {
                  id: newPuckNodeId(),
                  background: DEFAULT_BACKGROUND,
                  style: DEFAULT_STYLE_CONFIG,
                  width: "full",
                  alignment: opts.alignment ?? "left",
                  elements,
                },
              },
            ],
          },
        },
      ],
    },
  } as ComponentData;
}

export function buildReadingResultStarterData(): Data {
  return {
    root: { props: {} },
    content: [
      section(
        [
          el("Heading", { text: "Your Reading is ready", level: "h1", alignment: "center", style: DEFAULT_STYLE_CONFIG }),
          el("Text", { text: "Here’s what your chart says about how you’re designed to move through the world.", alignment: "center", style: DEFAULT_STYLE_CONFIG }),
          el("MyMagnetixButton", {
            label: "Open your Reading in MyMagnetix",
            helper: "First time here? Check your email to finish setting up access.",
            align: "center",
          }),
        ],
        { paddingTop: 64, alignment: "center" },
      ),
      section([el("HumanDesignChart", { heading: "Your Human Design Chart" })]),
      section([
        el("AtAGlance", {
          heading: "At a Glance",
          facts: "type,strategy,authority,profile,definition,incarnationCross,signature,notSelfTheme",
          layout: "cards",
          descriptions: true,
        }),
      ]),
      section([el("Centers", { heading: "Your Centers", layout: "cards", show: "definedFirst", descriptions: true })]),
      section([el("Channels", { heading: "Your Channels", layout: "cards" })]),
      section([el("Gates", { heading: "Your Gates", display: "grid", showFilters: true })]),
      section([el("Variables", { heading: "Your Variables", layout: "cards", descriptions: true })]),
      section([el("Skills", { heading: "Skills & Attributes", layers: "coreStrengths,signatureTalents,naturalGifts" })]),
      section(
        [
          el("Heading", { text: "Keep exploring", level: "h2", alignment: "center", style: DEFAULT_STYLE_CONFIG }),
          el("Text", { text: "Add a Featured Offer from Next Steps to invite them into a course, session or membership.", alignment: "center", style: DEFAULT_STYLE_CONFIG }),
          el("PdfButton", { label: "Download PDF" }),
        ],
        { paddingBottom: 72, alignment: "center" },
      ),
    ],
  };
}
