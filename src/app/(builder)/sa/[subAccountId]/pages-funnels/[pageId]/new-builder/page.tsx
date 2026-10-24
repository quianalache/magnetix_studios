"use client";

import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSubAccount } from "@/context/sub-account-context";
import { getPagesOnce, subscribeToPage } from "@/lib/firestore/pages-funnels";
import {
  classifyPageLoadError,
  PageLoadStateView,
  type PageLoadState,
} from "@/components/pages-funnels/page-load-state";
import { migratePageBlocksToPuckData } from "@/lib/pages-funnels/puck/migrate-v1";
import { derivePuckPublishStatus } from "@/lib/pages-funnels/puck/publish-status";
import { buildPublishedPageUrl } from "@/lib/domains/public-url";
import { PAGE_TYPE_LABELS, type PageDoc } from "@/types/pages-funnels";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS } from "@/types/reading-blocks";

/**
 * Phase 2A — the first REAL, CRM-integrated Puck editor route (master spec
 * §6/§13, Phase 2A task §4). Lives under the same sidebar-less `(builder)`
 * route group the V1 editor already uses (see that group's layout.tsx doc
 * comment) — normal `SubAccountProvider`/`BillingGuard` access control,
 * real `subAccountId`/`pageId`, "Back to Pages & Funnels" as the only way
 * out, matching the already-approved builder-takeover pattern exactly.
 *
 * `/new-builder` is the canonical (and only) editor route. The sibling
 * legacy URL (`.../pages-funnels/[pageId]`) is kept only as a redirect here
 * so old bookmarks keep working, without a second editor or write path.
 *
 * DATA MODEL (originally Phase 2A task §6 "safe-testing, nothing written
 * back"; superseded by the Puck Persistence + Publish Foundation task,
 * master spec §24.12): reads the real `PageDoc` and loads initial Puck
 * `Data` with the load priority that task requires —
 *
 *   1. `page.puckDraftData`, if a durable Puck draft already exists
 *      (a page someone has already saved from the new builder before), or
 *   2. `migratePageBlocksToPuckData(page.blocks)` — the Phase 1 in-memory
 *      V1→Puck converter — if no Puck draft exists yet, or
 *   3. an empty Puck `Data` shape, for the (rare) case of neither existing.
 *
 * Once a page has a persisted Puck draft, reopening this route uses THAT
 * — it never re-runs V1 migration again and silently discards prior Puck
 * edits. `blocks` (legacy) is still read here only for the in-memory
 * migration fallback and is NEVER written by this route or anything
 * downstream of it. `MagnetixPuckEditorShell` is what
 * actually performs Save Draft/autosave/Publish now (via
 * `use-puck-persistence.ts`), each writing ONLY the new `puckDraftData`/
 * `puckPublishedData` fields via a dedicated Admin-SDK API route — this
 * component itself still never writes to Firestore directly.
 */
export default function NewBuilderPage({
  params,
}: {
  params: Promise<{ subAccountId: string; pageId: string }>;
}) {
  const { subAccountId, pageId } = use(params);
  const { saPath, subAccount } = useSubAccount();

  const [page, setPage] = useState<PageDoc | null>(null);
  const [loadState, setLoadState] = useState<PageLoadState>("loading");

  useEffect(() => {
    const unsub = subscribeToPage(
      pageId,
      (p) => {
        setPage(p);
        setLoadState(p ? "ready" : "not-found");
      },
      async (error) => {
        setPage(null);
        const state = classifyPageLoadError(error);
        if (state !== "access-denied" || !subAccount?.agencyId) {
          setLoadState(state);
          return;
        }
        // The pages rule can report a MISSING document as permission-denied.
        // A tenant-scoped list read (allowed for anyone who may use this
        // sub-account) tells a mistyped/removed id apart from a real page
        // this person can't open.
        try {
          const pages = await getPagesOnce({ agencyId: subAccount.agencyId, subAccountId });
          setLoadState(pages.some((candidate) => candidate.id === pageId) ? "access-denied" : "not-found");
        } catch {
          setLoadState("access-denied");
        }
      }
    );
    return () => unsub();
  }, [pageId, subAccount?.agencyId, subAccountId]);

  // Load priority (master spec §24.12): a real persisted Puck draft always
  // wins over re-migrating V1 `blocks` — otherwise every reopen of this
  // route would silently discard whatever was saved from the new builder
  // last time and replace it with a fresh migration. Recomputed only when
  // the `page` reference itself changes (a fresh Firestore snapshot); once
  // mounted, the editor's own in-memory `data` state (inside the shell) is
  // the source of truth until the next explicit Save/autosave, exactly
  // like V1's own `blocks` state already works.
  const initialData = useMemo(() => {
    if (!page) return null;
    if (page.puckDraftData) return page.puckDraftData;
    return migratePageBlocksToPuckData(page.blocks);
  }, [page]);

  const puckPublishStatus = useMemo(
    () => (page ? derivePuckPublishStatus(page) : "v1-only"),
    [page]
  );

  // Live-link discoverability fix (real user QA blocker): "genuinely
  // published" means EITHER V1 has ever published this page
  // (`page.status === "published"`) OR the new builder has
  // (`page.puckPublishedData` set) — matches the exact same gate the
  // Pages & Funnels dashboard's PageCard now uses, so the two surfaces can
  // never disagree about whether a live link exists. `page` is a live
  // Firestore subscription, so this recomputes automatically the moment a
  // real Publish click writes `puckPublishedData`/`status` — no extra
  // plumbing needed for "View Live Page appears right after Publish."
  const hasLivePage =
    !!page && (page.status === "published" || !!page.puckPublishedData);
  const liveUrl = useMemo(
    () => buildPublishedPageUrl({ subAccount, pageId }),
    [subAccount, pageId]
  );

  if (loadState !== "ready" || !page || !initialData) {
    return <PageLoadStateView state={loadState === "ready" ? "not-found" : loadState} backHref={saPath("/pages-funnels")} />;
  }

  return (
    <NewBuilderEditor
      pageId={page.id}
      pageName={page.name}
      pageStatus={page.status}
      pageTypeLabel={PAGE_TYPE_LABELS[page.pageType] ?? undefined}
      puckPublishStatus={puckPublishStatus}
      subAccountId={subAccountId}
      backHref={saPath("/pages-funnels")}
      previewHref={saPath(`/pages-funnels/${page.id}/new-builder/preview`)}
      hasLivePage={hasLivePage}
      liveUrl={liveUrl}
      initialData={initialData}
      readingResult={
        page.pageType === "reading_result"
          ? { ...DEFAULT_READING_RESULT_PAGE_SETTINGS, ...(page.readingResult ?? {}) }
          : null
      }
    />
  );
}

// <Puck> cannot be server-rendered even for the initial shell (master spec
// §3 — confirmed hard constraint). The data-loading logic above this point
// runs fine as a normal client component; only the actual editor shell
// (which mounts <Puck>) needs the ssr:false boundary.
const NewBuilderEditor = dynamic(
  () =>
    import("@/components/pages-funnels/puck/editor-shell").then(
      (m) => m.MagnetixPuckEditorShell
    ),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-dvh items-center justify-center text-sm">
        Loading editor…
      </div>
    ),
  }
);
