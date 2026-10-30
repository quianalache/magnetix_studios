import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core";
import { Sparkles } from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckEmbedIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { resolveReadingToolPayloads } from "@/lib/server/reading-tool-payload";
import { resolvePageActionTargets } from "@/lib/server/page-action-targets";
import { getTenantBrandColorsServerSide } from "@/lib/server/brand-kit-service";
import { resolveFeaturedOffers } from "@/lib/server/featured-offer-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getStaffForSubAccount } from "@/lib/auth/current-staff";
import { passGrants, resultPagePassCookieName, verifyReadingResultPass } from "@/lib/server/reading-result-pass";
import { buildReadingBlockContext, collectFeaturedOfferIds } from "@/lib/server/reading-block-context";
import { buildSampleReading } from "@/lib/server/reading-samples";
import { platformOrigin } from "@/lib/domains/public-url";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";
import type { PageDoc } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * A Reading Result Page on its public URL (2026-10-21).
 *
 * WHO sees WHICH Reading: only a browser holding this page's result cookie
 * — minted from the 24-hour pass the Reading Tool issued for exactly this
 * Reading, business and page (see /api/decoder/[saId]/result). There is no
 * Reading id in the URL to change. Without a valid pass the visitor gets
 * "Open your Reading in MyMagnetix", never someone else's Reading.
 *
 * Staff of this business may view the page without a pass (a sample chart,
 * clearly labelled) and may open the DRAFT with `?draft=1` — used by
 * Run Test so a page can be rehearsed before it's published.
 */
export async function ReadingResultPageView({ page, wantsDraft }: { page: PageDoc; wantsDraft: boolean }) {
  const subAccountId = page.subAccountId;
  if (!subAccountId) notFound();
  const staff = await getStaffForSubAccount(subAccountId);
  const useDraft = wantsDraft && !!staff && !!page.puckDraftData;
  const data = useDraft ? page.puckDraftData : page.puckPublishedData;
  // A visitor only ever reaches a published page.
  if (!data || (!useDraft && page.status !== "published")) notFound();

  const store = await cookies();
  const pass = verifyReadingResultPass(store.get(resultPagePassCookieName(page.id))?.value);
  const granted = passGrants(pass, { subAccountId, pageId: page.id }) ? pass : null;

  let readingContext: ReadingBlockContext | null = null;
  let staffSample = false;
  const offerIds = collectFeaturedOfferIds(data);
  if (granted) {
    const reading = await getReadingById(subAccountId, granted.readingId);
    if (reading) {
      readingContext = await buildReadingBlockContext({
        subAccountId,
        reading,
        mode: granted.test ? "test" : "live",
        pageSettings: page.readingResult ?? null,
        offerIds,
      });
    }
  } else if (staff) {
    const sample = page.readingResult?.sample ?? "projector";
    const reading = (await buildSampleReading(subAccountId, sample)) ?? (await buildSampleReading(subAccountId, "projector"));
    if (reading) {
      staffSample = true;
      readingContext = await buildReadingBlockContext({
        subAccountId,
        reading,
        mode: "sample",
        pageSettings: page.readingResult ?? null,
        offerIds,
        sample,
      });
    }
  }

  if (!readingContext) {
    const businessName = ((await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).get("name") as string | undefined) || "";
    return <ResultPassExpired businessName={businessName} />;
  }

  const db = getAdminDb();
  const formIds = collectPuckFormIds(data);
  const resolvedForms: Record<string, LeadForm | null> = {};
  await Promise.all(
    formIds.map(async (formId) => {
      const formSnap = await db.collection("forms").doc(formId).get();
      resolvedForms[formId] = formSnap.exists ? { id: formSnap.id, ...(formSnap.data() as Omit<LeadForm, "id">), createdAt: null, updatedAt: null } : null;
    }),
  );
  const embedIds = collectPuckEmbedIds(data);
  const resolvedEmbeds = embedIds.length > 0 ? await resolveReadingToolPayloads(subAccountId, embedIds) : {};
  const resolvedActions = await resolvePageActionTargets(subAccountId, data);
  const tenantBrand = await getTenantBrandColorsServerSide(subAccountId);
  const brandColors = tenantBrand.map((c) => c.hex);
  const brandKit = tenantBrand.map(({ id, hex, name }) => ({ id, hex, name }));
  const resolvedOffers = await resolveFeaturedOffers(subAccountId, collectPuckOfferSummaryIds(data));

  return (
    <>
      {(staffSample || useDraft || readingContext.mode === "test") && (
        <div role="status" className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          {staffSample
            ? `Staff view — showing ${readingContext.sampleLabel ?? "a sample Reading"}. Visitors see their own Reading here, right after they submit.`
            : readingContext.mode === "test"
              ? `Test run${useDraft ? " on the draft" : ""} — your hidden Test Reading. Visitors see their own.`
              : "Draft preview."}
        </div>
      )}
      <Render
        config={serverPuckConfig}
        data={data}
        metadata={{ subAccountId, resolvedForms, resolvedEmbeds, resolvedOffers, resolvedActions, brandColors, brandKit, pageId: page.id, readingContext }}
      />
    </>
  );
}

/** No valid result pass on this browser — the permanent home is MyMagnetix. */
function ResultPassExpired({ businessName }: { businessName: string }) {
  return (
    <PublicStateShell
      variant={{ kind: "tenant", brand: { name: businessName } }}
      icon={Sparkles}
      tone="brand"
      title="Find your Reading in MyMagnetix"
      description="This page shows a Reading right after it’s created, on the device where it was made. Your Reading is saved in MyMagnetix — sign in with the email you used."
      action={
        <PublicAction href={`${platformOrigin()}/my/readings`}>
          <Sparkles className="h-4 w-4" />
          Open MyMagnetix
        </PublicAction>
      }
    >
      <span data-result-pass-expired hidden />
    </PublicStateShell>
  );
}
