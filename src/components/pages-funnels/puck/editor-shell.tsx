"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, Eye, Loader2 } from "lucide-react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./magnetix-theme.css";
import type { Data } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { VIEWPORTS, IFRAME_CONFIG } from "@/lib/pages-funnels/puck/constants";
import { MagnetixBlocksPanel } from "@/components/pages-funnels/puck/blocks-panel";
import { MagnetixLayersPanel } from "@/components/pages-funnels/puck/layers-panel";
import { MagnetixSettingsPanel } from "@/components/pages-funnels/puck/settings-panel";
import { previewStorageKey } from "@/lib/pages-funnels/puck/preview-session";
import { usePuckPersistence } from "@/components/pages-funnels/puck/use-puck-persistence";
import type { PuckPublishStatus } from "@/lib/pages-funnels/puck/publish-status";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

/**
 * The REAL, CRM-integrated, Magnetix-styled Puck editor shell (master spec
 * §6/§13). Reusable so the actual new-builder route stays a thin
 * data-loading wrapper around this.
 *
 * Phase 2A shipped a CSS-only reskin (colors/radius/spacing via
 * `--puck-*` tokens) plus a custom header, but kept Puck's own stock
 * drawer/Outline/Fields panels — real user QA confirmed that still read
 * as "Puck UI with Magnetix colors," not the approved Magnetix builder UX.
 * Phase 2B went further: the left library, Layers, and Settings panels are
 * genuinely custom Magnetix components (blocks-panel.tsx, layers-panel.tsx,
 * settings-panel.tsx), wired in via
 * `overrides.drawer`/`overrides.outline`/`overrides.fields`. Each wrapper
 * renders Puck's OWN real content/mechanics unmodified (the drawer is
 * built on the public `Drawer`/`Drawer.Item` components — real drag
 * source, not click-to-append; Outline/Fields `children` are Puck's
 * actual tree/field-input rendering) — only the surrounding visual chrome
 * is custom. `./magnetix-theme.css` still retargets Puck's own shipped
 * `--puck-*` design tokens (a real, documented theming surface — 318
 * custom properties, confirmed present in the installed 0.23.0 package)
 * for everything these three overrides don't reach (canvas background,
 * selection/drag indicators, native ViewportControls).
 *
 * `overrides.header` wraps Puck's own default header `children` (which
 * still contains, unmodified: the sidebar toggles, the native title —
 * driven by the `headerTitle` prop below, so it already reads as the real
 * page name with zero extra work — and Puck's own `MenuBar`, which is
 * where native Undo/Redo actually live) with a prepended "Back to Pages &
 * Funnels" link and a status badge. `overrides.headerActions` replaces
 * Puck's default (a single hardcoded "Publish" button wired to an
 * `onPublish` prop this shell deliberately never sets) with four explicit
 * controls: a Saving…/Saved/error indicator, Preview, Save Draft, and
 * Publish — all real as of the Puck Persistence + Publish Foundation task
 * (master spec §24.12; `use-puck-persistence.ts` is what actually performs
 * every write, this component only wires it to the header UI).
 * `renderHeaderActions` (used in Phase 1) is deprecated as of the installed
 * 0.23.0 (confirmed via the package's own runtime deprecation warning) in
 * favor of exactly this `overrides.headerActions` + native render-prop
 * pattern — this shell uses
 * the current, non-deprecated API.
 *
 * PHASE 2D PREVIEW REWRITE (task §10/§11/§12/§13/§14): real user QA
 * rejected Phase 2C's full-screen Dialog Preview — it read as a modal, not
 * "viewing the actual page," and its close button duplicated visually.
 * Preview now opens the SAME in-memory, unsaved `data` in a genuine NEW
 * BROWSER TAB at `previewHref` — a dedicated route
 * (`.../new-builder/preview`) that renders ONLY page content via the exact
 * same production `<Render config={serverPuckConfig} .../>` real published
 * pages will eventually use, zero editor chrome, real browser-tab width
 * driving responsiveness. `<Puck>` itself never unmounts when Preview
 * opens (it's a separate tab, not a dialog swapped in over this one), so
 * its own undo/redo history is never at risk either way. The unsaved
 * hand-off itself is `sessionStorage`-based (see preview-session.ts's own
 * doc comment for the full mechanism and why it's the right, clean,
 * session-scoped tool for this) — no Dialog, no close button, no duplicate
 * anything, because there is no modal at all anymore.
 *
 * The Desktop/Tablet/Mobile switcher and its zoom controls are Puck's own
 * `ViewportControls`, a second native toolbar row beneath the header with
 * no dedicated override slot in the installed version — left completely
 * native (per the hard requirement not to rebuild a second device-width
 * system) and themed via the same CSS variables, rather than forced into
 * a single visually-fused row at the cost of touching Puck internals.
 */

export interface MagnetixPuckEditorShellProps {
  pageId: string;
  pageName: string;
  /** V1's own legacy status — still the correct thing to show whenever
   *  `puckPublishStatus === "v1-only"` (this page has never been Published
   *  from the new builder, so V1's status is what's actually live at
   *  `/p/[pageId]`). See `publish-status.ts`'s own doc comment. */
  pageStatus: "draft" | "published";
  puckPublishStatus: PuckPublishStatus;
  subAccountId: string;
  backHref: string;
  /** Route Preview opens in a new tab — `.../new-builder/preview` (see
   *  that route's own doc comment). Built by the caller (new-builder's
   *  `page.tsx`) via the same `saPath()` helper every other in-app link
   *  already uses, so this shell stays route-path-agnostic. */
  previewHref: string;
  initialData: Data;
}

export function MagnetixPuckEditorShell({
  pageId,
  pageName,
  pageStatus,
  puckPublishStatus,
  subAccountId,
  backHref,
  previewHref,
  initialData,
}: MagnetixPuckEditorShellProps) {
  const [data, setData] = useState<Data>(initialData);
  // Guards autosave against firing before the editor has actually mounted —
  // set true in a layout-safe effect below (master spec §24.12 "no save
  // before initial page load completes"). The hook's own comparison against
  // the initial `data` snapshot already prevents a spurious first save, but
  // this is a second, explicit guard rather than relying on that alone.
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);

  const {
    saveState,
    saveError,
    saveDraft,
    publishState,
    publishError,
    publish,
  } = usePuckPersistence({
    subAccountId,
    pageId,
    data,
    enabled: persistenceEnabled,
  });

  // Context-dependent, so useMemo (not a fresh literal) — same referential-
  // stability rule as VIEWPORTS/IFRAME_CONFIG below, per the Insert Undo
  // Blocker fix (master spec §3/§12). resolvedForms is intentionally
  // omitted: the CLIENT Form element fetches on demand (see
  // form-client.tsx) rather than depending on pre-resolved metadata, which
  // is the server/<Render>-only path (used by the Preview route instead).
  const metadata: PuckPageMetadata = useMemo(
    () => ({ subAccountId }),
    [subAccountId]
  );

  useEffect(() => {
    setPersistenceEnabled(true);
  }, []);

  /**
   * Writes the CURRENT in-memory `data` into this page's session-scoped
   * preview slot, then opens the dedicated Preview route in a new tab.
   * Deliberately does NOT pass `"noopener"` to `window.open` — that flag
   * disowns the new tab's `opener` reference, which is specifically what
   * removes it from the "unit of related similar-origin browsing
   * contexts" that `sessionStorage` sharing depends on (see
   * preview-session.ts). Both tabs are same-origin, first-party Magnetix
   * routes, so the reverse-tabnabbing risk `noopener` normally guards
   * against doesn't apply here.
   */
  function openPreview() {
    try {
      sessionStorage.setItem(previewStorageKey(pageId), JSON.stringify(data));
    } catch {
      // sessionStorage can throw (private-browsing storage caps, quota,
      // etc.) — Preview still opens; the new tab's own "no preview data
      // found" empty state explains what to do next rather than this
      // failing with no feedback at all.
    }
    window.open(previewHref, "_blank");
  }

  async function handlePublish() {
    const result = await publish();
    if (result.ok) {
      toast.success("Page published");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="magnetix-puck-shell bg-background text-foreground flex h-dvh flex-col">
      <div className="min-h-0 flex-1">
        <Puck
          config={clientPuckConfig}
          data={data}
          onChange={setData}
          headerTitle={pageName}
          viewports={VIEWPORTS}
          iframe={IFRAME_CONFIG}
          metadata={metadata}
          overrides={{
            header: ({ children }) => (
              <div className="border-border bg-card flex items-center gap-3 border-b px-4 py-2.5">
                <a
                  href={backHref}
                  className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Pages &amp; Funnels
                </a>
                <PageStatusBadge
                  pageStatus={pageStatus}
                  puckPublishStatus={puckPublishStatus}
                />
                {/* Self-identifying QA badge (added after real user QA
                    confirmed a user could land in V1 and not realize it —
                    this makes which editor is on screen unambiguous at a
                    glance, without reading anything else). "New Builder
                    Preview" per this task's explicit naming guidance —
                    not "Puck", which isn't customer-facing product naming.
                    Remove once Puck is the only editor and this distinction
                    no longer needs calling out. */}
                <Badge
                  variant="outline"
                  className="border-primary/40 text-primary shrink-0 border-dashed"
                >
                  New Builder Preview
                </Badge>
                <div className="min-w-0 flex-1">{children}</div>
              </div>
            ),
            headerActions: () => (
              <div className="flex items-center gap-2">
                <SaveStateIndicator state={saveState} error={saveError} />
                <Button variant="outline" size="sm" onClick={openPreview}>
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveDraft}
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishState === "saving"}
                  title={
                    publishState === "error"
                      ? (publishError ?? undefined)
                      : undefined
                  }
                >
                  {publishState === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Publish
                </Button>
              </div>
            ),
            // Phase 2B (master spec §6/§13): the stock text-heavy drawer
            // and plain Outline/Fields panels are replaced with the
            // Magnetix visual system below. Each wrapper renders Puck's
            // OWN real content (drag mechanics, tree, fields) unmodified —
            // only the surrounding chrome is custom. `drawer` fully
            // replaces Puck's default library listing (not just wraps it)
            // with MagnetixBlocksPanel, which itself is built on the
            // public `Drawer`/`Drawer.Item` components, so the real Puck
            // insertion/drag system is what actually runs.
            drawer: () => <MagnetixBlocksPanel config={clientPuckConfig} />,
            outline: ({ children }) => (
              <MagnetixLayersPanel>{children}</MagnetixLayersPanel>
            ),
            fields: ({ children }) => (
              <MagnetixSettingsPanel>{children}</MagnetixSettingsPanel>
            ),
          }}
        />
      </div>
    </div>
  );
}

/**
 * Page Status badge (master spec §24.12 "Page Status") — deliberately
 * defers to V1's own status whenever this page has never been Published
 * from the new builder (`puckPublishStatus === "v1-only"`), since V1's
 * status is what's ACTUALLY live at `/p/[pageId]` in that case; only once
 * a real Puck publish has happened does this switch to Puck-aware status.
 * See `publish-status.ts`'s own doc comment for why these are genuinely
 * different things, not two labels for the same state.
 */
function PageStatusBadge({
  pageStatus,
  puckPublishStatus,
}: {
  pageStatus: "draft" | "published";
  puckPublishStatus: PuckPublishStatus;
}) {
  if (puckPublishStatus === "v1-only") {
    return (
      <Badge
        variant={pageStatus === "published" ? "default" : "secondary"}
        className="shrink-0"
      >
        {pageStatus === "published" ? "Published" : "Draft"}
      </Badge>
    );
  }
  if (puckPublishStatus === "published-outdated") {
    return (
      <Badge variant="outline" className="shrink-0">
        Unpublished changes
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="shrink-0">
      Published
    </Badge>
  );
}

/**
 * Save Draft's own state feedback (master spec §24.6/§24.12 "Saving… /
 * Saved" — reused for both the manual button and autosave, since they
 * share one save code path). Rendered separately from the Save Draft
 * button itself (not just a changing button label) so autosave — which the
 * user never clicked anything for — still has somewhere to show its own
 * result without silently relabeling a button they didn't press.
 */
function SaveStateIndicator({
  state,
  error,
}: {
  state: "idle" | "saving" | "saved" | "error";
  error: string | null;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span
        className="text-destructive flex shrink-0 items-center gap-1 text-xs"
        title={error ?? undefined}
      >
        <AlertTriangle className="h-3 w-3" /> Save failed
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
      <Check className="h-3 w-3" /> Saved
    </span>
  );
}
