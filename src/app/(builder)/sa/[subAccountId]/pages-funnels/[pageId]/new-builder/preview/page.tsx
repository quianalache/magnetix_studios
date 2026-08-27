"use client";

import { use, useEffect, useState } from "react";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckFormIds } from "@/lib/pages-funnels/puck/resolve";
import { previewStorageKey } from "@/lib/pages-funnels/puck/preview-session";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import type { LeadForm } from "@/types/forms";

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
  const { saPath } = useSubAccount();

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; data: Data; metadata: PuckPageMetadata }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const raw = sessionStorage.getItem(previewStorageKey(pageId));
      if (!raw) {
        setState({ status: "missing" });
        return;
      }

      let data: Data;
      try {
        data = JSON.parse(raw) as Data;
      } catch {
        setState({ status: "missing" });
        return;
      }

      const formIds = collectPuckFormIds(data);
      const resolvedForms: Record<string, LeadForm | null> = {};
      await Promise.all(
        formIds.map(async (formId) => {
          try {
            const res = await fetch(
              `/api/pages-funnels/puck/resolve-form?formId=${encodeURIComponent(formId)}`
            );
            resolvedForms[formId] = res.ok
              ? ((await res.json()) as LeadForm | null)
              : null;
          } catch {
            resolvedForms[formId] = null;
          }
        })
      );

      if (cancelled) return;
      setState({
        status: "ready",
        data,
        metadata: { subAccountId, resolvedForms },
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
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="text-muted-foreground h-6 w-6" />
        <p className="text-foreground text-sm font-medium">
          No preview data found.
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Open Preview from inside the editor — this tab only shows whatever was
          on the canvas the moment you clicked it, and that hand-off is scoped
          to this browser session.
        </p>
        <a
          href={saPath(`/pages-funnels/${pageId}/new-builder`)}
          className="text-primary text-sm font-medium underline"
        >
          Go to the editor
        </a>
      </div>
    );
  }

  return (
    <Render
      config={serverPuckConfig}
      data={state.data}
      metadata={state.metadata}
    />
  );
}
