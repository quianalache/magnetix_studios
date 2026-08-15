"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Type, Image as ImageIcon, Video,
  MousePointerClick, LayoutGrid, Minus, MoveVertical, Copy, Eye, Sparkles, User, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SHORTCODE_CATALOG } from "@/lib/energetics/shortcodes";
import { CHART_RULE_ATTRIBUTES, CHART_RULE_OPERATORS, type ChartRuleCondition } from "@/lib/energetics/chart-rules";
import type {
  ReportDesign, ReportPage, ReportBlock, ReportBlockType, ChartPieceKind,
} from "@/types/report-blocks";

interface ReadingOption {
  id: string;
  name: string;
  birthDate: string;
}

/**
 * Report Builder editor — Phase 2 (2026-08-09). Real drag-and-drop block
 * editing, built against the block schema from Phase 1. Deliberately an
 * ordered flow (drag to reorder via @dnd-kit/sortable — already a project
 * dependency, reused here for the first time) rather than Bodygraph's free
 * x/y canvas; see report-blocks.ts for why. Shortcode insertion is
 * click-to-copy for v1 (click a token, it's on the clipboard, paste it
 * into the text you're writing) rather than cursor-position insertion —
 * simpler, still fully functional, real follow-up if it's ever worth the
 * extra UI work.
 */
const BLOCK_TYPES: { type: ReportBlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "video", label: "Video", icon: Video },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "chart", label: "Chart", icon: LayoutGrid },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
];

const CHART_PIECES: { value: ChartPieceKind; label: string }[] = [
  { value: "human-design-full", label: "Human Design — Full Chart" },
  { value: "human-design-mandala", label: "Human Design — Mandala" },
  { value: "human-design-gates", label: "Human Design — Gates Table" },
  { value: "astrology-wheel", label: "Astrology — Natal Wheel" },
  { value: "frequency-hologenetic", label: "Frequency — Hologenetic Profile" },
];

function newBlockId(): string {
  return crypto.randomUUID();
}

/** Human-readable summary of a page's visibleIf, for the sidebar badge tooltip. */
function describeVisibleIf(condition: ChartRuleCondition): string {
  const attr = CHART_RULE_ATTRIBUTES.find((a) => a.value === condition.attribute)?.label ?? condition.attribute;
  const op = CHART_RULE_OPERATORS.find((o) => o.value === condition.operator)?.label ?? condition.operator;
  return `Only shown when ${attr} ${op} "${condition.value}"`;
}

function defaultBlockFor(type: ReportBlockType): ReportBlock {
  const base = { id: newBlockId(), widthPct: 100 as const };
  switch (type) {
    case "text":
      return { ...base, type: "text", html: "", align: "left" };
    case "image":
      return { ...base, type: "image", url: "", alt: "" };
    case "video":
      return { ...base, type: "video", url: "" };
    case "button":
      return { ...base, type: "button", label: "Click here", action: { kind: "url", href: "", newTab: true } };
    case "chart":
      return { ...base, type: "chart", piece: "human-design-full" };
    case "divider":
      return { ...base, type: "divider" };
    case "spacer":
      return { ...base, type: "spacer", heightPx: 40 };
  }
}

export function ReportEditor({ subAccountId, initial }: { subAccountId: string; initial: ReportDesign }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [pages, setPages] = useState<ReportPage[]>(initial.pages);
  const [activePageId, setActivePageId] = useState(initial.pages[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [readings, setReadings] = useState<ReadingOption[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];

  function updateActivePage(updater: (page: ReportPage) => ReportPage) {
    setPages((prev) => prev.map((p) => (p.id === activePage.id ? updater(p) : p)));
  }

  function addPage() {
    const page: ReportPage = { id: newBlockId(), title: `Page ${pages.length + 1}`, visibleIf: null, blocks: [] };
    setPages((prev) => [...prev, page]);
    setActivePageId(page.id);
  }

  function removePage(id: string) {
    if (pages.length === 1) {
      toast.error("A report needs at least one page.");
      return;
    }
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    if (activePageId === id) setActivePageId(next[0].id);
  }

  function addBlock(type: ReportBlockType) {
    updateActivePage((p) => ({ ...p, blocks: [...p.blocks, defaultBlockFor(type)] }));
  }

  function updateBlock(blockId: string, updater: (b: ReportBlock) => ReportBlock) {
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
    }));
  }

  function removeBlock(blockId: string) {
    updateActivePage((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updateActivePage((p) => {
      const oldIndex = p.blocks.findIndex((b) => b.id === active.id);
      const newIndex = p.blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return p;
      return { ...p, blocks: arrayMove(p.blocks, oldIndex, newIndex) };
    });
  }

  /** Returns whether the save actually succeeded — Preview relies on this to refuse to open against stale state. */
  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, pages }),
      });
      if (!res.ok) throw new Error();
      toast.success("Report saved.");
      return true;
    } catch {
      toast.error("Couldn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function copyShortcode(token: string) {
    navigator.clipboard.writeText(`{{${token}}}`).then(() => toast.success(`Copied {{${token}}}`));
  }

  /**
   * Preview (2026-08-12) — saves the current draft first (never previews
   * stale unsaved state; if the save fails, this stops here and the
   * existing `save()` error toast is the only feedback needed), then opens
   * the source chooser. Readings are fetched lazily, once, the first time
   * Preview is actually used.
   */
  async function openPreview() {
    setPreviewSaving(true);
    const ok = await save();
    setPreviewSaving(false);
    if (!ok) return;

    setPreviewOpen(true);
    if (readings === null) {
      fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`)
        .then((r) => r.json())
        .then((d) => setReadings(((d.readings ?? []) as ReadingOption[]).map((r) => ({ id: r.id, name: r.name, birthDate: r.birthDate }))))
        .catch(() => setReadings([]));
    }
  }

  function launchPreview(params: URLSearchParams) {
    window.open(`/sa/${subAccountId}/energetic-decoder/reports/${initial.id}/preview?${params}`, "_blank");
    setPreviewOpen(false);
  }

  return (
    <div className="momentum-scope mx-auto flex min-h-screen w-full max-w-[1400px] gap-6 rounded-2xl p-6">
      {/* Left: pages */}
      <div className="w-56 shrink-0 space-y-4">
        <button
          onClick={() => router.push(`/sa/${subAccountId}/energetic-decoder?tab=builder`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pages</p>
          <div className="space-y-1">
            {pages.map((p, i) => (
              <div key={p.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setActivePageId(p.id)}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 truncate rounded-lg px-2.5 py-1.5 text-left text-sm",
                    p.id === activePageId ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="truncate">{i + 1}. {p.title}</span>
                  {p.visibleIf && (
                    <span title={describeVisibleIf(p.visibleIf)} className="shrink-0">
                      <Filter className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </span>
                  )}
                </button>
                <button
                  onClick={() => removePage(p.id)}
                  className="opacity-0 text-muted-foreground hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={addPage}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add page
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add block</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.type}
                onClick={() => addBlock(bt.type)}
                className="flex flex-col items-center gap-1 rounded-lg border py-2.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                <bt.icon className="h-4 w-4" />
                {bt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shortcodes</p>
          <p className="mb-2 px-1 text-[11px] text-muted-foreground">Click to copy, paste into a Text block — fills in each reader&apos;s real chart.</p>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {SHORTCODE_CATALOG.map((s) => (
              <button
                key={s.token}
                onClick={() => copyShortcode(s.token)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs text-foreground hover:bg-muted"
              >
                {s.label}
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center: canvas */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-md border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openPreview} disabled={saving || previewSaving}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              {previewSaving ? "Saving…" : "Preview"}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="min-h-[600px] rounded-2xl border bg-background p-8 shadow-sm">
          <Input
            value={activePage.title}
            onChange={(e) => updateActivePage((p) => ({ ...p, title: e.target.value }))}
            placeholder="Page title"
            className="mb-3 border-none bg-transparent px-0 text-sm font-semibold text-muted-foreground shadow-none focus-visible:ring-0"
          />
          <PageVisibilityEditor
            value={activePage.visibleIf}
            onChange={(visibleIf) => updateActivePage((p) => ({ ...p, visibleIf }))}
          />
          {activePage.blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              Add a block from the left to start this page.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activePage.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {activePage.blocks.map((block) => (
                    <SortableBlock key={block.id} block={block} onChange={updateBlock} onRemove={removeBlock} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Preview against…</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <button
              type="button"
              onClick={() => launchPreview(new URLSearchParams({ source: "sample" }))}
              className="flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium hover:border-primary hover:text-primary"
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              Sample Data
              <span className="ml-auto text-xs font-normal text-muted-foreground">no real reading needed</span>
            </button>

            <div>
              <p className="mb-1.5 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Existing readings
              </p>
              {readings === null ? (
                <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
              ) : readings.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No readings yet in this sub-account — use Sample Data above.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {readings.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => launchPreview(new URLSearchParams({ source: "reading", readingId: r.id }))}
                      className="flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2 text-left text-sm hover:border-primary hover:text-primary"
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.birthDate}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Page-level visibility condition — the UI half of `ReportPage.visibleIf`,
 * which had real data-model support (report-blocks.ts) and a real
 * evaluation engine (chart-rules.ts) since Phase 1/2, but no way to
 * actually turn it on until now (2026-08-09, her direct ask: "can we
 * create one?"). Same attribute/operator/value shape as course-lesson
 * chart-gating's ChartUnlockEditor — mirrors Bodygraph's own per-page
 * "Visible for everyone" toggle.
 */
function PageVisibilityEditor({
  value,
  onChange,
}: {
  value: ChartRuleCondition | null;
  onChange: (next: ChartRuleCondition | null) => void;
}) {
  const enabled = value !== null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
      <label className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(e.target.checked ? { attribute: "type", operator: "equals", value: "" } : null)
          }
          className="h-3.5 w-3.5"
        />
        Only show this page when
      </label>
      {enabled && value && (
        <>
          <select
            value={value.attribute}
            onChange={(e) => onChange({ ...value, attribute: e.target.value as ChartRuleCondition["attribute"] })}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            {CHART_RULE_ATTRIBUTES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <select
            value={value.operator}
            onChange={(e) => onChange({ ...value, operator: e.target.value as ChartRuleCondition["operator"] })}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            {CHART_RULE_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Input
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            placeholder="e.g. Projector"
            className="h-7 w-36 text-xs"
          />
        </>
      )}
    </div>
  );
}

function SortableBlock({
  block,
  onChange,
  onRemove,
}: {
  block: ReportBlock;
  onChange: (id: string, updater: (b: ReportBlock) => ReportBlock) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="group flex items-start gap-2 rounded-xl border bg-card p-4">
      <button {...attributes} {...listeners} className="mt-1 cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <BlockFields block={block} onChange={(updater) => onChange(block.id, updater)} />
      </div>
      <button onClick={() => onRemove(block.id)} className="mt-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BlockFields({ block, onChange }: { block: ReportBlock; onChange: (updater: (b: ReportBlock) => ReportBlock) => void }) {
  switch (block.type) {
    case "text":
      return (
        <Textarea
          value={block.html}
          onChange={(e) => onChange((b) => (b.type === "text" ? { ...b, html: e.target.value } : b))}
          placeholder="Write this page's text — paste a {{shortcode}} to personalize it."
          className="min-h-[80px] resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      );
    case "image":
      return (
        <div className="space-y-2">
          <Input
            value={block.url}
            onChange={(e) => onChange((b) => (b.type === "image" ? { ...b, url: e.target.value } : b))}
            placeholder="Image URL"
          />
          <Input
            value={block.alt}
            onChange={(e) => onChange((b) => (b.type === "image" ? { ...b, alt: e.target.value } : b))}
            placeholder="Alt text"
          />
          {block.url && <img src={block.url} alt={block.alt} className="mt-2 max-h-40 rounded-lg border object-cover" />}
        </div>
      );
    case "video":
      return (
        <Input
          value={block.url}
          onChange={(e) => onChange((b) => (b.type === "video" ? { ...b, url: e.target.value } : b))}
          placeholder="YouTube/Vimeo URL"
        />
      );
    case "button":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={block.label}
            onChange={(e) => onChange((b) => (b.type === "button" ? { ...b, label: e.target.value } : b))}
            placeholder="Button label"
          />
          <Input
            value={block.action.kind === "url" ? block.action.href : ""}
            onChange={(e) =>
              onChange((b) => (b.type === "button" ? { ...b, action: { kind: "url", href: e.target.value, newTab: true } } : b))
            }
            placeholder="https://…"
          />
        </div>
      );
    case "chart":
      return (
        <select
          value={block.piece}
          onChange={(e) => onChange((b) => (b.type === "chart" ? { ...b, piece: e.target.value as ChartPieceKind } : b))}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          {CHART_PIECES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      );
    case "divider":
      return <div className="h-px w-full bg-border" />;
    case "spacer":
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Height (px)</span>
          <Input
            type="number"
            value={block.heightPx}
            onChange={(e) => onChange((b) => (b.type === "spacer" ? { ...b, heightPx: Number(e.target.value) || 0 } : b))}
            className="w-24"
          />
        </div>
      );
  }
}
