import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";
import { getPageSections } from "@/lib/pages-funnels/v2/migrate";
import { collectFormIds } from "@/lib/pages-funnels/v2/tree-utils";
import { SectionTreeView } from "@/components/pages-funnels/renderer-v2/tree-view";

export const dynamic = "force-dynamic";

/**
 * Isolated public-preview route for native Pages & Funnels pages — separate
 * from the agency root homepage and from GitPage's own published sites.
 * Only a page with `status === "published"` renders here; a draft 404s so a
 * guessed id can't leak unfinished content. Custom-domain publishing is
 * intentionally out of scope for this phase — this route is the safe stand-
 * in the spec asked for.
 *
 * Phase C: renders through the V2 tree (`getPageSections` — a page's real
 * `sections` if it ever has any, otherwise `page.blocks` migrated in memory
 * via the deterministic Phase B converter) instead of V1's flat
 * `PageRenderer`. Nothing is persisted here — `getPageSections` never
 * writes, and this route never touches `updatePageBlocks` or any other
 * write path. V1 editing/persistence (Canvas, SettingsPanel, Save Draft,
 * Publish) are entirely untouched by this change.
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
      resolvedForms[formId] = { id: formSnap.id, ...data, createdAt: null, updatedAt: null };
    }),
  );

  return <SectionTreeView sections={sections} resolvedForms={resolvedForms} />;
}
