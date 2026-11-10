"use client";

import { use, useEffect, useState } from "react";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getTenantBrandColors } from "@/lib/brand/brand-colors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/system/empty-state";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckFeaturedOfferIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { previewStorageKey } from "@/lib/pages-funnels/puck/preview-session";
import { collectActionTargets } from "@/lib/pages-funnels/puck/action";
import { collectBookingSlugs } from "@/lib/pages-funnels/booking-block";
import { collectCheckoutKeys } from "@/lib/pages-funnels/checkout-block";
import type { ResolvedActionTargets } from "@/types/pages-funnels-puck";
import { getPage } from "@/lib/firestore/pages-funnels";
import { resolvePageSettings } from "@/lib/pages-funnels/page-settings";
import { collectMediaVideoIds } from "@/lib/pages-funnels/puck/media-video";
import { readReadingPreviewHandoff } from "@/lib/energetic-decoder/reading-preview-handoff";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS, type ReadingBlockContext } from "@/types/reading-blocks";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import type { FeaturedOfferPayload } from "@/types/reading-blocks";
import type { LeadForm } from "@/types/forms";
import { normalizePopupMap, type PopupDefinitionMap } from "@/types/pages-funnels-popup";
import { PopupHost } from "@/components/pages-funnels/puck/popup-runtime";
import { withPopupContent } from "@/lib/pages-funnels/popup-content";
import { readStoredPuckData } from "@/lib/pages-funnels/puck-storage";

/**
 * Pages & Funnels new-builder Preview route (Phase 2D task §10–§14) — a
 * genuine full page, not a dialog: opened in its own browser tab by
 * `editor-shell.tsx`'s Preview button, rendering ONLY the page content —
 * no editor chrome, no Blocks/Layers/Settings panels, no close button of
 * any kind (there is nothing modal here to close; the user just closes the
 * browser tab like they would for any real page). This is the exact
 * production `<Render>`/`serverPuckConfig`/renderer pipeline a real
 * published page will eventually use (task §13: "no duplicate page
 * renderer") — not a second, parallel preview-only implementation.
 *
 * DATA SOURCE (task §11): Puck Data isn't persisted anywhere yet, so this
 * route can't load the page from Firestore — it reads the CURRENT
 * in-memory editor `Data` the opener tab wrote to `sessionStorage` right
 * before calling `window.open()` (see preview-session.ts for the full
 * mechanism/spec citation). If that key is missing — a stale/bookmarked
 * preview tab reopened later, sessionStorage cleared, or the route hit
 * directly without ever visiting the editor first — this shows a clear,
 * honest empty state rather than silently rendering nothing or crashing.
 *
 * FORM RESOLUTION (task §13's "same component renderers" requirement):
 * `serverPuckConfig`'s Form element (`FormElementServerRender`,
 * form-server.tsx) is a pure, non-fetching component — a real server route
 * (the future `/p/[pageId]`) pre-resolves every referenced `LeadForm` via
 * the Admin SDK before calling `<Render>` (see that route's own doc
 * comment). This route has no server request lifecycle to do that in — it
 * runs entirely client-side, off `sessionStorage` — so it pre-resolves the
 * exact same way `form-client.tsx` already does for the editor canvas: one
 * fetch per referenced formId against the existing
 * `/api/pages-funnels/puck/resolve-form` route, using `collectPuckFormIds`
 * (the same walk a real server route will use) to find every id first.
 * `<Render>` isn't called until every id is resolved, so
 * `FormElementServerRender` never sees its own "not resolved by the
 * server" placeholder for a form that's genuinely just still loading.
 *
 * RESPONSIVE BEHAVIOR (task §14): no artificial width wrapper of any kind —
 * this renders at 100% of the real browser tab's width, so resizing the
 * window (or opening on an actual mobile browser) drives responsiveness
 * exactly like a real published page would, not a second device-simulation
 * system layered on top of the one Puck's own ViewportControls already is
 * inside the editor.
 */
export default function NewBuilderPreviewPage({
  params,
}: {
  params: Promise<{ subAccountId: string; pageId: string }>;
}) {
  const { subAccountId, pageId } = use(params);
  const { saPath, subAccount } = useSubAccount();
  // Live workspace Brand colors for Charts in "Brand colors" mode — added at
  // render time so they're current even if the workspace loads after the page.
  const brandKey = JSON.stringify(getTenantBrandColors(subAccount).map((c) => c.hex));
  const brandKitKey = JSON.stringify(getTenantBrandColors(subAccount).map(({ id, hex, name }) => ({ id, hex, name })));

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; data: Data; popups: PopupDefinitionMap; metadata: PuckPageMetadata }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Reading Tool Preview → custom Result Page (2026-10-21): render the
      // page's saved DRAFT with the unsaved preview Reading the tool parked
      // in this browser. Otherwise: the editor's in-memory data, as before.
      const fromReadingToolPreview = new URLSearchParams(window.location.search).get("reading") === "preview";
      const page = await getPage(pageId).catch(() => null);
      let data: Data;
      let previewPopups: PopupDefinitionMap = {};
      if (fromReadingToolPreview) {
        const draft = readStoredPuckData(page?.puckDraftData);
        if (!draft) {
          setState({ status: "missing" });
          return;
        }
        data = draft;
      } else {
        const raw = sessionStorage.getItem(previewStorageKey(pageId));
        if (!raw) {
          setState({ status: "missing" });
          return;
        }
        try {
          const parsed = JSON.parse(raw) as Data | { data?: Data; popups?: PopupDefinitionMap };
          data = "data" in parsed && parsed.data ? parsed.data : parsed as Data;
          previewPopups = "data" in parsed ? normalizePopupMap(parsed.popups) : {};
        } catch {
          setState({ status: "missing" });
          return;
        }
      }

      // Preview shows the DRAFT Page Settings where meaningful: the tab
      // title. Tenant tracking never loads here (only the live page has it).
      if (!cancelled) {
        const settings = resolvePageSettings(data as never, page?.seo);
        document.title = `Preview · ${settings.seoTitle.trim() || page?.name || "Page"}`;
      }

      let readingContext: ReadingBlockContext | null | undefined;
      if (page?.pageType === "reading_result") {
        const offerIds = collectPuckFeaturedOfferIds(data);
        const handoff = fromReadingToolPreview ? readReadingPreviewHandoff(pageId) : null;
        if (handoff) {
          const offers: ReadingBlockContext["offers"] = {};
          await Promise.all(
            offerIds.map(async (id) => {
              const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/featured-offers?offerId=${encodeURIComponent(id)}`).catch(() => null);
              offers[id] = res?.ok ? (((await res.json()) as { offer: ReadingBlockContext["offers"][string] }).offer ?? null) : null;
            }),
          );
          readingContext = {
            subAccountId,
            reading: handoff.reading,
            designs: handoff.designs,
            accent: handoff.accent,
            mode: "preview",
            access: { pdfHref: null, reportHref: null, myMagnetix: { actionUrl: null, openUrl: "/my/readings", maskedEmail: null } },
            offers,
            sampleLabel: null,
          };
        } else {
          const settings = { ...DEFAULT_READING_RESULT_PAGE_SETTINGS, ...(page.readingResult ?? {}) };
          const qs = new URLSearchParams({ pageId, sample: settings.sample, chartDesignSetId: settings.chartDesignSetId ?? "", offers: offerIds.join(",") });
          const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/result-page-context?${qs}`).catch(() => null);
          readingContext = res?.ok ? (((await res.json()) as { context: ReadingBlockContext }).context ?? null) : null;
        }
      }

      // Forms and action targets inside Popups resolve like the page's own.
      const collectable = withPopupContent(data, previewPopups);
      const formIds = collectPuckFormIds(collectable);
      const resolvedForms: Record<string, LeadForm | null> = {};
      await Promise.all(
        formIds.map(async (formId) => {
          try {
            const res = await fetch(
              `/api/pages-funnels/puck/resolve-form?formId=${encodeURIComponent(formId)}&pageId=${encodeURIComponent(pageId)}`
            );
            resolvedForms[formId] = res.ok
              ? ((await res.json()) as LeadForm | null)
              : null;
          } catch {
            resolvedForms[formId] = null;
          }
        })
      );

      // Button/Image "Go to Page" / "Go to Offer" targets (scroll targets
      // come from this page's own Section ids).
      const targets = collectActionTargets(collectable);
      let resolvedActions: ResolvedActionTargets = { pages: {}, offers: {}, bookings: {}, sectionIds: targets.sectionIds };
      if (targets.pageIds.length || targets.offerIds.length || targets.bookingSlugs.length) {
        const qs = new URLSearchParams({ subAccountId, pages: targets.pageIds.join(","), offers: targets.offerIds.join(","), bookings: targets.bookingSlugs.join(",") });
        const res = await fetch(`/api/pages-funnels/puck/resolve-actions?${qs}`).catch(() => null);
        if (res?.ok) {
          const json = (await res.json()) as Pick<ResolvedActionTargets, "pages" | "offers" | "bookings">;
          resolvedActions = { ...resolvedActions, pages: json.pages ?? {}, offers: json.offers ?? {}, bookings: json.bookings ?? {} };
        }
      }

      const offerSummaryIds = collectPuckOfferSummaryIds(collectable);
      const resolvedOffers: NonNullable<PuckPageMetadata["resolvedOffers"]> = {};
      await Promise.all(offerSummaryIds.map(async (id) => {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/featured-offers?offerId=${encodeURIComponent(id)}`).catch(() => null);
        resolvedOffers[id] = res?.ok ? (((await res.json()) as { offer?: FeaturedOfferPayload | null }).offer ?? null) : null;
      }));

      // Booking blocks: this page's own workspace, via the page-anchored resolver.
      const bookingSlugs = collectBookingSlugs(data);
      let resolvedBookings: NonNullable<PuckPageMetadata["resolvedBookings"]> = {};
      if (bookingSlugs.length) {
        const res = await fetch(`/api/pages-funnels/puck/resolve-booking?pageId=${encodeURIComponent(pageId)}&slugs=${encodeURIComponent(bookingSlugs.join(","))}`).catch(() => null);
        resolvedBookings = res?.ok ? (((await res.json()) as { bookings?: typeof resolvedBookings }).bookings ?? {}) : {};
      }

      // Checkout blocks (Checkout Phase 3): editor-safe view, never payable.
      const checkoutKeys = collectCheckoutKeys(data);
      let resolvedCheckouts: NonNullable<PuckPageMetadata["resolvedCheckouts"]> = {};
      if (checkoutKeys.length) {
        const res = await fetch(`/api/pages-funnels/puck/resolve-checkout?pageId=${encodeURIComponent(pageId)}&keys=${encodeURIComponent(checkoutKeys.join(","))}`).catch(() => null);
        resolvedCheckouts = res?.ok ? (((await res.json()) as { resolved?: typeof resolvedCheckouts }).resolved ?? {}) : {};
      }

      // Media Library videos (Wave 3): playback URLs minted for this preview.
      const videoIds = collectMediaVideoIds(data, previewPopups);
      let resolvedVideos: NonNullable<PuckPageMetadata["resolvedVideos"]> = {};
      if (videoIds.length) {
        const res = await fetch(`/api/pages-funnels/puck/resolve-media?pageId=${encodeURIComponent(pageId)}&videos=${encodeURIComponent(videoIds.join(","))}`).catch(() => null);
        resolvedVideos = res?.ok ? (((await res.json()) as { videos?: typeof resolvedVideos }).videos ?? {}) : {};
      }

      if (cancelled) return;
      setState({
        status: "ready",
        data,
        popups: previewPopups,
        metadata: {
          subAccountId,
          resolvedForms,
          resolvedOffers,
          resolvedActions,
          resolvedBookings,
          resolvedCheckouts,
          resolvedVideos,
          pageId,
          ...(readingContext !== undefined
            ? {
                readingContext,
                ...(readingContext ? {} : { readingBuilder: { status: "unavailable" as const, message: "Couldn’t load a Reading for this preview." } }),
              }
            : {}),
        },
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pageId, subAccountId]);

  if (state.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="bg-background flex h-dvh items-center justify-center px-4">
        <EmptyState
          className="w-full max-w-md"
          icon={AlertTriangle}
          title="Nothing to preview yet"
          description="Open Preview from the editor — it shows the canvas as it was when you clicked Preview, in this browser."
          action={
            <Button variant="outline" render={<a href={saPath(`/pages-funnels/${pageId}/new-builder`)} />}>
              Go to the editor
            </Button>
          }
        />
      </div>
    );
  }

  const qaPopupId = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("popup");
  const metadata = {
    ...state.metadata,
    brandColors: JSON.parse(brandKey) as string[],
    brandKit: JSON.parse(brandKitKey) as NonNullable<PuckPageMetadata["brandKit"]>,
  };
  // Preview runs Open / Close Popup against this page's DRAFT Popups.
  return (
    <PopupHost popups={state.popups} initialPopupId={qaPopupId} metadata={metadata} automaticTriggers>
      <Render config={serverPuckConfig} data={state.data} metadata={metadata} />
    </PopupHost>
  );
}
