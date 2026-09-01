"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { PAGE_TEMPLATES } from "@/lib/pages-funnels/templates";
import { migratePageBlocksToPuckData } from "@/lib/pages-funnels/puck/migrate-v1";

/**
 * QA-ONLY harness for Phase 2A's MagnetixPuckEditorShell — NOT the real CRM
 * route (that's `(builder)/sa/[subAccountId]/pages-funnels/[pageId]/
 * new-builder`). Exists purely because that real route requires real
 * Firebase Auth + a real sub-account/page, which this session cannot
 * obtain — see the Phase 2A task report's QA section for the full
 * explanation. Renders the EXACT SAME `MagnetixPuckEditorShell` component
 * the real route uses, fed a realistic V1 blocks fixture (one of the real
 * `PAGE_TEMPLATES`) converted through the same production
 * `migratePageBlocksToPuckData` the real route calls — so verifying the
 * Magnetix visual shell, drag/drop, inline editing, etc. here is a genuine
 * proof of the real component's behavior, not a separate reimplementation.
 *
 * No Firestore reads/writes, unlinked from any nav, matching this repo's
 * established docs/design-prototypes isolation convention.
 */

const NewBuilderEditor = dynamic(
  () =>
    import("@/components/pages-funnels/puck/editor-shell").then(
      (m) => m.MagnetixPuckEditorShell
    ),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-dvh items-center justify-center text-sm">
        Loading editor…
      </div>
    ),
  }
);

const fixtureBlocks = PAGE_TEMPLATES[0].blocks();
const fixtureData = migratePageBlocksToPuckData(fixtureBlocks);

// QA-only addition (Puck user-QA blockers task): the "Free Guide Landing
// Page" V1 template has no Form or Image block, so there was previously no
// way to click-select one in this harness to verify the new Form
// selector/Image upload field editors without also needing real drag-and-
// drop across the canvas iframe boundary (a separately-documented Playwright
// friction, unrelated to these field editors themselves — see master spec
// Known Bugs). Appending one empty Form + Image element gives every future
// session a stable, click-to-select fixture for both, no drag required.
fixtureData.content.push({
  type: "Section",
  props: {
    id: "qa-form-image-section",
    background: { source: "none", color: { mode: "solid", solid: "" } },
    style: {},
    maxWidth: "contained",
    fullWidthBackground: true,
    paddingTop: 48,
    paddingBottom: 48,
    rows: [
      {
        type: "Row",
        props: {
          id: "qa-form-image-row",
          background: { source: "none", color: { mode: "solid", solid: "" } },
          style: {},
          gap: 24,
          verticalAlign: "top",
          columns: [
            {
              type: "Column",
              props: {
                id: "qa-form-image-col",
                background: {
                  source: "none",
                  color: { mode: "solid", solid: "" },
                },
                style: {},
                width: "full",
                alignment: "left",
                elements: [
                  {
                    type: "Form",
                    props: {
                      id: "qa-test-form",
                      formId: "",
                      formName: "",
                      style: {},
                    },
                  },
                  {
                    type: "Image",
                    props: {
                      id: "qa-test-image",
                      src: "",
                      alt: "",
                      action: { type: "none" },
                      style: {},
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

export default function NewBuilderShellQaPage() {
  // QA-only: the real Magnetix theme class is normally applied by
  // <AppAccent/> (mounted in (dashboard) and, as of this task,
  // (builder)'s layout too — see that layout's doc comment) based on the
  // real signed-in agency's theme setting. This unauthenticated harness has
  // neither, so the class is forced on directly here purely so screenshots
  // and manual QA see the real palette instead of the CSS default
  // (near-grayscale) fallback that would otherwise apply. Never do this on
  // a real route — the real routes already get it correctly from
  // AppAccent; this effect exists only in this one QA-only file.
  useEffect(() => {
    document.documentElement.classList.add("theme-magnetix");
    return () => document.documentElement.classList.remove("theme-magnetix");
  }, []);

  return (
    <NewBuilderEditor
      pageId="qa-fixture-page"
      pageName="Free Guide Landing Page"
      pageStatus="draft"
      puckPublishStatus="v1-only"
      subAccountId="qa-fixture-subaccount"
      backHref="/docs/design-prototypes/pages-funnels-new-builder-shell"
      previewHref="/docs/design-prototypes/pages-funnels-new-builder-shell/preview"
      hasLivePage={false}
      liveUrl="https://example.com/p/qa-fixture-page"
      initialData={fixtureData}
    />
  );
}
