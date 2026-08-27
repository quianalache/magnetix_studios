"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Eye, X } from "lucide-react";
import { Puck, Render } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./magnetix-theme.css";
import type { Data } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { VIEWPORTS, IFRAME_CONFIG } from "@/lib/pages-funnels/puck/constants";
import { MagnetixBlocksPanel } from "@/components/pages-funnels/puck/blocks-panel";
import { MagnetixLayersPanel } from "@/components/pages-funnels/puck/layers-panel";
import { MagnetixSettingsPanel } from "@/components/pages-funnels/puck/settings-panel";
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
 * Phase 2B (this version) goes further: the left library, Layers, and
 * Settings panels are now genuinely custom Magnetix components
 * (blocks-panel.tsx, layers-panel.tsx, settings-panel.tsx), wired in via
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
 * `onPublish` prop this shell deliberately never sets) with three explicit
 * buttons: Preview (real, opens a read-only `<Render>` of the current
 * in-memory Data — same "preview current unsaved edits" pattern the V1
 * editor already uses), and Save Draft / Publish, both disabled with an
 * explanatory title — per the master spec, "if Save/Publish are not yet
 * wired for Puck Data, clearly mark or disable rather than pretending they
 * work." `renderHeaderActions` (used in Phase 1) is deprecated as of the
 * installed 0.23.0 (confirmed via the package's own runtime deprecation
 * warning) in favor of exactly this `overrides.headerActions` + native
 * render-prop pattern — this shell uses the current, non-deprecated API.
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
  pageStatus: "draft" | "published";
  subAccountId: string;
  backHref: string;
  initialData: Data;
}

export function MagnetixPuckEditorShell({
  pageName,
  pageStatus,
  subAccountId,
  backHref,
  initialData,
}: MagnetixPuckEditorShellProps) {
  const [data, setData] = useState<Data>(initialData);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Context-dependent, so useMemo (not a fresh literal) — same referential-
  // stability rule as VIEWPORTS/IFRAME_CONFIG below, per the Insert Undo
  // Blocker fix (master spec §3/§12, this task's §14). resolvedForms is
  // intentionally omitted: the CLIENT Form element fetches on demand (see
  // form-client.tsx) rather than depending on pre-resolved metadata, which
  // is the server/<Render>-only path.
  const metadata: PuckPageMetadata = useMemo(
    () => ({ subAccountId }),
    [subAccountId]
  );

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
                <Badge
                  variant={pageStatus === "published" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {pageStatus === "published" ? "Published" : "Draft"}
                </Badge>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Puck Data persistence isn't wired yet (Phase 2A is session-local, safe-testing only) — see the master spec's Build Status."
                >
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  disabled
                  title="Puck Data persistence isn't wired yet (Phase 2A is session-local, safe-testing only) — see the master spec's Build Status."
                >
                  Publish
                </Button>
              </div>
            ),
            // Phase 2B (master spec §6/§13, this task's §4/§7/§8): the
            // stock text-heavy drawer and plain Outline/Fields panels are
            // replaced with the Magnetix visual system below. Each wrapper
            // renders Puck's OWN real content (drag mechanics, tree,
            // fields) unmodified — only the surrounding chrome is custom.
            // `drawer` fully replaces Puck's default library listing (not
            // just wraps it) with MagnetixBlocksPanel, which itself is
            // built on the public `Drawer`/`Drawer.Item` components, so the
            // real Puck insertion/drag system is what actually runs.
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

      {/* Preview — read-only <Render> of the SAME in-memory `data`, same
          "preview current unsaved edits without persisting" pattern the V1
          editor's own Preview mode already uses (page.tsx's `mode` state).
          A dialog rather than swapping the whole body: keeps <Puck> mounted
          continuously so its own undo/redo history is never at risk of
          being reset by an unmount/remount. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-border flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              Preview — {pageName}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="bg-muted/30 flex-1 overflow-y-auto">
            {previewOpen && (
              <Render
                config={serverPuckConfig}
                data={data}
                metadata={metadata}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
