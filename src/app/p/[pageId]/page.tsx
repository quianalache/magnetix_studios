import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { PopupRuntime } from "@/components/pages-funnels/puck/popup-runtime";
import { withPopupContent } from "@/lib/pages-funnels/popup-content";
import { resolveFormsForSubAccount } from "@/lib/server/page-form-resolver";
import { normalizePopupMap } from "@/types/pages-funnels-popup";
import { decodeStoredPuckData } from "@/lib/pages-funnels/puck-storage";
import { collectPuckEmbedIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { resolveReadingToolPayloads } from "@/lib/server/reading-tool-payload";
import type { Metadata } from "next";
import { publicTitle } from "@/lib/server/public-identity";
import { ReadingResultPageView } from "@/components/pages-funnels/reading-result-page-view";
import { resolvePageActionTargets } from "@/lib/server/page-action-targets";
import { getTenantBrandColorsServerSide } from "@/lib/server/brand-kit-service";
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
  const query = (await searchParams) ?? {};

  const db = getAdminDb();
  const snap = await db.collection("pages").doc(pageId).get();
  if (!snap.exists) notFound();
  const page = { id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) };

  // Reading Result Pages (2026-10-21) render a Reading — see the component.
  if (page.pageType === "reading_result") {
    return <ReadingResultPageView page={page} wantsDraft={query.draft === "1"} />;
  }

  if (page.status !== "published" || !page.puckPublishedData) notFound();
  // Stored content is decoded here (puck-storage.ts) — visitors only ever get the PUBLISHED tree.
  const decoded = decodeStoredPuckData(page.puckPublishedData);
  if (!decoded.ok) {
    console.error(`[p/${pageId}] published content is unreadable (${decoded.reason})`);
    notFound();
  }
  const publishedData = decoded.data;

  // Forms, actions, embeds and offers inside Popups resolve like the page's own.
  const publishedPopups = normalizePopupMap(page.puckPublishedPopups);
  const collectable = withPopupContent(publishedData, publishedPopups);
  // Only this page's own workspace's Forms render (a foreign id renders nothing).
  const resolvedForms = await resolveFormsForSubAccount(page.subAccountId, collectPuckFormIds(collectable));
  // Public Reading Tool blocks (2026-10-19): resolved here so visitors get
  // the live tool without a client fetch; only this page's own
  // sub-account's Embeds can resolve.
  const embedIds = collectPuckEmbedIds(collectable);
  const resolvedEmbeds =
    page.subAccountId && embedIds.length > 0
      ? await resolveReadingToolPayloads(page.subAccountId, embedIds)
      : {};
  // Button/Image "Go to Page" / "Go to Offer" / scroll targets — this page's
  // own sub-account only.
  const resolvedActions = await resolvePageActionTargets(page.subAccountId ?? "", collectable);
  // This page's own workspace Brand colors (live) for Charts in "Brand colors" mode.
  const tenantBrand = page.subAccountId ? await getTenantBrandColorsServerSide(page.subAccountId) : [];
  const brandColors = tenantBrand.map((c) => c.hex);
  const brandKit = tenantBrand.map(({ id, hex, name }) => ({ id, hex, name }));
  const resolvedOffers = page.subAccountId ? await resolveFeaturedOffers(page.subAccountId, collectPuckOfferSummaryIds(collectable)) : {};
  const qaPopupId = typeof query.qa_popup === "string" && page.name.startsWith("QA ·") ? query.qa_popup : null;
  return (
    <>
    <Render
      config={serverPuckConfig}
      data={publishedData}
      metadata={{ subAccountId: page.subAccountId ?? "", resolvedForms, resolvedEmbeds, resolvedOffers, resolvedActions, brandColors, brandKit, pageId: page.id, publishedPopups }}
    />
    <PopupRuntime popups={publishedPopups} initialPopupId={qaPopupId} metadata={{ subAccountId: page.subAccountId ?? "", resolvedForms, resolvedEmbeds, resolvedOffers, resolvedActions, brandColors, brandKit, pageId: page.id, publishedPopups }} />
    </>
  );
}
