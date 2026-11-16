import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core";
import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStaffForSubAccount } from "@/lib/auth/current-staff";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { PopupHost } from "@/components/pages-funnels/puck/popup-runtime";
import { withPopupContent } from "@/lib/pages-funnels/popup-content";
import { resolveFormsForSubAccount } from "@/lib/server/page-form-resolver";
import { resolveBookingsForSubAccount } from "@/lib/server/page-booking-resolver";
import { collectBookingSlugs } from "@/lib/pages-funnels/booking-block";
import { collectCheckoutKeys } from "@/lib/pages-funnels/checkout-block";
import { resolveCheckoutBlocks } from "@/lib/server/page-checkout-resolver";
import { collectPuckEmbedIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { resolveReadingToolPayloads } from "@/lib/server/reading-tool-payload";
import { resolvePageActionTargets } from "@/lib/server/page-action-targets";
import { getTenantBrandColorsServerSide } from "@/lib/server/brand-kit-service";
import { resolveFeaturedOffers } from "@/lib/server/featured-offer-service";
import { resolveMediaVideosForPage } from "@/lib/server/page-media-resolver";
import { buildReadingBlockContext, collectFeaturedOfferIds } from "@/lib/server/reading-block-context";
import { buildSampleReading } from "@/lib/server/reading-samples";
import { verifyTemplateThumbnailToken } from "@/lib/server/pages-funnels/thumbnail-token";
import { decodeTemplateDesign } from "@/lib/pages-funnels/page-templates";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS, type ReadingBlockContext, type ReadingResultPageSettings } from "@/types/reading-blocks";
import type { PageTemplateDoc } from "@/types/page-templates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Template preview", robots: { index: false, follow: false } };

/**
 * Saved Page Template preview (2026-11-16) — the template's OWN saved design,
 * rendered read-only through the same production `<Render>` pipeline and
 * resolvers as a published page (never the source page, which may have
 * changed or been deleted since).
 *
 * Who can open it: a signed-in member of the template's workspace (the
 * library's Preview), or the 3-minute capture pass that screenshots the
 * template's preview image (`mx_thumb`). Anyone else gets a 404.
 *
 * Read-only: the content is `inert` (nothing can be clicked, typed or
 * submitted), Checkout blocks use the editor-safe never-payable view,
 * automatic Popups never open, and no tracking or analytics loads. A Reading
 * Result template shows a fictional sample Reading — never a real person's.
 */
export default async function PageTemplatePreview({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = (await searchParams) ?? {};
  const templateId = typeof query.t === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(query.t) ? query.t : null;
  if (!templateId) notFound();
  const snap = await getAdminDb().collection("pageTemplates").doc(templateId).get();
  const template = snap.data() as PageTemplateDoc | undefined;
  if (!template?.subAccountId) notFound();
  const capture = verifyTemplateThumbnailToken(query.mx_thumb, templateId);
  if (!capture && !(await getStaffForSubAccount(template.subAccountId))) notFound();

  const design = decodeTemplateDesign(template);
  if (!design) notFound();
  const { data, popups } = design;
  const subAccountId = template.subAccountId;
  const anchor = { id: `template_${templateId}`, subAccountId, agencyId: template.agencyId };
  const collectable = withPopupContent(data, popups);

  let readingContext: ReadingBlockContext | null | undefined;
  if (template.pageType === "reading_result") {
    const settings = { ...DEFAULT_READING_RESULT_PAGE_SETTINGS, ...((template.readingResult ?? {}) as Partial<ReadingResultPageSettings>) };
    const reading = (await buildSampleReading(subAccountId, settings.sample)) ?? (await buildSampleReading(subAccountId, "projector"));
    readingContext = reading
      ? await buildReadingBlockContext({ subAccountId, reading, mode: "sample", pageSettings: settings, offerIds: collectFeaturedOfferIds(data), sample: settings.sample })
      : null;
  }

  const [resolvedForms, resolvedEmbeds, resolvedActions, tenantBrand, resolvedOffers, resolvedBookings, resolvedCheckouts, resolvedVideos] = await Promise.all([
    resolveFormsForSubAccount(subAccountId, collectPuckFormIds(collectable)),
    (async () => {
      const ids = collectPuckEmbedIds(collectable);
      return ids.length ? resolveReadingToolPayloads(subAccountId, ids) : {};
    })(),
    resolvePageActionTargets(subAccountId, collectable),
    getTenantBrandColorsServerSide(subAccountId),
    resolveFeaturedOffers(subAccountId, collectPuckOfferSummaryIds(collectable)),
    resolveBookingsForSubAccount(subAccountId, collectBookingSlugs(data)),
    // Never payable: the editor-safe view of whatever Checkout Step each block names.
    resolveCheckoutBlocks(anchor, collectCheckoutKeys(data), "editor"),
    resolveMediaVideosForPage(anchor, collectable),
  ]);
  const metadata = {
    subAccountId,
    resolvedForms,
    resolvedEmbeds,
    resolvedOffers,
    resolvedActions,
    resolvedBookings,
    resolvedCheckouts,
    resolvedVideos,
    brandColors: tenantBrand.map((c) => c.hex),
    brandKit: tenantBrand.map(({ id, hex, name }) => ({ id, hex, name })),
    pageId: anchor.id,
    publishedPopups: popups,
    ...(readingContext !== undefined ? { readingContext } : {}),
  };

  return (
    <>
      {capture ? null : (
        <div role="status" className="sticky top-0 z-50 border-b border-violet-200 bg-violet-50 px-4 py-2 text-center text-xs text-violet-950" data-template-preview-banner="">
          Template preview: <strong>{template.name}</strong>. Read-only, so nothing here can be clicked or submitted.
          {template.pageType === "reading_result" ? " Reading blocks show a sample Reading." : ""}
        </div>
      )}
      <div inert data-template-preview="">
        <PopupHost popups={popups} initialPopupId={null} metadata={metadata} automaticTriggers={false}>
          <Render config={serverPuckConfig} data={data} metadata={metadata} />
        </PopupHost>
      </div>
    </>
  );
}
