"use client";

import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToPage } from "@/lib/firestore/pages-funnels";
import { migratePageBlocksToPuckData } from "@/lib/pages-funnels/puck/migrate-v1";
import { derivePuckPublishStatus } from "@/lib/pages-funnels/puck/publish-status";
import type { PageDoc } from "@/types/pages-funnels";

/**
 * Phase 2A — the first REAL, CRM-integrated Puck editor route (master spec
 * §6/§13, Phase 2A task §4). Lives under the same sidebar-less `(builder)`
 * route group the V1 editor already uses (see that group's layout.tsx doc
 * comment) — normal `SubAccountProvider`/`BillingGuard` access control,
 * real `subAccountId`/`pageId`, "Back to Pages & Funnels" as the only way
 * out, matching the already-approved builder-takeover pattern exactly.
 *
 * `/new-builder` is deliberately a SIBLING of the real V1 editor route
 * (`.../pages-funnels/[pageId]`), not a replacement — the V1 route, its
 * Canvas/BlocksPanel/SettingsPanel, and its Firestore persistence are
 * completely untouched by this file. This route is reachable from the real
 * Pages & Funnels list via a "Try New Builder" entry point (added to that
 * list's PageCard dropdown), not just a hidden docs URL.
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
 * edits. `blocks` (V1) is still read here (for the migration fallback) but
 * NEVER written by this route or by anything downstream of it — V1's own
 * persistence stays completely untouched. `MagnetixPuckEditorShell` is what
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
  const { saPath } = useSubAccount();

  const [page, setPage] = useState<PageDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = subscribeToPage(pageId, (p) => {
      setPage(p);
      setLoaded(true);
    });
    return () => unsub();
  }, [pageId]);

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

  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!page || !initialData) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <p className="text-muted-foreground text-sm">Page not found.</p>
        <a
          href={saPath("/pages-funnels")}
          className="text-primary text-sm font-medium underline"
        >
          Back to Pages &amp; Funnels
        </a>
      </div>
    );
  }

  return (
    <NewBuilderEditor
      pageId={page.id}
      pageName={page.name}
      pageStatus={page.status}
      puckPublishStatus={puckPublishStatus}
      subAccountId={subAccountId}
      backHref={saPath("/pages-funnels")}
      previewHref={saPath(`/pages-funnels/${page.id}/new-builder/preview`)}
      initialData={initialData}
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
