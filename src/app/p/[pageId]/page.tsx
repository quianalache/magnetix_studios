import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { funnelOfferViewForPage } from "@/lib/server/checkout/funnel-runtime-service";
import { pageServableOnHost } from "@/lib/domains/custom-domain-service";
import { Render } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { PopupHost } from "@/components/pages-funnels/puck/popup-runtime";
import { withPopupContent } from "@/lib/pages-funnels/popup-content";
import { resolveFormsForSubAccount } from "@/lib/server/page-form-resolver";
import { resolveBookingsForSubAccount } from "@/lib/server/page-booking-resolver";
import { collectBookingSlugs } from "@/lib/pages-funnels/booking-block";
import { collectCheckoutKeys } from "@/lib/pages-funnels/checkout-block";
import { resolveCheckoutBlocks } from "@/lib/server/page-checkout-resolver";
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
import { publicPageMetadata, resolvePageSettings, safeTrackingIds } from "@/lib/pages-funnels/page-settings";
import { TenantPageTracking } from "@/components/pages-funnels/tenant-page-tracking";
import { resolveMediaVideosForPage } from "@/lib/server/page-media-resolver";
import { verifyThumbnailToken } from "@/lib/server/pages-funnels/thumbnail-token";
import { FunnelAnalyticsTracker } from "@/components/funnels/funnel-analytics-tracker";

export const dynamic = "force-dynamic";

/**
 * Public route for Pages & Funnels pages. The published New Builder (Puck)
 * snapshot is the only source of truth: a page renders here only when it is
 * published AND has `puckPublishedData`; drafts, and pages that were never
 * published from the New Builder, 404 so a guessed id can't leak anything.
 * The legacy (V1/V2 `blocks`) public renderer was retired on 2026-10-23 after
 * every published page had a New Builder snapshot. Reading Result Pages take
 * their own branch below. This route never writes to Firestore (the funnel
 * Accept / Decline runtime view is read-only here).
 */
/**
 * Public document head from the page's PUBLISHED Page Settings (Wave 3 —
 * settings go live on Publish): title, description, Open Graph / Twitter
 * card, and robots. A page without Wave 3 settings falls back to its legacy
 * flat `seo` field (see page-settings.ts). The description is always set
 * explicitly (null when empty) so a tenant page never inherits Magnetix's own
 * site description from the root layout. Works identically on custom
 * domains, which serve this same route.
 */
export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  try {
    const { pageId } = await params;
    const page = (await getAdminDb().collection("pages").doc(pageId).get()).data() as Pick<PageDoc, "status" | "name" | "pageType" | "seo" | "puckPublishedData" | "subAccountId"> | undefined;
    if (!page || page.status !== "published") return {};
    // A custom domain describes only its own workspace's Pages.
    if (!(await pageServableOnHost((await headers()).get("host"), page.subAccountId))) return {};
    const decoded = page.puckPublishedData ? decodeStoredPuckData(page.puckPublishedData) : null;
    const settings = resolvePageSettings(decoded?.ok ? decoded.data : null, page.seo);
    // A Reading Result Page shows one person's Reading — never indexed.
    const isReading = page.pageType === "reading_result";
    const meta = publicPageMetadata({ settings, pageName: page.name ?? "", forceNoindex: isReading });
    const title = publicTitle(meta.title);
    return {
      title,
      description: meta.description,
      openGraph: {
        type: "website",
        title,
        description: meta.description ?? undefined,
        ...(meta.image ? { images: [{ url: meta.image }] } : {}),
      },
      twitter: {
        card: meta.image ? "summary_large_image" : "summary",
        title,
        description: meta.description ?? undefined,
        ...(meta.image ? { images: [meta.image] } : {}),
      },
      ...(meta.noindex ? { robots: isReading ? { index: false, follow: false } : { index: false } } : {}),
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
  // Custom-domain ownership (pre-Funnel safety): a workspace's custom domain
  // serves only that workspace's Pages; anything else reads as not-found.
  if (!(await pageServableOnHost((await headers()).get("host"), page.subAccountId))) notFound();

  // Reading Result Pages (2026-10-21) render a Reading — see the component.
  if (page.pageType === "reading_result") {
    return <ReadingResultPageView page={page} wantsDraft={query.draft === "1"} />;
  }

  // Library thumbnail capture (2026-11): a valid, short-lived capture pass
  // (thumbnail-token.ts) for THIS page. It turns off tracking and automatic
  // popups, and a `draft` pass renders the saved draft. Without a valid pass
  // nothing below changes: visitors only ever get the published tree.
  const capture = verifyThumbnailToken(query.mx_thumb, pageId);
  const useDraft = capture === "draft";
  if (useDraft ? !page.puckDraftData : page.status !== "published" || !page.puckPublishedData) notFound();
  // Stored content is decoded here (puck-storage.ts).
  const decoded = decodeStoredPuckData(useDraft ? page.puckDraftData : page.puckPublishedData);
  if (!decoded.ok) {
    console.error(`[p/${pageId}] ${useDraft ? "draft" : "published"} content is unreadable (${decoded.reason})`);
    notFound();
  }
  const publishedData = decoded.data;

  // Forms, actions, embeds and offers inside Popups resolve like the page's own.
  const publishedPopups = normalizePopupMap(useDraft ? page.puckDraftPopups : page.puckPublishedPopups);
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
  // Booking blocks: published Booking Pages in this page's own workspace only.
  const resolvedBookings = await resolveBookingsForSubAccount(page.subAccountId, collectBookingSlugs(publishedData));
  // Checkout / Order Form blocks (Checkout Phase 3): this page's own workspace's
  // Funnel Checkout Steps only, the PUBLIC view (unpublished → not shown).
  const resolvedCheckouts = await resolveCheckoutBlocks({ id: page.id, subAccountId: page.subAccountId }, collectCheckoutKeys(publishedData), "published");
  const qaPopupId = typeof query.qa_popup === "string" && page.name.startsWith("QA ·") ? query.qa_popup : null;
  // Media Library videos (Wave 3): fresh short-lived playback per visit, own workspace only.
  const resolvedVideos = await resolveMediaVideosForPage(page, collectable);
  // Post-purchase funnel runtime: this visitor's Accept / Decline context, from
  // their funnel-session cookie only (never for thumbnail captures).
  const funnelOffer = capture || !page.subAccountId ? null : await funnelOfferViewForPage({ id: page.id, subAccountId: page.subAccountId }, (await cookies()).getAll()).catch((err) => {
    console.error(`[p/${pageId}] funnel runtime unavailable`, err);
    return null;
  });
  const metadata = { subAccountId: page.subAccountId ?? "", resolvedForms, resolvedEmbeds, resolvedOffers, resolvedActions, resolvedBookings, resolvedCheckouts, resolvedVideos, brandColors, brandKit, pageId: page.id, publishedPopups, funnelOffer };
  // The host holds ONLY this page's PUBLISHED Popups: an Open Popup action can
  // never reach a draft-only Popup or another page's Popup (Slice 5).
  // The tenant's own tracking, from the PUBLISHED settings only.
  const tracking = safeTrackingIds(resolvePageSettings(publishedData, page.seo).tracking);
  return (
    <PopupHost popups={publishedPopups} initialPopupId={capture ? null : qaPopupId} metadata={metadata} automaticTriggers={!capture}>
      <Render config={serverPuckConfig} data={publishedData} metadata={metadata} />
      {capture ? null : <>
        <FunnelAnalyticsTracker pageId={page.id} />
        <TenantPageTracking {...tracking} />
      </>}
    </PopupHost>
  );
}
