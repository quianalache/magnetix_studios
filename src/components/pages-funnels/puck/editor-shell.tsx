"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  PanelTop,
} from "lucide-react";
import { Puck, outlinePlugin, useGetPuck } from "@puckeditor/core";
// Puck's `no-external.css` is its own build of puck.css without the
// `@import "https://rsms.me/inter/inter.css"` line. That remote import made
// the editor's CSS chunk fail whenever rsms.me was unreachable (blocked
// network, ad blocker, outage), which rejected this dynamic import and
// crashed the whole editor. The builder never used Inter anyway —
// magnetix-theme.css sets --puck-font-family to the Magnetix system stack.
// `pnpm lint` (scripts/check-no-remote-css.mjs) keeps it this way.
import "@puckeditor/core/no-external.css";
import "./magnetix-theme.css";
import type { Data, Plugin, UiState } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/system/status-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { VIEWPORTS, IFRAME_CONFIG } from "@/lib/pages-funnels/puck/constants";
import { MagnetixBlocksPanel } from "@/components/pages-funnels/puck/blocks-panel";
import { AutoHierarchyWatcher } from "@/components/pages-funnels/puck/auto-hierarchy-watcher";
import { MagnetixLayersPanel } from "@/components/pages-funnels/puck/layers-panel";
import { MagnetixSettingsPanel } from "@/components/pages-funnels/puck/settings-panel";
import { previewStorageKey } from "@/lib/pages-funnels/puck/preview-session";
import {
  usePuckPersistence,
  type PuckSaveState,
} from "@/components/pages-funnels/puck/use-puck-persistence";
import type { PuckPublishStatus } from "@/lib/pages-funnels/puck/publish-status";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { getTenantBrandColors } from "@/lib/brand/brand-colors";
import type { ReadingResultPageSettings } from "@/types/reading-blocks";
import { useReadingResultBuilder } from "@/components/pages-funnels/puck/use-reading-result-builder";
import {
  PopupManagerContext,
  PopupManagerPanel,
  type PopupManagerApi,
} from "@/components/pages-funnels/puck/popup-manager";
import { createPopupEditorConfig } from "@/components/pages-funnels/puck/popup-editor-config";
import { ActionFieldContext, type ActionFieldContextValue } from "@/components/pages-funnels/puck/action-field";
import { PopupEditorContext } from "@/components/pages-funnels/puck/popup-edit-canvas";
import { PageSettingsButton, type PageSettingsDialogProps } from "@/components/pages-funnels/puck/page-settings-dialog";
import { resolvePageSettings, withPageSettings, type PageSettings } from "@/lib/pages-funnels/page-settings";
import { applyPopupEditorChange, popupToEditorData } from "@/lib/pages-funnels/popup-editor";
import { comparePopupCreationOrder, createDefaultPopup, type PopupDefinitionMap } from "@/types/pages-funnels-popup";
import {
  ReadingResultSettingsButton,
  ReadingResultSettingsContext,
} from "@/components/pages-funnels/puck/reading-result-settings";

const SaveStatusContext = createContext<{
  state: PuckSaveState;
  error: string | null;
}>({ state: "idle", error: null });

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
  /** Whether this page genuinely has a live public page right now — either
   *  V1 has published it, or the new builder has (see the caller's own
   *  `hasLivePage` doc comment in `new-builder/page.tsx` for the exact
   *  gate). Drives whether "View Live Page"/"Copy Link" render at all —
   *  master spec's explicit "do not show a fake link for an unpublished
   *  page." */
  hasLivePage: boolean;
  /** The canonical public URL for this page (custom-domain-aware via
   *  `buildPublishedPageUrl`) — always computed by the caller even when
   *  `hasLivePage` is false, so it's ready the instant a Publish flips
   *  `hasLivePage` true without this shell needing its own URL-building
   *  logic. */
  liveUrl: string;
  initialData: Data;
  initialPopups?: PopupDefinitionMap | null;
  /** The page's PUBLISHED Popups — only used for each Popup's publish state in the Popups panel. */
  publishedPopups?: PopupDefinitionMap | null;
  /** Reading Result Pages only (2026-10-21) — the page's Reading settings.
   *  Null on every other page type. */
  readingResult?: ReadingResultPageSettings | null;
  /** Human page-type label shown in the header ("Landing Page", "Reading Result Page"…). */
  pageTypeLabel?: string;
  /** Whether a published copy exists (Revert draft to published needs one). */
  hasPublishedCopy?: boolean;
  /** Pre-Wave 3 flat SEO field — the Page Settings fallback for older trees. */
  legacySeo?: { title?: string; description?: string; ogImage?: string } | null;
}

export function MagnetixPuckEditorShell({
  pageId,
  pageName,
  pageStatus,
  puckPublishStatus,
  subAccountId,
  backHref,
  previewHref,
  hasLivePage,
  liveUrl,
  initialData,
  initialPopups = null,
  publishedPopups: initialPublishedPopups = null,
  readingResult = null,
  pageTypeLabel,
  hasPublishedCopy = false,
  legacySeo = null,
}: MagnetixPuckEditorShellProps) {
  const [data, setData] = useState<Data>(initialData);
  const [popups, setPopups] = useState<PopupDefinitionMap>(initialPopups ?? {});
  const [publishedPopups, setPublishedPopups] = useState<PopupDefinitionMap | null>(initialPublishedPopups);
  // Popup authoring (Wave 2A Slice 4.5): ONE Puck editor whose active
  // SURFACE is either the Page or one Popup. Puck reads `data`/`ui` only at
  // mount, so switching surface remounts <Puck> (keyed by the surface) with
  // that surface's data. The Page's selection, panel and scroll are restored
  // on the way back.
  const [surface, setSurface] = useState<{ popupId: string | null; data: Data; ui?: Partial<UiState> }>(() => ({ popupId: null, data: initialData }));
  const editingPopupId = surface.popupId;
  const editingPopup = editingPopupId ? popups[editingPopupId] : null;
  const popupEditorConfig = useMemo(() => createPopupEditorConfig(clientPuckConfig), []);
  const editorConfig = editingPopupId ? popupEditorConfig : clientPuckConfig;
  const isPopupSurface = editingPopupId !== null;
  const [readingSettings, setReadingSettings] =
    useState<ReadingResultPageSettings | null>(readingResult);
  // Stable for the page's lifetime, so the header actions (and Puck's
  // `overrides`) don't rebuild when a Reading setting changes.
  const hasReadingSettings = readingResult != null;
  const readingSettingsValue = useMemo(
    () =>
      readingSettings
        ? { settings: readingSettings, onChange: setReadingSettings }
        : null,
    [readingSettings]
  );
  const { readingContext, readingBuilder } = useReadingResultBuilder({
    subAccountId,
    pageId,
    settings: readingSettings,
    data,
  });
  // Read fresh at click-time by openPreview (below) so that callback can
  // stay referentially stable (empty/near-empty dep array) without ever
  // reading a stale `data` snapshot — same "ref always holds latest value"
  // pattern `use-puck-persistence.ts`'s own `latestDataRef` already
  // establishes for the exact same reason.
  const latestDataRef = useRef(data);
  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);
  const latestPopupsRef = useRef(popups);
  useEffect(() => {
    latestPopupsRef.current = popups;
  }, [popups]);
  // Guards autosave against firing before the editor has actually mounted —
  // set true in a layout-safe effect below (master spec §24.12 "no save
  // before initial page load completes"). The hook's own comparison against
  // the initial `data` snapshot already prevents a spurious first save, but
  // this is a second, explicit guard rather than relying on that alone.
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);

  const {
    suspend,
    resume,
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
    popups,
    enabled: persistenceEnabled,
  });

  // Context-dependent, so useMemo (not a fresh literal) — same referential-
  // stability rule as VIEWPORTS/IFRAME_CONFIG below, per the Insert Undo
  // Blocker fix (master spec §3/§12). resolvedForms is intentionally
  // omitted: the CLIENT Form element fetches on demand (see
  // form-client.tsx) rather than depending on pre-resolved metadata, which
  // is the server/<Render>-only path (used by the Preview route instead).
  // Workspace Brand colors (Settings → Branding), live from the sub-account
  // doc — Charts in "Brand colors" mode read them from metadata.
  const workspace = useOptionalSubAccount();
  const brandKey = JSON.stringify(getTenantBrandColors(workspace?.subAccount).map((c) => c.hex));
  const brandColors = useMemo<string[]>(() => JSON.parse(brandKey), [brandKey]);
  const brandKitKey = JSON.stringify(getTenantBrandColors(workspace?.subAccount).map(({ id, hex, name }) => ({ id, hex, name })));
  const brandKit = useMemo<NonNullable<PuckPageMetadata["brandKit"]>>(() => JSON.parse(brandKitKey), [brandKitKey]);
  const metadata: PuckPageMetadata = useMemo(
    () => ({ subAccountId, pageId, readingContext, readingBuilder, brandColors, brandKit }),
    [subAccountId, pageId, readingContext, readingBuilder, brandColors, brandKit]
  );

  // Every change is routed by the surface this <Puck> instance was mounted
  // for (captured per instance), so Page edits can only write the Page and
  // a Popup's edits can only write that Popup — never another one.
  const handleEditorChange = useCallback((next: Data) => {
    if (editingPopupId) {
      setPopups((current) => applyPopupEditorChange(current, editingPopupId, next));
      return;
    }
    setData(next);
  }, [editingPopupId]);

  // The live <Puck> instance's API (set by PuckBridge inside its tree): used
  // to snapshot the Page's UI before switching and to rename the Popup
  // being edited through Puck's own store.
  const getPuckRef = useRef<ReturnType<typeof useGetPuck> | null>(null);
  const pageReturnRef = useRef<{ ui: Partial<UiState>; scrollTop: number } | null>(null);

  const enterPopupEditor = useCallback((id: string, popupOverride?: PopupDefinitionMap[string]) => {
    const popup = popupOverride ?? latestPopupsRef.current[id];
    if (!popup) return;
    const current = getPuckRef.current?.()?.appState.ui;
    if (!editingPopupId) {
      pageReturnRef.current = {
        ui: current
          ? {
              itemSelector: current.itemSelector,
              plugin: current.plugin,
              leftSideBarVisible: current.leftSideBarVisible,
              rightSideBarVisible: current.rightSideBarVisible,
              itemExpanded: current.itemExpanded,
            }
          : {},
        scrollTop: canvasScroller()?.scrollTop ?? 0,
      };
    }
    setSurface({
      popupId: id,
      data: popupToEditorData(popup),
      ui: current
        ? {
            viewports: current.viewports,
            // Below laptop width the side panel closes so the Popup itself is
            // what the owner sees (Blocks / Layers stay one tap away).
            leftSideBarVisible: window.innerWidth >= 1000 ? current.leftSideBarVisible : false,
            rightSideBarVisible: current.rightSideBarVisible,
            plugin: { current: "blocks" },
            itemSelector: null,
          }
        : { plugin: { current: "blocks" } },
    });
  }, [editingPopupId]);

  const exitPopupEditor = useCallback(() => {
    const current = getPuckRef.current?.()?.appState.ui;
    const back = pageReturnRef.current;
    setSurface({
      popupId: null,
      data: latestDataRef.current,
      ui: { ...(back?.ui ?? {}), ...(current ? { viewports: current.viewports } : {}) },
    });
    if (back?.scrollTop) restoreCanvasScroll(back.scrollTop);
  }, []);

  const popupApi = useMemo<PopupManagerApi>(() => ({
    popups,
    publishedPopups,
    editingPopupId,
    create: (name) => {
      const id = `popup_${crypto.randomUUID().replaceAll("-", "")}`;
      const now = new Date().toISOString();
      const popup = { ...createDefaultPopup(id, name), createdAt: now, updatedAt: now };
      setPopups((current) => ({ ...current, [id]: popup }));
      enterPopupEditor(id, popup);
    },
    edit: (id) => enterPopupEditor(id),
    rename: (id, name) => {
      if (id === editingPopupId) {
        // The Popup being edited lives in Puck's store (root `frame`):
        // rename it there so Puck's next change can't restore the old name.
        const puck = getPuckRef.current?.();
        const root = puck?.appState.data.root as { props?: { frame?: { name: string } } } | undefined;
        if (puck && root?.props?.frame) {
          puck.dispatch({ type: "setData", data: { root: { props: { ...root.props, frame: { ...root.props.frame, name } } } } as Partial<Data> });
          return;
        }
      }
      setPopups((current) => (current[id] ? { ...current, [id]: { ...current[id], name } } : current));
    },
    remove: (id) => {
      if (id === editingPopupId) exitPopupEditor();
      setPopups((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    backToPage: exitPopupEditor,
  }), [popups, publishedPopups, editingPopupId, enterPopupEditor, exitPopupEditor]);

  // ActionField context (Slice 5): which surface is being edited, and THIS
  // page's draft Popups (stable id + current name) for the Open popup picker.
  const actionFieldValue = useMemo<ActionFieldContextValue>(() => ({
    surface: isPopupSurface ? "popup" : "page",
    popups: Object.values(popups)
      .sort(comparePopupCreationOrder)
      .map((p) => ({ id: p.id, name: p.name })),
    openPopupsPanel: () => getPuckRef.current?.()?.dispatch({ type: "setUi", ui: { plugin: { current: "popups" }, leftSideBarVisible: true } }),
  }), [isPopupSurface, popups]);

  const popupEditorValue = useMemo(() => ({ pageData: data, onBackToPage: exitPopupEditor }), [data, exitPopupEditor]);
  const popupHeaderValue = useMemo(() => ({ name: editingPopup?.name ?? null, onBackToPage: exitPopupEditor }), [editingPopup?.name, exitPopupEditor]);

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
  const openPreview = useCallback(() => {
    try {
      sessionStorage.setItem(
        previewStorageKey(pageId),
        JSON.stringify({ data: latestDataRef.current, popups: latestPopupsRef.current })
      );
    } catch {
      // sessionStorage can throw (private-browsing storage caps, quota,
      // etc.) — Preview still opens; the new tab's own "no preview data
      // found" empty state explains what to do next rather than this
      // failing with no feedback at all.
    }
    // While editing a Popup, Preview opens the page with that Popup open.
    window.open(
      editingPopupId ? `${previewHref}${previewHref.includes("?") ? "&" : "?"}popup=${encodeURIComponent(editingPopupId)}` : previewHref,
      "_blank"
    );
  }, [pageId, previewHref, editingPopupId]);

  const handlePublish = useCallback(async () => {
    const published = latestPopupsRef.current;
    const result = await publish();
    if (result.ok) {
      setPublishedPopups(published);
      toast.success("Page published");
    } else {
      toast.error(result.error);
    }
  }, [publish]);

  // ── Page Settings (Wave 3) ──────────────────────────────────────────────
  // Publishable settings live in the page's draft tree (`root.props.
  // pageSettings`): reading them uses the latest draft, writing them goes
  // through Puck so the change is an ordinary draft edit (autosave, undo,
  // "Unpublished changes", Publish).
  const legacySeoKey = JSON.stringify(legacySeo ?? null);
  const readPageSettings = useCallback(
    () => resolvePageSettings(latestDataRef.current as never, JSON.parse(legacySeoKey)),
    [legacySeoKey]
  );
  const applyPageSettings = useCallback((settings: PageSettings) => {
    const puck = getPuckRef.current?.();
    if (!puck) {
      toast.error("The editor isn't ready yet. Try again in a moment.");
      return;
    }
    const next = withPageSettings(puck.appState.data, settings);
    puck.dispatch({ type: "setData", data: { root: next.root } as Partial<Data> });
  }, []);
  const pageSettingsAction = useCallback(async (action: "unpublish" | "revert") => {
    const res = await fetch("/api/pages-funnels/puck/page-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, action }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again.");
  }, [pageId]);
  const handleUnpublish = useCallback(async () => {
    try {
      await pageSettingsAction("unpublish");
      toast.success("Page unpublished");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unpublish the page.");
      return false;
    }
  }, [pageSettingsAction]);
  const handleRevert = useCallback(async () => {
    // No autosave may write the old draft back while the server replaces it.
    await suspend();
    try {
      await pageSettingsAction("revert");
    } catch (err) {
      resume();
      toast.error(err instanceof Error ? err.message : "Couldn't revert the draft.");
      return false;
    }
    toast.success("Draft reverted to the published version");
    // The editor holds the draft in memory; reload so it opens the reverted one.
    window.setTimeout(() => window.location.reload(), 400);
    return true;
  }, [pageSettingsAction, suspend, resume]);
  // Read by the header button through context, so a rename or unpublish
  // (which changes these values) never rebuilds Puck's header overrides.
  const pageSettingsValue = useMemo<PageSettingsDialogProps>(() => ({
    pageId,
    pageName,
    liveUrl,
    isReadingResult: readingResult != null,
    isPublished: pageStatus === "published" && hasPublishedCopy,
    hasPublishedCopy,
    readSettings: readPageSettings,
    applySettings: applyPageSettings,
    onUnpublish: handleUnpublish,
    onRevert: handleRevert,
  }), [pageId, pageName, liveUrl, readingResult, pageStatus, hasPublishedCopy, readPageSettings, applyPageSettings, handleUnpublish, handleRevert]);

  /**
   * Live published-page link UX (real user QA blocker — Publish reported
   * success but gave no obvious way to open/copy the actual public page).
   * `liveUrl` is the same canonical `buildPublishedPageUrl` output the
   * dashboard's PageCard now uses — never a hardcoded localhost/relative
   * path — and both actions are only rendered at all when `hasLivePage` is
   * true (see this component's own prop doc comment).
   */
  const copyLiveLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      toast.success("Live link copied");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't copy link.");
    }
  }, [liveUrl]);

  // Root cause of the inline-editing bug (real user QA blocker — see master
  // spec's Known Bugs): `overrides` is ALSO a controlled `<Puck>` prop, same
  // as `iframe`/`metadata` above, and needs the identical referential-
  // stability treatment §3 already mandates for those two — this was simply
  // never applied to `overrides` when Phase 2B introduced it. Passing a
  // fresh object (and fresh `header`/`headerActions` closures) on every
  // render was invisible for clicks/selection, but fatal for typing: `data`
  // updates on every keystroke (that's the whole point of a controlled
  // canvas), which re-renders this shell, which previously rebuilt
  // `overrides` from scratch every time. Puck's own `PuckProvider` feeds
  // `overrides` into `useLoadedOverrides` (memoized on `[plugins,
  // overrides]`) and then into `generateAppStore` (a `useCallback` whose own
  // deps include that loaded-overrides result), and re-runs
  // `appStore.setState(generateAppStore(state))` every time `generateAppStore`
  // itself gets a new identity — i.e., every keystroke, unconditionally,
  // regardless of whether any override actually changed. That churn was
  // enough to reset the InlineTextField's own local `isFocused` state
  // (confirmed live: `document.activeElement` inside the canvas iframe fell
  // back to `<body>` after exactly one typed character, exactly matching
  // "only one character accepted"). `header`/`headerActions` are memoized
  // via `useCallback` first (their own dependencies are ordinary React
  // state, unrelated to `data`) so `overrides` itself is a real, stable
  // reference across every keystroke — verified with a live Playwright
  // repro against the QA harness before and after this fix (see task
  // report).
  const renderHeader = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <div className="border-border bg-card relative flex items-center gap-3 border-b px-4 py-1.5">
        {/* System B Auto Hierarchy (master spec §24.1/§6/§11–15) — a
            non-rendering watcher, mounted here (not anywhere in the visual
            layout) purely because this is a real descendant of `<Puck>`'s
            own provider tree, which `AutoHierarchyWatcher`'s use of
            `createUsePuck()` requires. See that component's own doc
            comment for the full mechanism. */}
        <AutoHierarchyWatcher />
        <PuckBridge getPuckRef={getPuckRef} />
        {isPopupSurface ? (
          // Popup Edit Mode: one obvious way back, and an always-visible
          // "Editing Popup: <name>" so it's never unclear which surface is open.
          <PopupHeaderContext />
        ) : (
          <>
            {/* Responsive header (2026-10-22): below 2xl the back link is the
                arrow alone (accessible name + tooltip kept) so Publish never
                runs off the edge on laptop widths. */}
            <a
              href={backHref}
              aria-label="Back to Pages & Funnels"
              title="Back to Pages & Funnels"
              className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden 2xl:inline">Back to Pages &amp; Funnels</span>
            </a>
            <PageStatusBadge
              pageStatus={pageStatus}
              puckPublishStatus={puckPublishStatus}
            />
            {/* Page type (2026-10-24) — replaces the migration-era "New
                Builder" badge now that this is the only editor. */}
            {pageTypeLabel && (
              <span className="text-muted-foreground hidden shrink-0 text-caption font-medium xl:inline">
                {pageTypeLabel}
              </span>
            )}
          </>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    ),
    [backHref, isPopupSurface, pageStatus, puckPublishStatus, pageTypeLabel]
  );

  const renderHeaderActions = useCallback(
    () => (
      <div className="flex items-center gap-2">
        <SaveStateIndicator />
        {hasReadingSettings && (
          <ReadingResultSettingsButton
            subAccountId={subAccountId}
            pageId={pageId}
          />
        )}
        {/* Live published-page link UX (real user QA blocker) — only
            rendered once this page genuinely has a live public page (see
            `hasLivePage`'s own doc comment). "View Live Page" opens the
            REAL public route in a new tab; "Copy Link" copies the exact
            same canonical URL, never a hardcoded localhost/relative
            path. */}
        {!isPopupSurface && hasLivePage && (
          <>
            {/* Secondary live-page actions: inline at 2xl, otherwise in a
                "More actions" menu so Preview / Save Draft / Publish always
                keep their full labels and stay on screen. */}
            <Button
              variant="outline"
              size="sm"
              className="hidden 2xl:inline-flex"
              render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="h-4 w-4" /> View Live Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden 2xl:inline-flex"
              onClick={copyLiveLink}
            >
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="2xl:hidden"
                    aria-label="More actions"
                    title="More actions"
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink className="h-4 w-4" /> View Live Page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyLiveLink}>
                  <Copy className="h-4 w-4" /> Copy Link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {!isPopupSurface && <PageSettingsHeaderButton />}
        <Button variant="outline" size="sm" onClick={openPreview}>
          <Eye className="h-4 w-4" /> Preview
        </Button>
        <SaveDraftButton onClick={saveDraft} />
        <PublishButton onClick={handlePublish} />
      </div>
    ),
    [
      hasReadingSettings,
      subAccountId,
      pageId,
      isPopupSurface,
      hasLivePage,
      liveUrl,
      copyLiveLink,
      openPreview,
      saveDraft,
      handlePublish,
    ]
  );

  const isReadingResult = !!readingResult;
  const renderDrawer = useCallback(
    () => (
      <MagnetixBlocksPanel
        config={editorConfig}
        readingResult={isReadingResult && !isPopupSurface}
      />
    ),
    [editorConfig, isPopupSurface, isReadingResult]
  );
  const renderOutline = useCallback(
    ({ children }: { children: React.ReactNode }) =>
      isPopupSurface ? (
        <PopupLayersPanel>{children}</PopupLayersPanel>
      ) : (
        <MagnetixLayersPanel>{children}</MagnetixLayersPanel>
      ),
    [isPopupSurface]
  );
  const renderFields = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <MagnetixSettingsPanel popupMode={isPopupSurface}>{children}</MagnetixSettingsPanel>
    ),
    [isPopupSurface]
  );

  const overrides = useMemo(
    () => ({
      header: renderHeader,
      headerActions: renderHeaderActions,
      drawer: renderDrawer,
      outline: renderOutline,
      fields: renderFields,
    }),
    [
      renderHeader,
      renderHeaderActions,
      renderDrawer,
      renderOutline,
      renderFields,
    ]
  );

  // Tablets (638–999px): open with the Blocks sidebar collapsed so the
  // canvas isn't squeezed to ~250px between two panels (the header's panel
  // toggle brings it back). Phones keep Puck's own tabbed layout; laptops
  // and up keep both panels. Read once — this component is client-only.
  const [initialUi] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= 638 && window.innerWidth < 1000
      ? { leftSideBarVisible: false }
      : undefined
  );

  return (
    <div className="magnetix-puck-shell bg-background text-foreground flex h-dvh flex-col" data-editing-surface={isPopupSurface ? "popup" : "page"}>
      <div className="min-h-0 flex-1">
        <PageSettingsContext.Provider value={pageSettingsValue}>
        <ReadingResultSettingsContext.Provider value={readingSettingsValue}>
          <SaveStatusContext.Provider value={{ state: saveState, error: saveError }}>
            <PublishStatusContext.Provider value={{ state: publishState, error: publishError }}>
              <PopupManagerContext.Provider value={popupApi}>
                <ActionFieldContext.Provider value={actionFieldValue}>
                <PopupEditorContext.Provider value={popupEditorValue}>
                  <EditingPopupContext.Provider value={popupHeaderValue}>
                    <Puck
                      key={editingPopupId ?? "page"}
                      config={editorConfig}
                      data={surface.data}
                      onChange={handleEditorChange}
                      headerTitle={pageName}
                      viewports={VIEWPORTS}
                      iframe={IFRAME_CONFIG}
                      metadata={metadata}
                      overrides={overrides}
                      plugins={POPUP_PLUGINS}
                      ui={surface.ui ?? initialUi}
                    />
                  </EditingPopupContext.Provider>
                </PopupEditorContext.Provider>
                </ActionFieldContext.Provider>
              </PopupManagerContext.Provider>
            </PublishStatusContext.Provider>
          </SaveStatusContext.Provider>
        </ReadingResultSettingsContext.Provider>
        </PageSettingsContext.Provider>
      </div>
    </div>
  );
}

/**
 * Builder left rail (approved mockup): Blocks · Layers · Popups. Puck's own
 * Outline plugin, relabelled "Layers" to match its panel; "Popups" is the
 * Popup manager. Stable: Puck plugins are props.
 */
const POPUP_PLUGINS: Plugin[] = [
  outlinePlugin({ label: "Layers" }),
  { name: "popups", label: "Popups", icon: <PanelTop />, render: PopupManagerPanel },
];

/** Name of the Popup being edited, read by the header and Layers through context so `overrides` stay stable while it changes. */
const PageSettingsContext = createContext<PageSettingsDialogProps | null>(null);
function PageSettingsHeaderButton() {
  const value = useContext(PageSettingsContext);
  return value ? <PageSettingsButton {...value} /> : null;
}

const EditingPopupContext = createContext<{ name: string | null; onBackToPage: () => void }>({ name: null, onBackToPage: () => {} });

function PopupHeaderContext() {
  const { name, onBackToPage } = useContext(EditingPopupContext);
  return (
    <>
      {/* Below laptop width: the arrow alone (labelled + tooltip, like the
          page's own back link), so Puck's title and Preview / Save Draft /
          Publish keep their room. The canvas has a labelled "Back to Page" too. */}
      <Button variant="outline" size="sm" className="shrink-0" onClick={onBackToPage} aria-label="Back to Page" title="Back to Page" data-popup-back-to-page="header">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> <span className="hidden lg:inline">Back to Page</span>
      </Button>
      <span
        className="bg-tag-violet-bg text-tag-violet-fg flex max-w-[11rem] min-w-0 shrink items-center gap-1.5 rounded-md px-2 py-1 text-caption font-semibold xl:max-w-xs"
        data-editing-popup-label=""
      >
        <PanelTop className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Editing Popup: {name}</span>
      </span>
    </>
  );
}

function PopupLayersPanel({ children }: { children: React.ReactNode }) {
  const { name } = useContext(EditingPopupContext);
  return <MagnetixLayersPanel popupName={name ?? "Popup"}>{children}</MagnetixLayersPanel>;
}

/** Hands the live <Puck> instance's API to the shell (mounted inside Puck's tree). */
function PuckBridge({ getPuckRef }: { getPuckRef: React.MutableRefObject<ReturnType<typeof useGetPuck> | null> }) {
  const getPuck = useGetPuck();
  useEffect(() => {
    getPuckRef.current = getPuck;
  }, [getPuck, getPuckRef]);
  return null;
}

/** The element that scrolls the editor canvas: Puck's canvas iframe scrolls its own document. */
function canvasScroller(): HTMLElement | null {
  const frame = document.getElementById("preview-frame") as HTMLIFrameElement | null;
  return (frame?.contentDocument?.scrollingElement as HTMLElement | null | undefined) ?? null;
}

/** Back to Page: once the remounted Page canvas is tall enough, return to where the owner was. */
function restoreCanvasScroll(top: number) {
  const started = Date.now();
  const attempt = () => {
    const el = canvasScroller();
    if (el && el.scrollHeight - el.clientHeight >= top) {
      el.scrollTop = top;
      return;
    }
    if (Date.now() - started < 4000) window.setTimeout(attempt, 100);
  };
  window.setTimeout(attempt, 100);
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
  // Shared CRM status pill (Visual Direction 2): the same word always
  // gets the same tone across the app — Published green, Draft neutral,
  // Unpublished changes amber.
  if (puckPublishStatus === "v1-only") {
    return pageStatus === "published" ? (
      <StatusPill tone="success" className="shrink-0">Published</StatusPill>
    ) : (
      <StatusPill tone="neutral" className="shrink-0">Draft</StatusPill>
    );
  }
  if (puckPublishStatus === "published-outdated") {
    return <StatusPill tone="warning" className="shrink-0">Unpublished changes</StatusPill>;
  }
  if (puckPublishStatus === "unpublished") {
    return <StatusPill tone="neutral" className="shrink-0">Unpublished</StatusPill>;
  }
  return <StatusPill tone="success" className="shrink-0">Published</StatusPill>;
}

/**
 * Save Draft's own state feedback (master spec §24.6/§24.12 "Saving… /
 * Saved" — reused for both the manual button and autosave, since they
 * share one save code path). Rendered separately from the Save Draft
 * button itself (not just a changing button label) so autosave — which the
 * user never clicked anything for — still has somewhere to show its own
 * result without silently relabeling a button they didn't press.
 */
function SaveDraftButton({ onClick }: { onClick: () => void }) {
  const { state } = useContext(SaveStatusContext);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={state === "saving"}
    >
      {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Save Draft
    </Button>
  );
}

function PublishButton({ onClick }: { onClick: () => void }) {
  const { state, error } = useContext(PublishStatusContext);
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={state === "saving"}
      title={state === "error" ? (error ?? undefined) : undefined}
    >
      {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Publish
    </Button>
  );
}

const PublishStatusContext = createContext<{
  state: PuckSaveState;
  error: string | null;
}>({ state: "idle", error: null });

function SaveStateIndicator() {
  const { state, error } = useContext(SaveStatusContext);
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
