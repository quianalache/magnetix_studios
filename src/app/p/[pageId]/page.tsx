import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import { PageRenderer } from "@/components/pages-funnels/renderer/page-renderer";

export const dynamic = "force-dynamic";

/**
 * Isolated public-preview route for native Pages & Funnels pages — separate
 * from the agency root homepage and from GitPage's own published sites.
 * Only a page with `status === "published"` renders here; a draft 404s so a
 * guessed id can't leak unfinished content. Custom-domain publishing is
 * intentionally out of scope for this phase — this route is the safe stand-
 * in the spec asked for.
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

  return <PageRenderer blocks={page.blocks} />;
}
