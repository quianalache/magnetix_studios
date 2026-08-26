import { Render, resolveAllData } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import config from "../config";

/**
 * Proves the SAME config + a Puck Data payload renders correctly through
 * <Render> in a real Next.js Server Component, completely outside the
 * <Puck> editor — the audit's §13 (Public Rendering) question, answered
 * with real code rather than docs alone. This is a hardcoded, representative
 * Data literal (captured from this same POC's editor — see the final
 * report's §17 for the exact JSON) — not wired to /p/[pageId] and not
 * reading anything from Firestore.
 */

const RENDER_TEST_DATA: Data = {
  content: [
    {
      type: "Section",
      props: {
        id: "render-test-hero",
        background: "gradient",
        maxWidth: "contained",
        paddingTop: 96,
        paddingBottom: 96,
        rows: [
          {
            type: "Row",
            props: {
              id: "render-test-hero-row",
              gap: 32,
              verticalAlign: "center",
              columns: [
                {
                  type: "Column",
                  props: {
                    id: "render-test-hero-col-1",
                    width: "1/2",
                    alignment: "left",
                    elements: [
                      {
                        type: "Heading",
                        props: {
                          id: "render-test-heading",
                          text: "Rendered outside the editor via <Render>",
                          level: "h1",
                          alignment: "left",
                        },
                      },
                      {
                        type: "Text",
                        props: {
                          id: "render-test-text",
                          text: "This exact Data payload never touched the <Puck> editor component on this page — it was captured from the POC editor and rendered here through Puck's server-compatible <Render>.",
                          alignment: "left",
                        },
                      },
                      {
                        type: "Button",
                        props: {
                          id: "render-test-button",
                          text: "Real link",
                          link: "https://magnetixstudios.com",
                          openInNewTab: true,
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
                    id: "render-test-hero-col-2",
                    width: "1/2",
                    alignment: "left",
                    elements: [{ type: "Image", props: { id: "render-test-image", src: "", alt: "Test image", link: "" } }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      type: "Section",
      props: {
        id: "render-test-form-section",
        background: "none",
        maxWidth: "contained",
        paddingTop: 64,
        paddingBottom: 64,
        rows: [
          {
            type: "Row",
            props: {
              id: "render-test-form-row",
              gap: 24,
              verticalAlign: "top",
              columns: [
                {
                  type: "Column",
                  props: {
                    id: "render-test-form-col",
                    width: "full",
                    alignment: "left",
                    elements: [{ type: "Form", props: { id: "render-test-form", formId: "", formName: "" } }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
  root: { props: {} },
};

export default async function PuckPocRenderPage() {
  // resolveAllData is the server-compatible utility for executing any
  // resolveData()/resolveFields() hooks a component might define before
  // <Render> paints — none of this POC's components define one, so this
  // is a no-op pass-through here, but it's the correct call site for where
  // production Form-style server-side resolution would eventually live.
  const resolved = await resolveAllData(RENDER_TEST_DATA, config);

  return (
    <div className="min-h-screen bg-white p-6">
      <p className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        Puck POC — server-rendered via &lt;Render&gt;, no editor, no client-side Puck code on this page.
      </p>
      <Render config={config} data={resolved} />
    </div>
  );
}
