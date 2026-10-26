import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckEmbedIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { resolveReadingToolPayloads } from "@/lib/server/reading-tool-payload";
import type { Metadata } from "next";
import { publicTitle } from "@/lib/server/public-identity";
import { ReadingResultPageView } from "@/components/pages-funnels/reading-result-page-view";
import { resolvePageActionTargets } from "@/lib/server/page-action-targets";
import { resolveFeaturedOffers } from "@/lib/server/featured-offer-service";

export const dynamic = "force-dynamic";

/**
 * Public route for Pages & Funnels pages. The published New Builder (Puck)
 * snapshot is the only source of truth: a page renders here only when it is
 * published AND has `puckPublishedData`; drafts, and pages that were never
 * published from the New Builder, 404 so a guessed id can't leak anything.
 * The legacy (V1/V2 `blocks`) public renderer was retired on 2026-10-23 after
 * every published page had a New Builder snapshot. Reading Result Pages take
 * their own branch below. This route never writes to Firestore.
 */
/** Browser title: the published page's SEO title, else its name (2026-10-16 public surfaces). */
export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  try {
    const { pageId } = await params;
    const page = (await getAdminDb().collection("pages").doc(pageId).get()).data() as { status?: string; name?: string; pageType?: string; seo?: { title?: string } } | undefined;
    if (!page || page.status !== "published") return {};
    // A Reading Result Page shows one person's Reading — never indexed.
    return {
      title: publicTitle(page.seo?.title || page.name),
      ...(page.pageType === "reading_result" ? { robots: { index: false, follow: false } } : {}),
    };
  } catch {
    return {};
  }
}

export default async function PublicPagePreview({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { pageId } = await params;

  const db = getAdminDb();
  const snap = await db.collection("pages").doc(pageId).get();
  if (!snap.exists) notFound();
  const page = { id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) };

  // Reading Result Pages (2026-10-21) render a Reading — see the component.
  if (page.pageType === "reading_result") {
    const sp = (await searchParams) ?? {};
    return <ReadingResultPageView page={page} wantsDraft={sp.draft === "1"} />;
  }

  if (page.status !== "published" || !page.puckPublishedData) notFound();

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
  // Public Reading Tool blocks (2026-10-19): resolved here so visitors get
  // the live tool without a client fetch; only this page's own
  // sub-account's Embeds can resolve.
  const embedIds = collectPuckEmbedIds(page.puckPublishedData);
  const resolvedEmbeds =
    page.subAccountId && embedIds.length > 0
      ? await resolveReadingToolPayloads(page.subAccountId, embedIds)
      : {};
  // Button/Image "Go to Page" / "Go to Offer" / scroll targets — this page's
  // own sub-account only.
  const resolvedActions = await resolvePageActionTargets(page.subAccountId ?? "", page.puckPublishedData);
  const resolvedOffers = page.subAccountId ? await resolveFeaturedOffers(page.subAccountId, collectPuckOfferSummaryIds(page.puckPublishedData)) : {};
  return (
    <Render
      config={serverPuckConfig}
      data={page.puckPublishedData}
      metadata={{ subAccountId: page.subAccountId ?? "", resolvedForms, resolvedEmbeds, resolvedOffers, resolvedActions, pageId: page.id }}
    />
  );
}
