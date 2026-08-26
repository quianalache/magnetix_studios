import type { ComponentData } from "@puckeditor/core";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";
import { DEFAULT_PAGE_ACTION } from "@/types/pages-funnels-puck";

/**
 * Production Hero prebuilt-section factory — master spec §5/§15's reference
 * implementation ("Hero must NOT be an indivisible mega-block... implement
 * at least one reference: Hero"). Produces real, independently-editable
 * `ComponentData` (Section → Row → [Column(Heading/Text/Button),
 * Column(Image)]) — mechanically the same approach V1's
 * `src/lib/pages-funnels/templates.ts` already uses for its own prebuilt
 * pages, now targeting Puck's `ComponentData` shape instead of `PageBlock[]`.
 *
 * Every nested node gets an explicit, unique id via `newPuckNodeId()` — see
 * that function's doc comment and master spec §3: omitting ids 2+ levels
 * deep crashed/hung the editor in POC testing despite the installed
 * package's own types marking nested ids optional. This is not optional
 * here even though TypeScript won't force it.
 */
export function buildHeroSection(): ComponentData {
  return {
    type: "Section",
    props: {
      id: newPuckNodeId(),
      background: "gradient",
      maxWidth: "contained",
      paddingTop: 96,
      paddingBottom: 96,
      rows: [
        {
          type: "Row",
          props: {
            id: newPuckNodeId(),
            gap: 32,
            verticalAlign: "center",
            columns: [
              {
                type: "Column",
                props: {
                  id: newPuckNodeId(),
                  width: "1/2",
                  alignment: "left",
                  elements: [
                    {
                      type: "Heading",
                      props: {
                        id: newPuckNodeId(),
                        text: "Grow your list with a page that converts",
                        level: "h1",
                        alignment: "left",
                      },
                    },
                    {
                      type: "Text",
                      props: {
                        id: newPuckNodeId(),
                        text: "Magnetix helps you build native pages made of the same blocks you can click and edit individually.",
                        alignment: "left",
                      },
                    },
                    {
                      type: "Button",
                      props: {
                        id: newPuckNodeId(),
                        text: "Get Started",
                        action: { ...DEFAULT_PAGE_ACTION },
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
                  id: newPuckNodeId(),
                  width: "1/2",
                  alignment: "left",
                  elements: [
                    {
                      type: "Image",
                      props: {
                        id: newPuckNodeId(),
                        src: "",
                        alt: "Product screenshot",
                        action: { ...DEFAULT_PAGE_ACTION },
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
  } as ComponentData;
}
