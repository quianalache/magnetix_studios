import { Render } from "@puckeditor/core";
import type { Data, ComponentData } from "@puckeditor/core";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { buildHeroSection } from "@/lib/pages-funnels/puck/presets/hero";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";
import { collectPuckFormIds } from "@/lib/pages-funnels/puck/resolve";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

export const dynamic = "force-dynamic";

/**
 * Server half of the production-fidelity harness (master spec §18/§10) —
 * proves `serverPuckConfig` type-checks and renders via `<Render>` in a
 * real Server Component, exercising the SAME production registry the
 * editor-client.tsx half uses, mirroring how `/p/[pageId]` will eventually
 * call `serverPuckConfig` for real published pages. No Firestore writes.
 *
 * Seeded with a Hero section (proving prebuilt-section output renders
 * server-side identically to how it renders in the editor) plus a Form
 * element with no `formId` set (proving the server Form variant's
 * "not configured" path — the honest, achievable proof in an isolated
 * harness with no real Firestore form to point at; a real page would have
 * `collectPuckFormIds` return actual ids to resolve here via the Admin SDK,
 * same pattern as `/p/[pageId]`'s `SectionTreeView` caller).
 */
export default function PagesFunnelsPuckFoundationRenderPage() {
  const data: Data = {
    content: [
      buildHeroSection(),
      {
        type: "Section",
        props: {
          id: newPuckNodeId(),
          background: "none",
          maxWidth: "contained",
          paddingTop: 48,
          paddingBottom: 48,
          rows: [
            {
              type: "Row",
              props: {
                id: newPuckNodeId(),
                gap: 24,
                verticalAlign: "top",
                columns: [
                  {
                    type: "Column",
                    props: {
                      id: newPuckNodeId(),
                      width: "full",
                      alignment: "left",
                      elements: [
                        {
                          type: "Form",
                          props: {
                            id: newPuckNodeId(),
                            formId: "",
                            formName: "",
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
      } as ComponentData,
    ],
    root: { props: {} },
  };

  // Real usage: resolve every id `collectPuckFormIds` finds via the Admin
  // SDK (same as /p/[pageId]'s SectionTreeView caller) before rendering.
  // This harness's seed data has no real formId, so the map stays empty —
  // still exercises the exact call shape a real route will use.
  const formIds = collectPuckFormIds(data);
  const resolvedForms: PuckPageMetadata["resolvedForms"] = {};
  for (const id of formIds) resolvedForms[id] = null;

  const metadata: PuckPageMetadata = {
    subAccountId: "puck-foundation-harness",
    resolvedForms,
  };

  return <Render config={serverPuckConfig} data={data} metadata={metadata} />;
}
