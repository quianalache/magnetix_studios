"use client";

import { useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import type { Data } from "@puckeditor/core";
import config from "./config";
import { buildHeroSection } from "./hero-preset";

/**
 * ISOLATED Puck proof-of-concept — validates whether Puck can own the
 * Magnetix Pages & Funnels editor engine, per the Puck integration audit.
 * NOT wired into any production route, not linked from production nav,
 * does not touch PageDoc/Firestore/production Firestore rules. Lives under
 * /docs (public, unauthenticated per middleware.ts's PUBLIC_ROUTES list),
 * matching the repo's existing design-prototypes isolation convention.
 *
 * Every nested node in the seed data below has an explicit `id` — required
 * in practice (not just optional per the types) to avoid a real crash/hang
 * discovered while building this POC; see hero-preset.ts's doc comment and
 * the final report's Risks section.
 */

const VIEWPORTS = [
  { width: 1280, height: "auto" as const, label: "Desktop", icon: "Monitor" as const },
  { width: 768, height: "auto" as const, label: "Tablet", icon: "Tablet" as const },
  { width: 390, height: "auto" as const, label: "Mobile", icon: "Smartphone" as const },
];

// Hoisted to stable module-level references -- ROOT CAUSE FIX for the
// Insert Undo Blocker (see the task's audit report). `<Puck>` is a
// CONTROLLED component here (data/onChange round-trips through React
// state), so a re-created inline object literal for `iframe`/`metadata`
// gets a brand-new identity on every single render, including the
// re-render triggered by the very insert action being tested. A minimal
// stock-Puck repro (puck-poc/minimal-repro) isolated this exact object-
// identity churn as the trigger: with a fresh `iframe={{...}}` literal,
// Undo silently no-ops on the FIRST insert of a session (index/hasPast()
// bookkeeping flips correctly, but the restored state doesn't change --
// consistent with a shared/mutated array reference rather than an
// immutable clone, the same class of bug as puckeditor/puck#1736).
// Hoisting these props to stable references eliminates the churn and
// fixed it in the isolated repro across 3 repeated runs; see the report.
const IFRAME_CONFIG = { enabled: true, waitForStyles: true, syncHostStyles: true };
const PUCK_METADATA = { subAccountId: "poc-subaccount" };

/** Seeded so the canvas is immediately taller than the viewport (scrolling
 *  test, §13) and already contains a real two-column layout (§5) without
 *  requiring manual setup first. */
function initialData(): Data {
  const simpleSection = (n: number) => ({
    type: "Section",
    props: {
      id: `seed-section-${n}`,
      background: n % 2 === 0 ? "solid" : "none",
      maxWidth: "contained",
      paddingTop: 64,
      paddingBottom: 64,
      rows: [
        {
          type: "Row",
          props: {
            id: `seed-row-${n}`,
            gap: 24,
            verticalAlign: "top",
            columns: [
              {
                type: "Column",
                props: {
                  id: `seed-col-${n}`,
                  width: "full",
                  alignment: "left",
                  elements: [
                    { type: "Heading", props: { id: `seed-heading-${n}`, text: `Section ${n}`, level: "h2", alignment: "left" } },
                    {
                      type: "Text",
                      props: {
                        id: `seed-text-${n}`,
                        text: `This is seed section ${n} — present from load so the page is taller than the viewport, proving the canvas scrolls.`,
                        alignment: "left",
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
  });

  const twoColumnSection = {
    type: "Section",
    props: {
      id: "seed-two-column",
      background: "none",
      maxWidth: "contained",
      paddingTop: 64,
      paddingBottom: 64,
      rows: [
        {
          type: "Row",
          props: {
            id: "seed-two-column-row",
            gap: 24,
            verticalAlign: "top",
            columns: [
              {
                type: "Column",
                props: {
                  id: "seed-two-column-col-1",
                  width: "1/2",
                  alignment: "left",
                  elements: [
                    { type: "Heading", props: { id: "seed-two-column-heading", text: "Two-column test", level: "h2", alignment: "left" } },
                    {
                      type: "Text",
                      props: { id: "seed-two-column-text", text: "This column has Heading, Text, and Button.", alignment: "left" },
                    },
                    {
                      type: "Button",
                      props: {
                        id: "seed-two-column-button",
                        text: "Click me",
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
                  id: "seed-two-column-col-2",
                  width: "1/2",
                  alignment: "left",
                  elements: [{ type: "Image", props: { id: "seed-two-column-image", src: "", alt: "Test image", link: "" } }],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const formSection = {
    type: "Section",
    props: {
      id: "seed-form-section",
      background: "none",
      maxWidth: "contained",
      paddingTop: 64,
      paddingBottom: 64,
      rows: [
        {
          type: "Row",
          props: {
            id: "seed-form-row",
            gap: 24,
            verticalAlign: "top",
            columns: [
              {
                type: "Column",
                props: {
                  id: "seed-form-col",
                  width: "full",
                  alignment: "left",
                  elements: [{ type: "Form", props: { id: "seed-form-element", formId: "", formName: "" } }],
                },
              },
            ],
          },
        },
      ],
    },
  };

  return {
    content: [twoColumnSection, formSection, ...[1, 2, 3, 4, 5].map(simpleSection)] as Data["content"],
    root: { props: {} },
  };
}

export default function PuckPocEditor() {
  const [data, setData] = useState<Data>(initialData);

  return (
    <div className="flex h-dvh flex-col bg-white text-gray-900">
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div>
          <p className="text-sm font-semibold">Puck POC — isolated prototype, not production</p>
          <p className="text-xs text-gray-500">src/app/docs/design-prototypes/puck-poc — no Firestore writes, nothing linked from app nav</p>
        </div>
      </div>

      {/* Using Puck's own DEFAULT full-UI composition (no custom `children`)
          rather than a hand-arranged <Puck.Layout> — found while building
          this POC that composing Puck.Components/Preview/Outline/Fields as
          custom children renders them as plain stacked <div>s, NOT Puck's
          own side-by-side drawer/canvas/fields grid; that grid is internal
          CSS applied only to Puck's own default composition. Getting a true
          custom LEFT/CENTER/RIGHT arrangement (matching the task's asked-for
          layout) would require writing that CSS Grid by hand — a real,
          documented cost, not automatic. The default composition below
          already includes the library drawer, canvas, fields panel, AND
          the Outline, side-by-side, which is what this POC actually needs
          to validate editor behavior. See the final report's §12/Risks. */}
      <div className="min-h-0 flex-1">
        <Puck
          config={config}
          data={data}
          onChange={setData}
          viewports={VIEWPORTS}
          iframe={IFRAME_CONFIG}
          metadata={PUCK_METADATA}
          height="calc(100vh - 60px)"
          renderHeaderActions={({ dispatch }) => (
            // IMPORTANT finding from actually running this: the `data` prop
            // is NOT reliably controlled after mount — mutating it from
            // outside <Puck> (e.g. plain setData() from a sibling button)
            // did not update the live canvas in testing. The correct,
            // documented mechanism is dispatching a real Puck action from
            // INSIDE the <Puck> tree, which is why this button lives in
            // `renderHeaderActions` (the one place Puck hands you `dispatch`)
            // rather than next to the top bar. `setData` is one of Puck's
            // own action types (confirmed in the installed package's
            // types) — this is the real, working mechanism a production
            // "prebuilt section" insertion would use, not a hack.
            //
            // `recordHistory: true` -- found via source-level investigation
            // of Puck's reducer (packages/core/reducer/index.ts on GitHub):
            // "setData" is in that reducer's default NON-history-recording
            // action list (alongside registerZone/unregisterZone/setUi/set),
            // so a prebuilt-section insertion via setData would silently be
            // un-undoable unless explicitly opted back in. `recordHistory`
            // is a real, typed, top-level field on every PuckAction
            // (confirmed in the installed 0.23.0 types) precisely for this.
            // NOTE: this flag alone did NOT fix Undo in live testing until
            // the `iframe`/`metadata` props above were also hoisted to
            // stable module-level references -- see IFRAME_CONFIG's doc
            // comment for the actual root cause this fixes.
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "setData",
                  recordHistory: true,
                  data: (prev) => ({ content: [buildHeroSection(), ...prev.content] }),
                })
              }
              className="rounded-full bg-[#5E2574] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#5E2574]/90"
            >
              + Insert Hero Section
            </button>
          )}
        />
      </div>

      <details className="border-t border-gray-200 bg-gray-950 text-gray-100">
        <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Serialized Puck Data (JSON) — click to expand
        </summary>
        <pre className="max-h-64 overflow-auto px-4 pb-4 text-[11px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}
