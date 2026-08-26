"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  Pencil,
  Loader2,
  Monitor,
  Tablet,
  Smartphone,
  Redo2,
  Undo2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import {
  subscribeToPage,
  updatePageBlocks,
  publishPage,
  unpublishPage,
} from "@/lib/firestore/pages-funnels";
import { getForm } from "@/lib/firestore/forms";
import { createBlock, duplicateBlock } from "@/lib/pages-funnels/blocks";
import { getPageSections } from "@/lib/pages-funnels/v2/migrate";
import { SectionTreeView } from "@/components/pages-funnels/renderer-v2/tree-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BlocksPanel } from "@/components/pages-funnels/editor/blocks-panel";
import { Canvas, type DeviceMode } from "@/components/pages-funnels/editor/canvas";
import { SettingsPanel } from "@/components/pages-funnels/editor/settings-panel";
import type { BlockType, PageBlock, PageDoc } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";

/** Same 3 widths Canvas uses for its own device preview — duplicated here
 *  (not imported from canvas.tsx) rather than exporting Canvas's private
 *  constant, so Canvas itself stays completely untouched by this phase. */
const PREVIEW_DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const DEVICE_ICONS: { mode: DeviceMode; icon: typeof Monitor }[] = [
  { mode: "desktop", icon: Monitor },
  { mode: "tablet", icon: Tablet },
  { mode: "mobile", icon: Smartphone },
];

const MAX_HISTORY = 50;

/**
 * The visual page editor. Lives under the sidebar-less `(builder)` route
 * group (matching the existing standalone-course theme editor's pattern) so
 * the canvas gets the full viewport width — the normal CRM sidebar/header
 * chrome intentionally does NOT render here; "← Back to Pages & Funnels" is
 * the only way out.
 */
export default function PageEditor({
  params,
}: {
  params: Promise<{ subAccountId: string; pageId: string }>;
}) {
  const { pageId } = use(params);
  const { saPath } = useSubAccount();

  const [page, setPage] = useState<PageDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceMode>("desktop");
  // "Preview" toggles the main content area between the live-editable V1
  // Canvas and a read-only V2 render of the SAME in-memory `blocks` — see
  // getPageSections() below. This is the whole point of Phase C: editing
  // stays V1 (Canvas/SettingsPanel are untouched by this file's changes),
  // but Preview proves V2 rendering against real, current page content
  // (including unsaved edits) without persisting anything or requiring the
  // page to be published first.
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resolvedForms, setResolvedForms] = useState<Record<string, LeadForm | null>>({});

  // Undo/redo — a simple in-memory stack of past block arrays, separate
  // from Firestore persistence (which only happens on explicit Save Draft /
  // Publish, or the debounced autosave below).
  const history = useRef<PageBlock[][]>([]);
  const future = useRef<PageBlock[][]>([]);
  const skipHistory = useRef(false);

  useEffect(() => {
    const unsub = subscribeToPage(pageId, (p) => {
      setPage(p);
      setBlocks((prev) => (loaded ? prev : (p?.blocks ?? [])));
      setLoaded(true);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Resolve any form blocks' referenced forms so the canvas can embed the
  // real PublicForm rather than a placeholder.
  useEffect(() => {
    const formIds = blocks
      .filter((b): b is Extract<PageBlock, { type: "form" }> => b.type === "form")
      .map((b) => b.content.formId)
      .filter((id): id is string => !!id);
    let cancelled = false;
    for (const id of formIds) {
      if (id in resolvedForms) continue;
      getForm(id).then((form) => {
        if (!cancelled) setResolvedForms((prev) => ({ ...prev, [id]: form }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // Recomputed from the current in-memory `blocks` on every change — pure
  // and cheap (see migrate.ts), never persisted. `resolvedForms` below is
  // already fetched (client-side, by the effect above) under this editor's
  // own authenticated session, so it's safe to reuse directly for Preview
  // rather than re-fetching — same forms, same ids, no duplicated fetch
  // logic per the phase's own instruction.
  const previewSections = useMemo(() => getPageSections({ blocks }), [blocks]);

  function setBlocksTracked(next: PageBlock[]) {
    if (!skipHistory.current) {
      history.current = [...history.current, blocks].slice(-MAX_HISTORY);
      future.current = [];
    }
    skipHistory.current = false;
    setBlocks(next);
  }

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    future.current = [blocks, ...future.current];
    skipHistory.current = true;
    setBlocks(prev);
  }

  function redo() {
    const next = future.current.shift();
    if (!next) return;
    history.current = [...history.current, blocks];
    skipHistory.current = true;
    setBlocks(next);
  }

  const save = useCallback(
    async (silent = false) => {
      setSaving(true);
      try {
        await updatePageBlocks(pageId, blocks);
        if (!silent) toast.success("Draft saved");
      } catch (err) {
        console.error(err);
        toast.error("Couldn't save draft");
      } finally {
        setSaving(false);
      }
    },
    [pageId, blocks],
  );

  async function handlePublish() {
    setPublishing(true);
    try {
      await updatePageBlocks(pageId, blocks);
      await publishPage(pageId);
      toast.success("Page published");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't publish page");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    try {
      await unpublishPage(pageId);
      toast.success("Page unpublished");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't unpublish page");
    }
  }

  function addBlock(type: BlockType) {
    const block = createBlock(type);
    setBlocksTracked([...blocks, block]);
    setSelectedId(block.id);
  }

  function updateBlock(next: PageBlock) {
    setBlocksTracked(blocks.map((b) => (b.id === next.id ? next : b)));
  }

  function deleteBlock(id: string) {
    setBlocksTracked(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateBlockById(id: string) {
    const source = blocks.find((b) => b.id === id);
    if (!source) return;
    const copy = duplicateBlock(source);
    const index = blocks.findIndex((b) => b.id === id);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    setBlocksTracked(next);
    setSelectedId(copy.id);
  }

  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Page not found.</p>
        <a href={saPath("/pages-funnels")} className="text-sm font-medium text-primary underline">
          Back to Pages & Funnels
        </a>
      </div>
    );
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <a
          href={saPath("/pages-funnels")}
          className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Pages & Funnels
        </a>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{page.name}</span>
          <Badge variant={page.status === "published" ? "default" : "secondary"}>
            {page.status === "published" ? "Published" : "Draft"}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" title="Undo" disabled={history.current.length === 0} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Redo" disabled={future.current.length === 0} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          >
            {mode === "edit" ? (
              <>
                <Eye className="h-4 w-4" /> Preview
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" /> Edit
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Draft
          </Button>
          {page.status === "published" ? (
            <Button variant="secondary" size="sm" onClick={handleUnpublish}>
              Unpublish
            </Button>
          ) : (
            <Button size="sm" onClick={handlePublish} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />} Publish
            </Button>
          )}
        </div>
      </div>

      {/* Device preview toggle — applies to both edit (Canvas) and preview
          (V2 SectionTreeView) modes below */}
      <div className="flex items-center justify-center gap-1 border-b border-border py-1.5">
        {DEVICE_ICONS.map(({ mode: deviceMode, icon: Icon }) => (
          <button
            key={deviceMode}
            onClick={() => setDevice(deviceMode)}
            title={deviceMode}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              device === deviceMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* Editor body */}
      {mode === "edit" ? (
        <div className="flex flex-1 overflow-hidden">
          <BlocksPanel onAdd={addBlock} />

          <div className="min-w-0 flex-1">
            <Canvas
              blocks={blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={setBlocksTracked}
              onDuplicate={duplicateBlockById}
              onDelete={deleteBlock}
              device={device}
              resolvedForms={resolvedForms}
            />
          </div>

          {selectedBlock && (
            <SettingsPanel block={selectedBlock} onChange={updateBlock} onClose={() => setSelectedId(null)} />
          )}
        </div>
      ) : (
        // Read-only V2 render of the current in-memory blocks — no
        // selection chrome, no editing affordances, matches what /p/[pageId]
        // will show once this draft is saved and published.
        <div className="flex flex-1 justify-center overflow-y-auto bg-muted/30 py-8">
          <div
            className="min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-[width] duration-150"
            style={{ width: PREVIEW_DEVICE_WIDTH[device], maxWidth: "100%" }}
          >
            <SectionTreeView sections={previewSections} resolvedForms={resolvedForms} />
          </div>
        </div>
      )}
    </div>
  );
}
