import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";
import { getPageSections } from "@/lib/pages-funnels/v2/migrate";
import { collectFormIds } from "@/lib/pages-funnels/v2/tree-utils";
import { SectionTreeView } from "@/components/pages-funnels/renderer-v2/tree-view";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckFormIds } from "@/lib/pages-funnels/puck/resolve";

export const dynamic = "force-dynamic";

/**
 * Isolated public-preview route for native Pages & Funnels pages — separate
 * from the agency root homepage and from GitPage's own published sites.
 * Only a page with `status === "published"` renders here; a draft 404s so a
 * guessed id can't leak unfinished content. Custom-domain publishing is
 * intentionally out of scope for this phase — this route is the safe stand-
 * in the spec asked for.
 *
 * RENDERING PRIORITY (Puck Persistence + Publish Foundation task, master
 * spec §24.12/§24.13 "Public /p/[pageId] rendering"):
 *
 *   1. `page.puckPublishedData`, if a Puck publish has ever happened for
 *      this page — the exact same production `<Render config=
 *      {serverPuckConfig} .../>` pipeline the new builder's Preview route
 *      already uses, never routed through the editor itself.
 *   2. Otherwise, the pre-existing V2-tree path (`getPageSections` — a
 *      page's real `sections` if it ever has any, otherwise `page.blocks`
 *      migrated in memory via the deterministic Phase B converter) — V1's
 *      published pages keep rendering exactly as before, unchanged.
 *
 * Nothing is persisted here in either branch — this route never writes to
 * Firestore. `puckPublishedData` is a frozen snapshot written only by
 * `publishPuckPage` (`pages-funnels-puck-service.ts`) at Publish time, so a
 * draft edit saved after publishing does NOT change what renders here until
 * Publish is clicked again — see that service's own doc comment for why
 * that's a single atomic write, not two. V1 editing/persistence (Canvas,
 * SettingsPanel, Save Draft, Publish) remain entirely untouched by this.
 */
export default async function PublicPagePreview({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;

  const db = getAdminDb();
  const snap = await db.collection("pages").doc(pageId).get();
  if (!snap.exists) notFound();
  const page = { id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) };
  if (page.status !== "published") notFound();

  if (page.puckPublishedData) {
    const formIds = collectPuckFormIds(page.puckPublishedData);
    const resolvedForms: Record<string, LeadForm | null> = {};
    await Promise.all(
      formIds.map(async (formId) => {
        const formSnap = await db.collection("forms").doc(formId).get();
        if (!formSnap.exists) {
          resolvedForms[formId] = null;
          return;
        }
        const data = formSnap.data() as Omit<LeadForm, "id">;
        resolvedForms[formId] = {
          id: formSnap.id,
          ...data,
          createdAt: null,
          updatedAt: null,
        };
      })
    );
    return (
      <Render
        config={serverPuckConfig}
        data={page.puckPublishedData}
        metadata={{ subAccountId: page.subAccountId ?? "", resolvedForms }}
      />
    );
  }

  const sections = getPageSections(page);

  // Resolve any `form` elements' referenced LeadForms server-side via the
  // Admin SDK — same pattern the dedicated public form route (/f/[formId])
  // already uses, and deliberately NOT the client-side `getForm()` V1's
  // PageRenderer calls from a useEffect: that reads through the client SDK,
  // and /forms/{formId}'s security rule only allows active sub-account
  // members to read a form (no public-read exception) — safe from inside
  // the authenticated editor, but an anonymous visitor to this route would
  // get permission-denied and the form would never resolve. Resolving here
  // with the Admin SDK (which bypasses rules, same as the page fetch above)
  // is what actually makes public form rendering work, not a duplication of
  // V1's pattern for its own sake.
  const formIds = collectFormIds(sections);
  const resolvedForms: Record<string, LeadForm | null> = {};
  await Promise.all(
    formIds.map(async (formId) => {
      const formSnap = await db.collection("forms").doc(formId).get();
      if (!formSnap.exists) {
        resolvedForms[formId] = null;
        return;
      }
      const data = formSnap.data() as Omit<LeadForm, "id">;
      // Firestore Timestamps aren't serializable across the Server ->
      // Client Component boundary (PublicForm is "use client") -- nulled
      // out here exactly like /f/[formId]/page.tsx already does.
      resolvedForms[formId] = {
        id: formSnap.id,
        ...data,
        createdAt: null,
        updatedAt: null,
      };
    })
  );

  return <SectionTreeView sections={sections} resolvedForms={resolvedForms} />;
}
