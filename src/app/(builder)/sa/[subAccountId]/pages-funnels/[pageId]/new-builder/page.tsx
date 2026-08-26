"use client";

import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToPage } from "@/lib/firestore/pages-funnels";
import { migratePageBlocksToPuckData } from "@/lib/pages-funnels/puck/migrate-v1";
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
 * SAFE-TESTING DATA MODEL (Phase 2A task §6): reads the real `PageDoc`,
 * converts its `blocks` (V1) to Puck `Data` in memory via the Phase 1
 * `migratePageBlocksToPuckData` foundation, and hands that to the editor
 * shell. Nothing is written back — `<Puck>`'s `onChange` only updates
 * React state inside `MagnetixPuckEditorShell`. No new Firestore field, no
 * `blocks` overwrite, no page mutation of any kind from this route.
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

  // Recomputed only when the `page` reference itself changes (a fresh
  // Firestore snapshot) — pure, cheap, never persisted (see migrate-v1.ts's
  // own doc comment). The editor's own in-memory `data` state (inside the
  // shell) is the source of truth once mounted, exactly like V1's `blocks`
  // state already works (loaded once, then edited locally until an
  // explicit Save) — this memo isn't what makes editing session-local, it
  // just avoids re-running the converter on every render for no reason.
  const initialData = useMemo(
    () => (page ? migratePageBlocksToPuckData(page.blocks) : null),
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
      subAccountId={subAccountId}
      backHref={saPath("/pages-funnels")}
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
