import type { ComponentData } from "@puckeditor/core";

/**
 * Programmatic "prebuilt Hero" insertion — the POC proof for the
 * architecture audit's core claim (§4/§16 of that audit): a prebuilt
 * section must NOT be an indivisible Puck component. This is a plain
 * function producing real, independently-editable ComponentData (a
 * Section containing a Row containing two Columns containing Heading/
 * Text/Button and an Image) — mechanically identical to how
 * src/lib/pages-funnels/templates.ts's PAGE_TEMPLATES already work for the
 * production V1/V2 builder, just targeting Puck's ComponentData shape.
 *
 * IMPORTANT, discovered by actually running this against the installed
 * @puckeditor/core 0.23.0 (not assumed from types): every nested node
 * below has an explicit, unique `id`, even though the installed package's
 * own `ComponentDataOptionalId` type says slot values don't require one.
 * In practice, omitting ids on 2+ levels of nested slot content crashes
 * Puck's Outline panel ("Cannot read properties of null (reading
 * 'position')") — and even with the Outline excluded from the layout, the
 * editor becomes unresponsive rather than throwing. Assigning explicit ids
 * to every nested node avoids both failure modes entirely. See the POC
 * report's Risks section — this is the single most important thing to
 * carry into a production migration function.
 */
function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildHeroSection(): ComponentData {
  return {
    type: "Section",
    props: {
      id: id("Section-hero"),
      background: "gradient",
      maxWidth: "contained",
      paddingTop: 96,
      paddingBottom: 96,
      rows: [
        {
          type: "Row",
          props: {
            id: id("Row-hero"),
            gap: 32,
            verticalAlign: "center",
            columns: [
              {
                type: "Column",
                props: {
                  id: id("Column-hero-1"),
                  width: "1/2",
                  alignment: "left",
                  elements: [
                    {
                      type: "Heading",
                      props: {
                        id: id("Heading-hero"),
                        text: "Grow your list with a page that converts",
                        level: "h1",
                        alignment: "left",
                      },
                    },
                    {
                      type: "Text",
                      props: {
                        id: id("Text-hero"),
                        text: "Magnetix helps you build native pages made of the same blocks you can click and edit individually.",
                        alignment: "left",
                      },
                    },
                    {
                      type: "Button",
                      props: {
                        id: id("Button-hero"),
                        text: "Get Started",
                        link: "#",
                        openInNewTab: false,
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
                  id: id("Column-hero-2"),
                  width: "1/2",
                  alignment: "left",
                  elements: [{ type: "Image", props: { id: id("Image-hero"), src: "", alt: "Product screenshot", link: "" } }],
                },
              },
            ],
          },
        },
      ],
    },
  } as ComponentData;
}
