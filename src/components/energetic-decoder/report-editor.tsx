"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Info,
  Grid2X2,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Layers3,
  Lock,
  MousePointer2,
  PanelLeft,
  Palette,
  Pencil,
  Redo2,
  Search,
  Save,
  Settings,
  Shapes,
  Trash2,
  Type,
  Undo2,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";
import { SHORTCODE_CATALOG } from "@/lib/energetics/shortcodes";
import { MediaPickerDialog } from "@/components/assets/media-picker-dialog";
import type { MediaLibraryItem } from "@/types/media-library";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { GeneKeysChart } from "@/components/energetic-decoder/gene-keys-chart";
import { CelestialDecoration } from "@/components/energetic-decoder/content-sets-visuals";
import { ZoomControl, clampZoom, type ZoomMode } from "@/components/energetic-decoder/report-zoom-control";
import {
  clampMoveToPage,
  clampResizeToPage,
  finishGesture,
  moveGesture,
  startGesture,
  type Gesture,
} from "@/components/energetic-decoder/report-drag-gesture";
import { resolveAstrologyColors } from "@/lib/energetics/astrology-spec";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { REPORT_BUILDER_FIXTURE_READING } from "@/lib/energetics/report-builder-fixture";
import {
  CHART_RULE_ATTRIBUTES,
  CHART_RULE_OPERATORS,
  type ChartRuleCondition,
} from "@/lib/energetics/chart-rules";
import type {
  ReportCanvasElement,
  ReportDesign,
  ReportElementType,
  ReportPage,
  ReportPageSize,
} from "@/types/report-blocks";

const PAGE = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
};
const tools: { type: ReportElementType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "chart", label: "Charts", icon: Grid2X2 },
  { type: "shortcode", label: "Shortcodes", icon: WandSparkles },
  { type: "shape", label: "Shapes", icon: Shapes },
  { type: "frame", label: "Frames", icon: PanelLeft },
  { type: "image", label: "Images", icon: ImageIcon },
  { type: "graphic", label: "Graphics", icon: WandSparkles },
  { type: "upload", label: "Uploads", icon: UploadCloud },
];
const PAGE_CONTEXT_HEIGHT = 44;

function id() {
  return crypto.randomUUID();
}
function legacyElements(page: ReportPage): ReportCanvasElement[] {
  if (page.elements) return page.elements;
  return page.blocks.map((b, i) => ({
    id: b.id,
    type: b.type,
    zIndex: i,
    geometry: {
      x: 48,
      y: 70 + i * 105,
      width: 720,
      height: b.type === "spacer" ? b.heightPx : 84,
    },
    style: {
      color: "#18204a",
      fontSize: b.type === "text" ? 20 : 14,
      align: b.type === "text" ? b.align : "left",
    },
    payload: b as unknown as Record<string, unknown>,
  }));
}
function initialPages(initial: ReportDesign): ReportPage[] {
  return initial.pages.map((p) => ({ ...p, elements: legacyElements(p) }));
}
function payloadFor(type: ReportElementType): Record<string, unknown> {
  if (type === "text") return { text: "Add text" };
  if (type === "image" || type === "upload") return { url: "", alt: "" };
  if (type === "chart") return { piece: "human-design-full" };
  if (type === "shortcode") return { token: "full_name" };
  if (type === "shape") return { shape: "rectangle" };
  if (type === "frame") return { shape: "rectangle", frame: true };
  return { name: "Energetic Decoder graphic" };
}
function newElement(
  type: ReportElementType,
  index: number
): ReportCanvasElement {
  return {
    id: id(),
    type,
    zIndex: index,
    geometry: {
      x: 60,
      y: 80 + index * 24,
      width: type === "text" ? 540 : 260,
      height: type === "text" ? 92 : 180,
    },
    style: {
      color: "#18204a",
      fontSize: type === "text" ? 24 : 14,
      backgroundColor: type === "shape" ? "#e8ddff" : undefined,
      borderColor: "#d8c5f5",
      borderWidth: 1,
      borderStyle: "solid",
    },
    payload: payloadFor(type),
  };
}

type RightPanel = "layers" | "element" | "page";

type TemplateDefinition = {
  id: string;
  category: string;
  name: string;
  description: string;
  accent: string;
  create: () => ReportPage;
};

function templatePage(name: string, elements: ReportCanvasElement[]): ReportPage {
  return { id: id(), title: name, visibleIf: null, blocks: [], elements };
}

function templateText(text: string, index: number, style: ReportCanvasElement["style"] = {}): ReportCanvasElement {
  const element = newElement("text", index);
  return { ...element, geometry: { ...element.geometry, x: 72, y: 96 + index * 120, width: 672, height: index === 0 ? 120 : 84 }, style: { ...element.style, ...style }, payload: { text } };
}

function templateShape(index: number, backgroundColor: string): ReportCanvasElement {
  const element = newElement("shape", index);
  return { ...element, geometry: { x: 72, y: 620, width: 672, height: 220, rotation: 0 }, style: { ...element.style, backgroundColor, borderRadius: 24 }, payload: { shape: "rectangle" } };
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "cover-luminous",
    category: "Cover",
    name: "Luminous cover",
    description: "A calm title page with a soft visual anchor.",
    accent: "#eadcff",
    create: () => templatePage("Luminous Cover", [templateText("Your Energetic Blueprint", 0, { fontSize: 42, fontFamily: "Playfair Display", fontWeight: 700 }), templateText("Magnetix Studios", 1, { fontSize: 18, color: "#5420a8" }), templateShape(2, "#eadcff")]),
  },
  {
    id: "cover-dawn",
    category: "Cover",
    name: "Dawn cover",
    description: "A warm introduction for a personal reading.",
    accent: "#f8e4cf",
    create: () => templatePage("Dawn Cover", [templateText("A map for alignment, purpose, and flow", 0, { fontSize: 32, fontFamily: "Playfair Display", fontWeight: 700 }), templateText("Prepared for {{full_name}}", 1, { fontSize: 18, color: "#8b5e34" }), templateShape(2, "#f8e4cf")]),
  },
  {
    id: "chart-overview",
    category: "Chart",
    name: "Chart overview",
    description: "A focused page for one chart and its headline.",
    accent: "#e3efff",
    create: () => {
      const chart = newElement("chart", 1);
      chart.geometry = { x: 72, y: 250, width: 672, height: 650 };
      return templatePage("Chart Overview", [templateText("Your chart", 0, { fontSize: 34, fontFamily: "Playfair Display", fontWeight: 700 }), chart]);
    },
  },
  {
    id: "summary-focus",
    category: "Summary",
    name: "Summary focus",
    description: "A concise page for a headline and personalized takeaway.",
    accent: "#e9f5ec",
    create: () => {
      const shortcode = newElement("shortcode", 2);
      shortcode.geometry = { x: 72, y: 430, width: 672, height: 90 };
      shortcode.payload = { token: "type_description" };
      return templatePage("Summary", [templateText("Your energetic signature", 0, { fontSize: 32, fontFamily: "Playfair Display", fontWeight: 700 }), templateText("A simple starting point for this reading.", 1, { fontSize: 18 }), shortcode]);
    },
  },
  {
    id: "blank-page",
    category: "Blank",
    name: "Blank page",
    description: "A clean page ready for your own composition.",
    accent: "#f4f1fa",
    create: () => templatePage("Blank page", []),
  },
];

function pageLabel(page: ReportPage, index: number): string {
  const ordinal = `Page ${index + 1}`;
  const title = page.title.trim();
  return !title || title.toLowerCase() === ordinal.toLowerCase() ? ordinal : `${ordinal} · ${title}`;
}

export function ReportEditor({
  subAccountId,
  initial,
}: {
  subAccountId: string;
  initial: ReportDesign;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [pages, setPages] = useState(initialPages(initial));
  const [activePageId, setActivePageId] = useState(initial.pages[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("element");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageOverviewOpen, setPageOverviewOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState("");
  const [mobileDrawer, setMobileDrawer] = useState<
    "elements" | "pages" | "layers" | "element" | "page" | null
  >(null);
  const [zoom, setZoom] = useState<ZoomMode>("fit-page");
  // Phones open at Fit Width. Decided after mount so server and client render the same first frame (no hydration mismatch).
  useEffect(() => {
    if (window.innerWidth < 640) setZoom("fit-width");
  }, []);
  const [fitScale, setFitScale] = useState(0.6);
  const [templateCategory, setTemplateCategory] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [contentSetId, setContentSetId] = useState(
    initial.contentSetId || "default"
  );
  const [sets, setSets] = useState<{ id: string; name: string }[]>([
    { id: "default", name: "Default" },
    { id: "local-review-custom", name: "Owner Review — Blank Frequency" },
  ]);
  const [pageSize, setPageSize] = useState<ReportPageSize>(
    initial.pageSize ?? "letter"
  );
  const [history, setHistory] = useState<ReportPage[][]>([]);
  const [future, setFuture] = useState<ReportPage[][]>([]);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [brand, setBrand] = useState(initial.brand ?? {});
  const [openVisibilityPageId, setOpenVisibilityPageId] = useState<string | null>(null);
  const canvasViewportRef = useRef<HTMLElement | null>(null);
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];
  const elements = useMemo(
    () =>
      activePage
        ? [...(activePage.elements ?? [])].sort((a, b) => a.zIndex - b.zIndex)
        : [],
    [activePage]
  );
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const pageDimensions = PAGE[pageSize === "custom" ? "letter" : pageSize];
  // The zoom percentage is the true scale: 100% = the page at its real size.
  const scale = typeof zoom === "number" ? clampZoom(zoom) / 100 : fitScale;
  const zoomPercent = Math.round(scale * 100);
  const pageGap = 24;
  const scaledStageWidth = pageDimensions.width * scale;
  const scaledStageHeight = (pages.length * (pageDimensions.height + PAGE_CONTEXT_HEIGHT) + Math.max(0, pages.length - 1) * pageGap) * scale;

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const width = Math.max(240, viewport.clientWidth - 32);
      const height = Math.max(240, viewport.clientHeight - 32);
      const widthScale = width / pageDimensions.width;
      const pageScale = Math.min(widthScale, height / (pageDimensions.height + PAGE_CONTEXT_HEIGHT));
      setFitScale(zoom === "fit-width" ? widthScale : pageScale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [pageDimensions.height, pageDimensions.width, zoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable || target?.closest("[contenteditable='true']")) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      event.preventDefault();
      deleteElement(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // deleteElement intentionally uses the current editor snapshot; the
    // listener is refreshed whenever selection or the active page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pages, activePageId]);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets`)
      .then((r) => r.json())
      .then((d) =>
        setSets([
          { id: "default", name: "Default" },
          { id: "local-review-custom", name: "Owner Review — Blank Frequency" },
          ...(d.sets ?? []).map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          })),
        ].filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i))
      )
      .catch(() => undefined);
  }, [subAccountId]);

  function commit(next: ReportPage[]) {
    setHistory((h) => [...h.slice(-29), pages]);
    setFuture([]);
    setPages(next);
    setDirty(true);
  }
  function updatePage(updater: (p: ReportPage) => ReportPage) {
    commit(pages.map((p) => (p.id === activePage.id ? updater(p) : p)));
  }
  function updateElement(
    elementId: string,
    updater: (e: ReportCanvasElement) => ReportCanvasElement
  ) {
    updatePage((p) => ({
      ...p,
      elements: (p.elements ?? []).map((e) =>
        e.id === elementId ? updater(e) : e
      ),
    }));
  }
  /** Updates one element on a specific page — one history step. */
  function updateElementOnPage(pageId: string, elementId: string, updater: (e: ReportCanvasElement) => ReportCanvasElement) {
    commit(pages.map((p) => (p.id === pageId ? { ...p, elements: (p.elements ?? []).map((e) => (e.id === elementId ? updater(e) : e)) } : p)));
  }
  function deleteElement(elementId: string) {
    updatePage((p) => ({ ...p, elements: (p.elements ?? []).filter((e) => e.id !== elementId) }));
    setSelectedId(null);
  }
  function addElement(type: ReportElementType) {
    const e = newElement(type, elements.length);
    updatePage((p) => ({ ...p, elements: [...(p.elements ?? []), e] }));
    setSelectedId(e.id);
    setRightPanel("element");
    setInspectorOpen(true);
    if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileDrawer("element");
    if (type === "image" || type === "upload") setAssetPickerOpen(true);
  }
  function addPage() {
    const p: ReportPage = {
      id: id(),
      title: `Page ${pages.length + 1}`,
      visibleIf: null,
      blocks: [],
      elements: [],
    };
    commit([...pages, p]);
    setActivePageId(p.id);
  }
  function insertTemplate(template: TemplateDefinition) {
    const p = template.create();
    commit([...pages, p]);
    setActivePageId(p.id);
    setTemplateCategory(null);
    toast.success(`${template.name} inserted`);
  }
  function duplicatePage(pageId = activePageId) {
    const source = pages.find((p) => p.id === pageId) ?? activePage;
    const copy = {
      ...source,
      id: id(),
      title: `${source.title} copy`,
      elements: (source.elements ?? []).map((e, i) => ({
        ...e,
        id: id(),
        zIndex: i,
        geometry: { ...e.geometry, x: e.geometry.x + 12, y: e.geometry.y + 12 },
      })),
    };
    commit([...pages, copy]);
    setActivePageId(copy.id);
  }
  function movePage(pageId: string, direction: -1 | 1) {
    const index = pages.findIndex((p) => p.id === pageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }
  function deletePage(pageId: string) {
    if (pages.length === 1)
      return toast.error("A report needs at least one page.");
    const next = pages.filter((p) => p.id !== pageId);
    commit(next);
    if (pageId === activePageId) setActivePageId(next[0].id);
  }
  function undo() {
    const prev = history.at(-1);
    if (!prev) return;
    setFuture((f) => [...f, pages]);
    setPages(prev);
    setHistory((h) => h.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setHistory((h) => [...h, pages]);
    setPages(next);
    setFuture((f) => f.slice(0, -1));
    setDirty(true);
  }
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${initial.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            pages,
            contentSetId,
            layoutVersion: 2,
            pageSize,
            brand,
          }),
        }
      );
      if (!res.ok) throw new Error();
      setDirty(false);
      toast.success("Report design saved.");
    } catch {
      toast.error("Couldn’t save report design.");
    } finally {
      setSaving(false);
    }
  }
  function preview() {
    sessionStorage.setItem(
      `report-design-draft:${initial.id}`,
      JSON.stringify({ title, pages, contentSetId, layoutVersion: 2, pageSize, brand })
    );
    const query = new URLSearchParams({ source: "sample", draft: "1", contentSetId });
    window.open(`/sa/${subAccountId}/energetic-decoder/reports/${initial.id}/preview?${query}`, "_blank");
  }

  /** Breadcrumb navigation: a real link, client-side routed, that asks before dropping unsaved edits. */
  function leaveEditor(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (dirty && !window.confirm("You have unsaved changes to this report design. Leave without saving?")) return;
    router.push(href);
  }

  function openMobileDrawer(drawer: NonNullable<typeof mobileDrawer>) {
    setMobileDrawer(drawer);
  }

  function toggleInspector(panel: RightPanel) {
    if (inspectorOpen && rightPanel === panel) {
      setInspectorOpen(false);
      return;
    }
    setRightPanel(panel);
    setInspectorOpen(true);
  }

  const openTool = (tool: string) => setTemplateCategory((current) => current === tool ? null : tool);
  const renderToolRail = () => (
    <div className="flex flex-col items-center gap-1.5">
      <button type="button" onClick={() => openTool("Templates")} className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold ${templateCategory === "Templates" ? "bg-violet-100 text-violet-800" : "text-[#18204a] hover:bg-violet-50"}`}><LayoutTemplate className="h-5 w-5 text-violet-700" />Templates</button>
      <button type="button" onClick={() => openTool("Branding")} className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold ${templateCategory === "Branding" ? "bg-violet-100 text-violet-800" : "text-[#18204a] hover:bg-violet-50"}`}><Palette className="h-5 w-5 text-violet-700" />Branding</button>
      {tools.map((t) => <button key={t.type} type="button" onClick={() => openTool(t.type)} className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold ${templateCategory === t.type ? "bg-violet-100 text-violet-800" : "text-[#18204a] hover:bg-violet-50"}`}><t.icon className="h-5 w-5 text-violet-700" />{t.label}</button>)}
    </div>
  );
  /** Phone Elements sheet (owner mockup): the SAME tools and handlers as the desktop rail, laid out as a grid. */
  const renderToolGrid = () => (
    <div className="grid grid-cols-4 gap-1.5 min-[375px]:grid-cols-5" data-tool-grid>
      {([{ key: "Templates", label: "Templates", icon: LayoutTemplate }, { key: "Branding", label: "Branding", icon: Palette }, ...tools.map((t) => ({ key: t.type as string, label: t.label, icon: t.icon }))]).map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" onClick={() => openTool(key)} aria-pressed={templateCategory === key} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-0.5 py-3 text-[10.5px] font-medium tracking-tight ${templateCategory === key ? "border-violet-300 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-[#18204a]"}`}>
          <Icon className="h-6 w-6 text-violet-700" strokeWidth={1.75} />
          <span className="w-full truncate text-center">{label}</span>
        </button>
      ))}
    </div>
  );
  const renderActiveToolPanel = () => {
    if (templateCategory === "Templates") return <div className="space-y-4"><div><p className="text-sm font-semibold text-[#18204a]">Template Library</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Existing starter templates for this release. Batch 2 will refine their authored content.</p></div><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder="Search templates…" className="h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-sm" /></label><div className="space-y-3">{TEMPLATE_DEFINITIONS.filter((template) => !templateSearch.trim() || `${template.name} ${template.category} ${template.description}`.toLowerCase().includes(templateSearch.trim().toLowerCase())).map((template) => <article key={template.id} className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm"><div className="flex h-28 items-center gap-3 p-3" style={{ background: `linear-gradient(135deg, ${template.accent} 0%, #ffffff 85%)` }}><div className="flex h-full w-20 shrink-0 flex-col justify-between rounded-md border border-white bg-white/90 p-2 shadow-sm"><span className="h-1.5 w-2/3 rounded bg-violet-200" /><span className="h-1.5 w-full rounded bg-slate-100" /><span className="h-10 rounded bg-gradient-to-br from-violet-100 via-white to-amber-100" /><span className="h-1.5 w-4/5 rounded bg-slate-100" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">{template.category}</p><p className="mt-1 text-sm font-semibold text-[#18204a]">{template.name}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{template.description}</p></div></div><div className="flex items-center justify-between gap-2 border-t border-violet-100 p-2.5"><span className="text-[11px] text-muted-foreground">Existing starter</span><button type="button" onClick={() => insertTemplate(template)} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white">Use template</button></div></article>)}</div></div>;
    if (templateCategory === "Branding") return <div className="space-y-3"><div><p className="text-sm font-semibold">Branding</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Uses the existing ReportDesign.brand fields. Changes are saved with this report.</p></div><label className="block text-xs font-semibold">Accent color<input type="color" value={brand.accentColor ?? "#5420a8"} onChange={(e) => { setBrand((b) => ({ ...b, accentColor: e.target.value })); setDirty(true); }} className="mt-1 h-9 w-full rounded border" /></label><label className="block text-xs font-semibold">Background color<input type="color" value={brand.backgroundColor ?? "#ffffff"} onChange={(e) => { setBrand((b) => ({ ...b, backgroundColor: e.target.value })); setDirty(true); }} className="mt-1 h-9 w-full rounded border" /></label><label className="block text-xs font-semibold">Logo URL<input value={brand.logoUrl ?? ""} onChange={(e) => { setBrand((b) => ({ ...b, logoUrl: e.target.value || null })); setDirty(true); }} placeholder="Optional approved logo URL" className="mt-1 h-9 w-full rounded border px-2" /></label></div>;
    const tool = tools.find((item) => item.type === templateCategory);
    if (!tool) return <p className="text-xs text-muted-foreground">Select a tool to open its panel.</p>;
    return <div className="space-y-4"><div><p className="text-sm font-semibold">{tool.label}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Choose a {tool.label.toLowerCase()} element to place on the active page.</p>{tool.type === "chart" && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900" data-sample-chart-note><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Charts in this editor and in Preview PDF use sample chart data. Generated reports use each person&apos;s own reading.</p>}</div><button type="button" onClick={() => addElement(tool.type)} className="w-full rounded-xl bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white">Add {tool.label.replace(/s$/, "")}</button></div>;
  };

  const renderPagesPanel = () => (
    <PagePanel
      pages={pages}
      activePageId={activePageId}
      setActivePageId={setActivePageId}
      addPage={addPage}
      duplicatePage={duplicatePage}
      deletePage={deletePage}
      movePage={movePage}
    />
  );

  const renderElementPanel = (defaultTab: "element" | "page" = "element") => (
    <ElementPanel
      selected={selected}
      sets={sets}
      contentSetId={contentSetId}
      setContentSetId={(v) => {
        setContentSetId(v);
        setDirty(true);
      }}
      pageSize={pageSize}
      setPageSize={(v) => {
        setPageSize(v);
        setDirty(true);
      }}
      update={(updater) => selected && updateElement(selected.id, updater)}
      visibilityOpen={visibilityOpen}
      setVisibilityOpen={setVisibilityOpen}
      activePage={activePage}
      updatePage={updatePage}
      onChooseImage={() => setAssetPickerOpen(true)}
      onDelete={() => selected && deleteElement(selected.id)}
      defaultTab={defaultTab}
    />
  );

  const renderLayerPanel = () => (
    <LayerPanel
      elements={elements}
      selectedId={selectedId}
      onSelect={(id) => { setSelectedId(id); setRightPanel("element"); setInspectorOpen(true); }}
      onMove={(from, to) => {
        const sorted = [...elements];
        const [item] = sorted.splice(from, 1);
        sorted.splice(to, 0, item);
        updatePage((p) => ({
          ...p,
          elements: sorted.map((e, i) => ({ ...e, zIndex: i })),
        }));
      }}
    />
  );

  return (
    <div className="report-builder-shell min-h-screen bg-[#fbfaff] text-[#18204a] dark:bg-slate-950 dark:text-slate-100 max-md:pb-[calc(var(--rb-toolbar-h)+1rem)] lg:min-h-0">
      {/* Desktop: the editor fills exactly the dashboard content area (100dvh − 64px top bar − 48px padding), so header,
          toolbar, canvas and the page strip are all on screen, as in the approved mockup. */}
      <div className="mx-auto max-w-[1600px] px-3 py-3 sm:px-5 lg:flex lg:h-[calc(100dvh-112px)] lg:min-h-[680px] lg:flex-col lg:px-2 lg:py-0">
        <section className="relative mb-3 shrink-0 overflow-hidden px-1 pb-1 pt-0 sm:px-2" data-report-header>
          <CelestialDecoration className="pointer-events-none absolute -right-2 -top-10 hidden h-[200px] w-[300px] md:block" />
          <div className="relative max-w-3xl md:pr-64 xl:pr-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium text-[#5264a6]"><a href={`/sa/${subAccountId}/energetic-decoder`} onClick={(e) => leaveEditor(e, `/sa/${subAccountId}/energetic-decoder`)} className="rounded hover:text-[#5420a8] hover:underline" data-breadcrumb="energetic-decoder">Energetic Decoder</a><ChevronRight className="h-4 w-4" /><a href={`/sa/${subAccountId}/energetic-decoder?tab=builder`} onClick={(e) => leaveEditor(e, `/sa/${subAccountId}/energetic-decoder?tab=builder`)} className="rounded hover:text-[#5420a8] hover:underline" data-breadcrumb="report-builder">Report Builder</a></nav>
            <div className="mt-2 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4e8ff] text-2xl text-violet-700">✦</span><h1 className="font-serif text-4xl font-semibold tracking-tight text-[#18204a] sm:text-[44px] sm:leading-[1.1]">Report Builder</h1></div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#5264a6]">Create beautiful, custom reports with a free-form editor. Design, personalize, and structure multi-page reports using templates, content blocks, and your brand elements.</p>
          </div>
        </section>
        {/* Editor toolbar (owner-approved mockup): title · status · undo/redo │ the one zoom system │ Save · Preview PDF. */}
        <div className="shrink-0 rounded-2xl border border-violet-100 bg-white px-3 py-2.5 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 sm:px-4" data-report-toolbar>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
            <div className="flex min-w-0 flex-[1_1_130px] items-center gap-2 sm:flex-[1_1_220px] lg:max-w-[300px]">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-violet-100 px-3 focus-within:border-violet-300">
                <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#18204a] outline-none dark:text-white" aria-label="Report Design title" />
                <Pencil className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
              </label>
            </div>
            <span className="shrink-0 rounded-lg bg-violet-100 px-3 py-1.5 text-[13px] font-semibold text-violet-800" data-report-status>
              {initial.status ?? "Draft"}
              {dirty ? " · Unsaved" : ""}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <button title="Undo" aria-label="Undo" onClick={undo} disabled={history.length === 0} className="rounded-lg p-2 text-[#18204a] hover:bg-violet-50 disabled:opacity-35">
                <Undo2 className="h-[18px] w-[18px]" />
              </button>
              <button title="Redo" aria-label="Redo" onClick={redo} disabled={future.length === 0} className="rounded-lg p-2 text-[#18204a] hover:bg-violet-50 disabled:opacity-35">
                <Redo2 className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="hidden h-7 w-px shrink-0 bg-violet-100 lg:block" />
            <ZoomControl mode={zoom} percent={zoomPercent} onChange={setZoom} />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-sm font-semibold text-violet-800 hover:bg-violet-50">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={preview} title="Opens a PDF preview of this design" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5420a8] px-4 text-sm font-semibold text-white hover:bg-[#4a1c94]">
                <Eye className="h-4 w-4" /> Preview PDF
              </button>
            </div>
          </div>
        </div>
        <div className={`relative mt-3 grid min-h-0 grid-cols-1 gap-4 overflow-x-hidden lg:mb-0 lg:min-h-0 lg:flex-1 ${templateCategory ? (inspectorOpen ? "lg:grid-cols-[92px_260px_minmax(0,1fr)_280px]" : "lg:grid-cols-[92px_260px_minmax(0,1fr)]") : (inspectorOpen ? "lg:grid-cols-[92px_minmax(0,1fr)_280px]" : "lg:grid-cols-[92px_minmax(0,1fr)]")}`}>
          <aside className="order-2 hidden min-h-0 overflow-y-auto rounded-2xl border border-violet-100 bg-white p-2 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 lg:order-none lg:block lg:w-[92px]">
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tools</p>
            {renderToolRail()}
          </aside>
          {templateCategory && <aside className="order-3 hidden min-h-0 overflow-y-auto rounded-2xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 lg:order-none lg:block lg:w-[260px]"><div className="mb-3 flex items-center justify-between border-b border-violet-100 pb-3"><p className="text-sm font-semibold">{templateCategory === "Templates" ? "Template Library" : templateCategory === "Branding" ? "Branding" : tools.find((t) => t.type === templateCategory)?.label}</p><button type="button" onClick={() => setTemplateCategory(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50">Close</button></div>{renderActiveToolPanel()}</aside>}
          {/* Canvas column: the scroll viewport and the page navigator are SIBLINGS.
              The navigator used to be absolutely positioned inside the
              overflow-auto viewport, so it scrolled with the page stack and
              landed mid-canvas in Fit Width. Zoom now only changes what is
              inside the viewport. */}
          <div className="order-1 flex min-h-0 min-w-0 flex-col gap-3 lg:order-none lg:h-full" data-canvas-column>
          <main ref={canvasViewportRef} className="relative h-[calc(100vh-185px)] min-h-[520px] min-w-0 overflow-auto rounded-2xl border border-violet-100 bg-[#f0edf7] p-4 shadow-inner dark:border-violet-900/40 dark:bg-slate-800 lg:h-auto lg:min-h-0 lg:flex-1" data-canvas-viewport>
            <div className="report-canvas-scale-box mx-auto shrink-0 overflow-hidden" style={{ width: scaledStageWidth, height: scaledStageHeight }}>
              <div
                className="report-canvas-stage flex w-fit flex-col gap-6"
                style={{ transform: `scale(${scale})`, transformOrigin: "top left", color: brand.accentColor ?? "#18204a" }}
              >
                {pages.map((p, i) => (
                  <CanvasPage
                    key={p.id}
                    page={p}
                    brandBackground={brand.backgroundColor}
                    brandAccent={brand.accentColor}
                    index={i}
                    dimensions={pageDimensions}
                    elements={p.elements ?? []}
                    visibilityOpen={openVisibilityPageId === p.id}
                    onToggleVisibility={() => { setRightPanel("page"); setInspectorOpen(true); setOpenVisibilityPageId(openVisibilityPageId === p.id ? null : p.id); }}
                    onUpdatePage={(updater) => commit(pages.map((page) => page.id === p.id ? updater(page) : page))}
                    onMovePage={movePage}
                    onDuplicatePage={() => duplicatePage(p.id)}
                    onDeletePage={() => deletePage(p.id)}
                    selectedId={selectedId}
                    active={p.id === activePage?.id}
                    scale={scale}
                    onActivate={() => setActivePageId(p.id)}
                    onClearSelection={() => setSelectedId(null)}
                    onSelect={(elementId, opts) => {
                      setActivePageId(p.id);
                      setSelectedId(elementId);
                      if (!opts?.openInspector) return;
                      setRightPanel("element");
                      setInspectorOpen(true);
                      // Phones/tablets: open the Element drawer on a click, not after a drag.
                      if (opts.openDrawer && window.innerWidth < 1024) setMobileDrawer("element");
                    }}
                    // Gestures write to THIS page (not whichever page is active); deltas arrive in page units, already clamped to the page.
                    onMove={(elementId, dx, dy) =>
                      updateElementOnPage(p.id, elementId, (e) => ({
                        ...e,
                        geometry: { ...e.geometry, x: Math.max(0, e.geometry.x + dx), y: Math.max(0, e.geometry.y + dy) },
                      }))
                    }
                    onResize={(elementId, dw, dh) => updateElementOnPage(p.id, elementId, (e) => ({ ...e, geometry: { ...e.geometry, width: Math.max(80, e.geometry.width + dw), height: Math.max(50, e.geometry.height + dh) } }))}
                    onRotate={(elementId, degrees) => updateElementOnPage(p.id, elementId, (e) => ({ ...e, geometry: { ...e.geometry, rotation: (e.geometry.rotation ?? 0) + degrees } }))}
                  />
                ))}
              </div>
            </div>
          </main>
            <nav aria-label="Pages" className="flex h-[64px] shrink-0 items-center gap-2 rounded-2xl border border-violet-100 bg-white px-2 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 md:hidden lg:flex" data-page-navigator>
              <button type="button" onClick={() => setPageOverviewOpen(true)} className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#18204a] hover:bg-violet-50" aria-label="Open page overview">
                <Grid2X2 className="h-4 w-4 text-violet-700" />
                <span>Page {Math.max(1, pages.findIndex((p) => p.id === activePageId) + 1)} / {pages.length}</span>
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Page thumbnails">
                {pages.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setActivePageId(p.id)} className={`flex w-14 shrink-0 flex-col gap-0.5 rounded-lg border p-1 text-left text-[9px] ${p.id === activePageId ? "border-violet-500 bg-violet-50" : "border-violet-100 bg-white hover:bg-violet-50"}`} aria-label={`Go to ${pageLabel(p, i)}`}>
                    <span className="flex h-8 items-center justify-center rounded border border-violet-100 bg-[#f3f0f9] p-0.5"><span className="h-full w-2/3 rounded-sm bg-white shadow-sm"><span className="mt-0.5 block h-0.5 w-2/3 rounded bg-violet-200" /><span className="mt-0.5 block h-4 rounded-sm bg-gradient-to-br from-violet-100 via-white to-amber-100" /></span></span>
                    <span className="truncate font-semibold text-[#18204a]">{i + 1}. {p.title || "Untitled"}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => toggleInspector("page")} aria-pressed={inspectorOpen && rightPanel === "page"} className={`hidden shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold lg:inline-flex ${inspectorOpen && rightPanel === "page" ? "bg-violet-100 text-violet-800" : "text-violet-800 hover:bg-violet-50"}`}>Page settings</button>
              <button type="button" onClick={addPage} className="flex h-[52px] w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-violet-300 text-[9px] font-semibold text-violet-800 hover:bg-violet-50"><FilePlus2 className="mb-0.5 h-3.5 w-3.5" />Add Page</button>
            </nav>
          </div>
          {inspectorOpen && <aside className="order-3 hidden min-h-0 overflow-y-auto rounded-2xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 lg:order-none lg:block">
            <div className="flex gap-1 border-b pb-2">
              <button
                onClick={() => toggleInspector("element")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${rightPanel === "element" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                <Type className="mr-1 inline h-4 w-4" />Element
              </button>
              <button
                onClick={() => toggleInspector("page")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${rightPanel === "page" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                <FileText className="mr-1 inline h-4 w-4" />Page
              </button>
              <button
                onClick={() => toggleInspector("layers")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${rightPanel === "layers" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                <Layers3 className="mr-1 inline h-4 w-4" />Layers
              </button>
            </div>
            {rightPanel === "layers" ? renderLayerPanel() : renderElementPanel(rightPanel === "page" ? "page" : "element")}
            <button type="button" onClick={() => setInspectorOpen(false)} className="mt-4 w-full rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-violet-50">Collapse inspector</button>
          </aside>}
          {mobileDrawer && (
            <>
              <button
                type="button"
                aria-label="Close tool drawer"
                onClick={() => setMobileDrawer(null)}
                className="fixed inset-0 z-30 bg-[#18204a]/25 lg:hidden"
              />
              <section data-mobile-sheet={mobileDrawer} className={`fixed inset-x-0 bottom-[var(--rb-sheet-bottom)] z-40 max-h-[calc(100dvh-var(--rb-sheet-bottom)-4.5rem)] overflow-y-auto rounded-t-3xl border border-violet-200 bg-white px-4 pb-4 pt-2 shadow-[0_-12px_40px_rgba(24,32,74,0.16)] md:rounded-3xl md:p-4 dark:border-violet-900/50 dark:bg-slate-900 md:inset-y-3 md:bottom-3 md:top-3 md:max-h-none md:w-[min(360px,calc(100vw-24px))] lg:hidden ${mobileDrawer === "layers" || mobileDrawer === "element" || mobileDrawer === "page" ? "md:left-auto md:right-3 md:rounded-l-3xl md:rounded-r-none" : "md:right-auto md:left-3 md:rounded-l-none md:rounded-r-3xl"}`}>
                <span aria-hidden className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-violet-100 md:hidden" />
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl font-semibold leading-tight text-[#18204a] dark:text-white">
                      {mobileDrawer === "elements" ? "Elements" : mobileDrawer === "pages" ? "Pages" : mobileDrawer === "layers" ? "Layers" : mobileDrawer === "page" ? "Page Settings" : "Element"}
                    </h2>
                    <p className="mt-0.5 text-sm text-[#5264a6]">
                      {mobileDrawer === "elements" ? "Add content to your report" : mobileDrawer === "pages" ? "Select, add and arrange pages" : mobileDrawer === "layers" ? "Everything on the active page" : mobileDrawer === "page" ? "Settings for the active page" : "Edit the selected element"}
                    </p>
                  </div>
                  <button type="button" aria-label="Close" onClick={() => setMobileDrawer(null)} className="shrink-0 rounded-full p-2 text-[#18204a] hover:bg-violet-50"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-2">
                  {mobileDrawer === "elements" && <>{renderToolGrid()}{templateCategory && <div className="mt-4 border-t border-violet-100 pt-4">{renderActiveToolPanel()}</div>}</>}
                  {mobileDrawer === "pages" && renderPagesPanel()}
                  {mobileDrawer === "layers" && renderLayerPanel()}
                  {mobileDrawer === "element" && renderElementPanel("element")}
                  {mobileDrawer === "page" && renderElementPanel("page")}
                </div>
              </section>
            </>
          )}
          <div className="pointer-events-none fixed inset-y-0 left-3 z-40 hidden items-center md:flex lg:hidden">
            <div className="pointer-events-auto grid gap-1 rounded-2xl border border-violet-200 bg-white/95 p-2 shadow-xl backdrop-blur">
              <button type="button" onClick={() => openMobileDrawer("elements")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "elements" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Elements</button>
              <button type="button" onClick={() => { setPageOverviewOpen(true); setMobileDrawer(null); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#18204a]">Pages</button>
            </div>
          </div>
          <div className="pointer-events-none fixed inset-y-0 right-3 z-40 hidden items-center md:flex lg:hidden">
            <div className="pointer-events-auto grid gap-1 rounded-2xl border border-violet-200 bg-white/95 p-2 shadow-xl backdrop-blur">
              <button type="button" onClick={() => openMobileDrawer("layers")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "layers" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Layers</button>
              <button type="button" onClick={() => openMobileDrawer("element")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "element" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Element</button>
              <button type="button" onClick={() => openMobileDrawer("page")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "page" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Page</button>
            </div>
          </div>
          {/* Phone contextual toolbar — directly ABOVE the CRM bottom tab bar (bottom = tab-bar height + 1px border +
              safe area + gap, see .report-builder-shell in globals.css), never in the same band. */}
          <nav aria-label="Responsive builder tools" data-rb-mobile-toolbar className="fixed inset-x-3 bottom-[var(--rb-toolbar-bottom)] z-40 grid h-[var(--rb-toolbar-h)] grid-cols-5 items-stretch gap-1 rounded-2xl border border-violet-100 bg-white/95 p-1.5 shadow-[0_6px_24px_rgba(24,32,74,0.12)] backdrop-blur md:hidden">
            {([
              { key: "elements", label: "Elements", icon: LayoutGrid },
              { key: "pages", label: "Pages", icon: FileText },
              { key: "layers", label: "Layers", icon: Layers3 },
              { key: "element", label: "Element", icon: MousePointer2 },
              { key: "page", label: "Page", icon: Settings },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={mobileDrawer === key}
                onClick={() => (mobileDrawer === key ? setMobileDrawer(null) : openMobileDrawer(key))}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${mobileDrawer === key ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}
              >
                <Icon className={`h-5 w-5 ${mobileDrawer === key ? "text-violet-700" : "text-[#18204a]"}`} strokeWidth={1.75} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
          {pageOverviewOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f6fc]/95 p-4 backdrop-blur-sm sm:p-8">
            <div className="mx-auto max-w-7xl rounded-3xl border border-violet-100 bg-white p-5 shadow-2xl sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-100 pb-5"><div><p className="text-sm font-semibold text-violet-700">Report Builder</p><h2 className="mt-1 font-serif text-3xl font-semibold text-[#18204a]">Pages</h2><p className="mt-1 text-sm text-muted-foreground">Select a page to return to the canvas.</p></div><button type="button" onClick={() => setPageOverviewOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold text-violet-800">Close</button></div>
              <label className="relative mt-5 block max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} placeholder="Search pages…" className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm" /></label>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{pages.map((p, i) => ({ p, i })).filter(({ p, i }) => !pageSearch.trim() || pageLabel(p, i).toLowerCase().includes(pageSearch.trim().toLowerCase())).map(({ p, i }) => <div key={p.id} className={`rounded-2xl border p-3 ${p.id === activePageId ? "border-violet-500 bg-violet-50/60" : "border-violet-100"}`}>
                <button type="button" onClick={() => { setActivePageId(p.id); setPageOverviewOpen(false); }} className="block w-full text-left"><div className="mb-3 flex h-52 items-center justify-center rounded-xl border border-violet-100 bg-[#f3f0f9] p-4"><div className="flex h-full w-3/5 flex-col gap-2 rounded bg-white p-3 shadow-sm"><span className="h-2 w-1/2 rounded bg-violet-200" /><span className="h-2 w-4/5 rounded bg-violet-100" /><span className="mt-3 h-20 rounded bg-gradient-to-br from-violet-100 via-white to-amber-100" /><span className="h-2 w-full rounded bg-slate-100" /><span className="h-2 w-4/5 rounded bg-slate-100" /></div></div><p className="truncate text-sm font-semibold text-[#18204a]">{pageLabel(p, i)}</p><p className="mt-1 text-xs text-muted-foreground">{p.visibleIf ? "Conditional visibility" : "Visible for everyone"}</p><p className="mt-1 text-xs text-muted-foreground">Page {i + 1}</p></button>
                <div className="mt-3 flex justify-end gap-1 border-t border-violet-100 pt-2"><button type="button" title="Move page up" disabled={i === 0} onClick={() => movePage(p.id, -1)} className="rounded-lg px-2 py-1 text-xs hover:bg-violet-50 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" title="Move page down" disabled={i === pages.length - 1} onClick={() => movePage(p.id, 1)} className="rounded-lg px-2 py-1 text-xs hover:bg-violet-50 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" title="Duplicate page" onClick={() => duplicatePage(p.id)} className="rounded-lg px-2 py-1 text-xs hover:bg-violet-50"><Copy className="h-3.5 w-3.5" /></button><button type="button" title="Delete page" onClick={() => deletePage(p.id)} className="rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
              </div>)}</div>
              <button type="button" onClick={addPage} className="mt-6 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white"><FilePlus2 className="mr-1 inline h-4 w-4" /> Add page</button>
            </div>
          </div>}
        </div>
      </div>
      <MediaPickerDialog
        subAccountId={subAccountId}
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        kind="image"
        onSelect={(item: MediaLibraryItem) => {
          if (!selectedId) return;
          updateElement(selectedId, (e) => ({ ...e, payload: { ...e.payload, assetId: item.id, url: item.publicUrl ?? item.thumbnailUrl ?? "", title: item.title, alt: item.title, fit: "cover" } }));
        }}
      />
      <style jsx>{`@media (max-width: 640px) { .report-canvas-stage { transform-origin: top left !important; } }`}</style>
    </div>
  );
}

function PagePanel({
  pages,
  activePageId,
  setActivePageId,
  addPage,
  duplicatePage,
  deletePage,
  movePage,
}: {
  pages: ReportPage[];
  activePageId: string;
  setActivePageId: (id: string) => void;
  addPage: () => void;
  duplicatePage: () => void;
  deletePage: (id: string) => void;
  movePage: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="space-y-2">
      <button
        onClick={addPage}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 py-2 text-sm font-semibold text-white"
      >
        <FilePlus2 className="h-4 w-4" /> Add page
      </button>
      {pages.map((p, i) => (
        <div
          key={p.id}
          className={`rounded-xl border p-2 ${p.id === activePageId ? "border-violet-500 bg-violet-50" : ""}`}
        >
          <button
            onClick={() => setActivePageId(p.id)}
            className="flex w-full items-center gap-2 text-left text-sm"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded bg-white text-xs font-bold">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{pageLabel(p, i)}</span>
          </button>
          <div className="mt-2 flex justify-end gap-1">
            <button title="Move page up" disabled={i === 0} onClick={() => movePage(p.id, -1)} className="rounded p-1 hover:bg-white disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button title="Move page down" disabled={i === pages.length - 1} onClick={() => movePage(p.id, 1)} className="rounded p-1 hover:bg-white disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button
              title="Duplicate page"
              onClick={duplicatePage}
              className="rounded p-1 hover:bg-white"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              title="Delete page"
              onClick={() => deletePage(p.id)}
              className="rounded p-1 hover:bg-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LayerPanel({
  elements,
  selectedId,
  onSelect,
  onMove,
}: {
  elements: ReportCanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-muted-foreground text-xs">
        Drag layer order with the arrows. Overlap is preserved on the page.
      </p>
      {[...elements].reverse().map((e, reverseIndex) => {
        const i = elements.length - reverseIndex - 1;
        return (
          <div
            key={e.id}
            className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${e.id === selectedId ? "border-violet-500 bg-violet-50" : ""}`}
          >
            <button
              onClick={() => onSelect(e.id)}
              className="min-w-0 flex-1 truncate text-left text-sm capitalize"
            >
              {e.type}
            </button>
            <button
              title="Move up"
              disabled={i === elements.length - 1}
              onClick={() => onMove(i, i + 1)}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              title="Move down"
              disabled={i === 0}
              onClick={() => onMove(i, i - 1)}
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-180" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ElementPanel({
  selected,
  sets,
  contentSetId,
  setContentSetId,
  pageSize,
  setPageSize,
  update,
  visibilityOpen,
  setVisibilityOpen,
  activePage,
  updatePage,
  onChooseImage,
  onDelete,
  defaultTab = "element",
}: {
  selected: ReportCanvasElement | null;
  sets: { id: string; name: string }[];
  contentSetId: string;
  setContentSetId: (id: string) => void;
  pageSize: ReportPageSize;
  setPageSize: (v: ReportPageSize) => void;
  update: (u: (e: ReportCanvasElement) => ReportCanvasElement) => void;
  visibilityOpen: boolean;
  setVisibilityOpen: (v: boolean) => void;
  activePage: ReportPage;
  updatePage: (u: (p: ReportPage) => ReportPage) => void;
  onChooseImage: () => void;
  onDelete: () => void;
  defaultTab?: "element" | "page";
}) {
  const [shortcodeSearch, setShortcodeSearch] = useState("");
  const tab = defaultTab;
  return (
    <div className="mt-3 space-y-4">
      {tab === "page" ? (
        <>
          <label className="block text-sm font-medium">
            Content Set
            <select
              value={contentSetId}
              onChange={(e) => setContentSetId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border px-2 text-sm"
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Page size
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as ReportPageSize)}
              className="mt-1 h-9 w-full rounded-lg border px-2 text-sm"
            >
              <option value="letter">US Letter</option>
              <option value="a4">A4</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Page title
            <input
              value={activePage.title}
              onChange={(e) =>
                updatePage((p) => ({ ...p, title: e.target.value }))
              }
              className="mt-1 h-9 w-full rounded-lg border px-2 text-sm"
            />
          </label>
          <button
            onClick={() => setVisibilityOpen(!visibilityOpen)}
            className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm"
          >
            <span>Visibility settings</span>
            {visibilityOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {visibilityOpen && (
            <VisibilityEditor
              value={activePage.visibleIf}
              onChange={(visibleIf) => updatePage((p) => ({ ...p, visibleIf }))}
            />
          )}
        </>
      ) : selected ? (
        <>
          <p className="text-sm font-semibold capitalize">
            {selected.type} element
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              X
              <input
                type="number"
                value={Math.round(selected.geometry.x)}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    geometry: { ...x.geometry, x: Number(e.target.value) },
                  }))
                }
                className="mt-1 h-8 w-full rounded border px-2"
              />
            </label>
            <label className="text-xs">
              Y
              <input
                type="number"
                value={Math.round(selected.geometry.y)}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    geometry: { ...x.geometry, y: Number(e.target.value) },
                  }))
                }
                className="mt-1 h-8 w-full rounded border px-2"
              />
            </label>
            <label className="text-xs">
              Width
              <input
                type="number"
                value={Math.round(selected.geometry.width)}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    geometry: { ...x.geometry, width: Number(e.target.value) },
                  }))
                }
                className="mt-1 h-8 w-full rounded border px-2"
              />
            </label>
            <label className="text-xs">
              Height
              <input
                type="number"
                value={Math.round(selected.geometry.height)}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    geometry: { ...x.geometry, height: Number(e.target.value) },
                  }))
                }
                className="mt-1 h-8 w-full rounded border px-2"
              />
            </label>
          </div>
          {selected.type === "text" && (
            <label className="block text-sm font-medium">
              Text
              <textarea
                value={String(selected.payload.text ?? "")}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    payload: { ...x.payload, text: e.target.value },
                  }))
                }
                className="mt-1 min-h-24 w-full rounded-lg border p-2 text-sm"
              />
            </label>
          )}
          {selected.type === "text" && (
            <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <label className="text-xs">Font<select className="mt-1 h-8 w-full rounded border px-2" value={(["Helvetica", "Times-Roman", "Courier"] as string[]).includes(String(selected.style?.fontFamily)) ? String(selected.style?.fontFamily) : "Times-Roman"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, fontFamily: e.target.value } }))}><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times Roman</option><option value="Courier">Courier</option></select></label>
                <label className="text-xs">Size<input type="number" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.fontSize ?? 24} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, fontSize: Number(e.target.value) } }))} /></label>
              </div>
              <div className="flex flex-wrap gap-1">
                {([["Bold", "fontWeight", selected.style?.fontWeight === 700], ["Italic", "italic", Boolean(selected.style?.italic)], ["Underline", "underline", Boolean(selected.style?.underline)]] as const).map(([label, key, active]) => <button type="button" key={key} onClick={() => update((x) => ({ ...x, style: { ...x.style, [key]: key === "fontWeight" ? (active ? 400 : 700) : !active } }))} className={`rounded-lg border px-2 py-1 text-xs ${active ? "bg-violet-200 text-violet-900" : "bg-white"}`}>{label}</button>)}
              </div>
              <div className="grid grid-cols-3 gap-1">{(["left", "center", "right"] as const).map((align) => <button type="button" key={align} onClick={() => update((x) => ({ ...x, style: { ...x.style, align } }))} className={`rounded border px-2 py-1 text-xs ${selected.style?.align === align ? "bg-violet-200" : "bg-white"}`}>{align}</button>)}</div>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs">Color<input type="color" className="mt-1 h-8 w-full rounded border" value={selected.style?.color ?? "#18204a"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, color: e.target.value } }))} /></label><label className="text-xs">Letter spacing<input type="number" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.letterSpacing ?? 0} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, letterSpacing: Number(e.target.value) } }))} /></label></div>
              <label className="text-xs">Line height<input type="number" step=".1" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.lineHeight ?? 1.4} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, lineHeight: Number(e.target.value) } }))} /></label>
            </div>
          )}
          {selected.type === "shortcode" && (
            <div className="space-y-2 text-sm font-medium">
              Shortcode
              <input value={shortcodeSearch} onChange={(e) => setShortcodeSearch(e.target.value)} placeholder="Search name, type, channel…" className="h-8 w-full rounded-lg border px-2 text-xs" />
              <select
                value={String(selected.payload.token ?? "full_name")}
                onChange={(e) =>
                  update((x) => ({
                    ...x,
                    payload: { ...x.payload, token: e.target.value },
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border px-2 text-sm"
              >
                {SHORTCODE_CATALOG.filter((s) => !shortcodeSearch || `${s.label} ${s.group} ${s.token}`.toLowerCase().includes(shortcodeSearch.toLowerCase())).map((s) => (
                  <option key={s.token} value={s.token}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selected.type === "chart" && (
            <>
            <label className="block text-sm font-medium">
              Chart piece
              <select value={String(selected.payload.piece ?? "human-design-full")} onChange={(e) => update((x) => ({ ...x, payload: { ...x.payload, piece: e.target.value } }))} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm">
                <option value="human-design-full">Human Design bodygraph</option>
                <option value="human-design-mandala">Human Design mandala</option>
                <option value="human-design-gates">Activated gates</option>
                <option value="astrology-wheel">Astrology wheel</option>
                <option value="frequency-hologenetic">Frequency / Hologenetic Profile</option>
              </select>
            </label>
            <p className="text-[11px] leading-5 text-muted-foreground" data-sample-chart-note>Shown here with sample chart data. Generated reports use each person&apos;s own reading.</p>
            </>
          )}
          {(selected.type === "image" || selected.type === "upload") && (
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              <p className="font-medium">Media Library image</p>
              <p className="text-muted-foreground text-xs">Choose an existing approved image asset for this report.</p>
              <button type="button" onClick={onChooseImage} className="rounded-lg border px-3 py-2 text-sm font-medium text-violet-800">Choose image</button>
            </div>
          )}
          <details open className="rounded-xl border border-violet-100 bg-violet-50/30 p-3"><summary className="cursor-pointer text-sm font-semibold">Appearance</summary><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs">Opacity<input type="number" min="0" max="1" step=".05" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.opacity ?? 1} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, opacity: Math.max(0, Math.min(1, Number(e.target.value))) } }))} /></label><label className="text-xs">Radius<input type="number" min="0" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.borderRadius ?? 0} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, borderRadius: Number(e.target.value) } }))} /></label></div><div className="mt-2 grid grid-cols-2 gap-2">{(selected.type === "shape" || selected.type === "frame") && <label className="text-xs">Background<input type="color" className="mt-1 h-8 w-full rounded border" value={selected.style?.backgroundColor ?? "#ffffff"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, backgroundColor: e.target.value } }))} /></label>}<label className="text-xs">Border<input type="color" className="mt-1 h-8 w-full rounded border" value={selected.style?.borderColor ?? "#d8c5f5"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, borderColor: e.target.value } }))} /></label></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Border width<input type="number" min="0" className="mt-1 h-8 w-full rounded border px-2" value={selected.style?.borderWidth ?? 0} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, borderWidth: Number(e.target.value) } }))} /></label><label className="text-xs">Border style<select className="mt-1 h-8 w-full rounded border px-1" value={selected.style?.borderStyle ?? "solid"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, borderStyle: e.target.value as "solid" | "dashed" | "none" } }))}><option value="solid">solid</option><option value="dashed">dashed</option><option value="none">none</option></select></label></div><p className="mt-2 text-[11px] text-muted-foreground">Stored in the report schema and rendered in the canvas and PDF.</p></details>
          <details open className="rounded-xl border border-violet-100 p-3"><summary className="cursor-pointer text-sm font-semibold">Position & size</summary><p className="text-muted-foreground mt-2 text-xs">Drag the selected element on canvas. Use the lower-right handle to resize and the top handle to rotate.</p></details>
          <details className="rounded-xl border border-violet-100 p-3"><summary className="cursor-pointer text-sm font-semibold">Arrange</summary><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => update((x) => ({ ...x, zIndex: x.zIndex + 1 }))}>Bring forward</button><button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => update((x) => ({ ...x, zIndex: Math.max(0, x.zIndex - 1) }))}>Send backward</button><button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => update((x) => ({ ...x, zIndex: 999 }))}>Bring to front</button><button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => update((x) => ({ ...x, zIndex: 0 }))}>Send to back</button></div></details>
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"><Trash2 className="h-3.5 w-3.5" /> Delete element</button>
          <div className="flex gap-2">
            <button
              onClick={() => update((x) => ({ ...x, locked: !x.locked }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <Lock className="mr-1 inline h-3.5 w-3.5" />
              {selected.locked ? "Unlock" : "Lock"}
            </button>
            <button
              onClick={() => update((x) => ({ ...x, hidden: !x.hidden }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {selected.hidden ? "Show" : "Hide"}
            </button>
          </div>
        </>
      ) : (
        <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-sm">
          Select an element on the canvas to edit it.
        </div>
      )}
    </div>
  );
}

function VisibilityEditor({
  value,
  onChange,
}: {
  value: ChartRuleCondition | null;
  onChange: (v: ChartRuleCondition | null) => void;
}) {
  const enabled = !!value;
  return (
    <div className="space-y-2 rounded-xl bg-violet-50 p-3 text-xs">
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { attribute: "type", operator: "equals", value: "Generator" }
                : null
            )
          }
        />{" "}
        Only show this page conditionally
      </label>
      {value && (
        <>
          <select
            value={value.attribute}
            onChange={(e) =>
              onChange({
                ...value,
                attribute: e.target.value as ChartRuleCondition["attribute"],
              })
            }
            className="h-8 w-full rounded border px-2"
          >
            {["Human Design", "Astrology"].map((group) => <optgroup key={group} label={group}>{CHART_RULE_ATTRIBUTES.filter((a) => a.group === group).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</optgroup>)}
          </select>
          <select
            value={value.operator}
            onChange={(e) =>
              onChange({
                ...value,
                operator: e.target.value as ChartRuleCondition["operator"],
              })
            }
            className="h-8 w-full rounded border px-2"
          >
            {CHART_RULE_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            className="h-8 w-full rounded border px-2"
          />
        </>
      )}
    </div>
  );
}

function CanvasPage({
  page,
  brandBackground,
  brandAccent,
  index,
  dimensions,
  elements,
  selectedId,
  active,
  scale,
  onActivate,
  onClearSelection,
  onSelect,
  onMove,
  onResize,
  onRotate,
  visibilityOpen,
  onToggleVisibility,
  onUpdatePage,
  onMovePage,
  onDuplicatePage,
  onDeletePage,
}: {
  page: ReportPage;
  brandBackground?: string;
  brandAccent?: string;
  index: number;
  dimensions: { width: number; height: number };
  elements: ReportCanvasElement[];
  selectedId: string | null;
  /** This is the active page (where Add Text etc. insert). */
  active: boolean;
  scale: number;
  onActivate: () => void;
  onClearSelection: () => void;
  onSelect: (id: string, opts?: { openInspector?: boolean; openDrawer?: boolean }) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, dw: number, dh: number) => void;
  onRotate: (id: string, degrees: number) => void;
  visibilityOpen: boolean;
  onToggleVisibility: () => void;
  onUpdatePage: (updater: (p: ReportPage) => ReportPage) => void;
  onMovePage: (id: string, direction: -1 | 1) => void;
  onDuplicatePage: () => void;
  onDeletePage: () => void;
}) {
  return (
    // Any press on the page (its chrome, blank area or an element) makes it
    // the active page — capture phase, so handles that stop propagation still count.
    <div className="relative" style={{ width: dimensions.width, height: dimensions.height + PAGE_CONTEXT_HEIGHT }} data-canvas-page={page.id} data-active-page={active || undefined} onPointerDownCapture={(e) => { if (e.button === 0 && !active) onActivate(); }}>
      <div className="mb-2 flex h-9 items-center gap-2 text-xs text-[#18204a]">
        <span className={`shrink-0 rounded-full px-2 py-1 font-semibold ${active ? "bg-violet-700 text-white" : "bg-violet-100 text-violet-900"}`} aria-current={active ? "page" : undefined}>{index + 1}</span>
        <input aria-label={`Page ${index + 1} title`} value={page.title} onChange={(e) => onUpdatePage((p) => ({ ...p, title: e.target.value }))} placeholder="Add page title" className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold outline-none focus:border-violet-300 focus:bg-white" />
        <button type="button" onClick={onToggleVisibility} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 ${page.visibleIf ? "border-violet-300 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-muted-foreground"}`} title="Edit page visibility">{page.visibleIf ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {page.visibleIf ? "Conditional" : "Everyone"}</button>
        <button type="button" onClick={() => onMovePage(page.id, -1)} disabled={index === 0} title="Move page up" className="rounded p-1 hover:bg-violet-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onMovePage(page.id, 1)} title="Move page down" className="rounded p-1 hover:bg-violet-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onDuplicatePage} title="Duplicate page" className="rounded p-1 hover:bg-violet-100"><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onDeletePage} title="Delete page" className="rounded p-1 hover:bg-violet-100"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {visibilityOpen && <div className="absolute left-0 top-10 z-20 w-[280px] rounded-xl border border-violet-200 bg-white p-3 shadow-xl"><div className="mb-2 flex items-center justify-between text-xs font-semibold"><span>Page visibility</span><button type="button" onClick={onToggleVisibility}>Close</button></div><VisibilityEditor value={page.visibleIf} onChange={(visibleIf) => onUpdatePage((p) => ({ ...p, visibleIf }))} /></div>}
      <section className="relative bg-white shadow-xl" onClick={(e) => { if (e.target === e.currentTarget) onClearSelection(); }} style={{ width: dimensions.width, height: dimensions.height, background: page.pageBackground || brandBackground || "#fff", borderTop: `4px solid ${brandAccent || "transparent"}` }}>
      {elements.map((e) => (
        <CanvasElement
          key={e.id}
          element={e}
          selected={e.id === selectedId}
          scale={scale}
          pageSize={dimensions}
          onSelect={(opts) => onSelect(e.id, opts)}
          onMove={(dx, dy) => onMove(e.id, dx, dy)}
          onResize={(dw, dh) => onResize(e.id, dw, dh)}
          onRotate={(degrees) => onRotate(e.id, degrees)}
        />
      ))}
      </section>
    </div>
  );
}

/**
 * One pointer gesture (drag or resize) with a complete lifecycle: started
 * by a primary press, previewed while the primary button is down, and
 * ended by pointerup / pointercancel / window blur / unmount — wherever the
 * pointer is when that happens. Move/up/cancel are window listeners, so a
 * release over another page, outside the canvas or after the browser drops
 * pointer capture still ends it. Commits once (one Undo step).
 */
function usePointerGesture({
  scale,
  clamp,
  onCommit,
}: {
  scale: number;
  clamp: () => (dx: number, dy: number) => { dx: number; dy: number };
  onCommit: (dx: number, dy: number) => void;
}) {
  const [preview, setPreview] = useState<{ dx: number; dy: number } | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const draggedRef = useRef(false);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  function end(commit: boolean) {
    const g = gestureRef.current;
    gestureRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setPreview(null);
    draggedRef.current = !!g?.active;
    const result = commit ? finishGesture(g) : null;
    if (result) commitRef.current(result.dx, result.dy);
  }

  useEffect(() => () => cleanupRef.current?.(), []);

  function begin(e: ReactPointerEvent<HTMLElement>) {
    const g = startGesture(e);
    if (!g) return;
    if (gestureRef.current) end(false);
    gestureRef.current = g;
    draggedRef.current = false;
    const clampFn = clamp();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort; window listeners below still see every event
    }
    const onMove = (ev: PointerEvent) => {
      const current = gestureRef.current;
      if (!current) return;
      const r = moveGesture(current, ev, scale, clampFn);
      if (r.kind === "released") return end(true);
      if (r.kind === "move") {
        gestureRef.current = r.gesture;
        if (r.gesture.active) setPreview({ dx: r.gesture.dx, dy: r.gesture.dy });
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (gestureRef.current && ev.pointerId === gestureRef.current.pointerId) end(true);
    };
    const onCancel = (ev: PointerEvent) => {
      if (gestureRef.current && ev.pointerId === gestureRef.current.pointerId) end(false);
    };
    const onBlur = () => end(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
    };
  }

  return {
    preview,
    begin,
    /** True once, right after a gesture that actually moved — lets the trailing click be ignored. */
    consumeDragged: () => {
      const d = draggedRef.current;
      draggedRef.current = false;
      return d;
    },
  };
}

function CanvasElement({
  element,
  selected,
  scale,
  pageSize,
  onSelect,
  onMove,
  onResize,
  onRotate,
}: {
  element: ReportCanvasElement;
  selected: boolean;
  /** Canvas zoom — pointer deltas are screen px, geometry is page units. */
  scale: number;
  pageSize: { width: number; height: number };
  onSelect: (opts?: { openInspector?: boolean; openDrawer?: boolean }) => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
  onRotate: (degrees: number) => void;
}) {
  const box = element.geometry;
  const drag = usePointerGesture({ scale, clamp: () => clampMoveToPage(box, pageSize), onCommit: onMove });
  const resizeGesture = usePointerGesture({ scale, clamp: () => clampResizeToPage(box, pageSize), onCommit: onResize });
  const resize = resizeGesture.preview ? { dw: resizeGesture.preview.dx, dh: resizeGesture.preview.dy } : null;
  const label =
    element.type === "text"
      ? String(element.payload.text ?? "Add text")
      : element.type === "shortcode"
        ? `{{${element.payload.token ?? "full_name"}}}`
        : element.type === "chart"
          ? "Human Design chart"
          : element.type === "shape"
            ? "Shape"
            : element.type === "frame"
              ? "Frame"
              : element.type === "image" || element.type === "upload"
                ? "Image asset"
                : "Graphic";
  return (
    <button
      type="button"
      data-canvas-element={element.id}
      onClick={() => {
        // Opens the inspector (and, on phones, the Element drawer — but not after a drag).
        const dragged = drag.consumeDragged();
        onSelect({ openInspector: true, openDrawer: !dragged });
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Select only; opening panels now would resize/rescale the canvas mid-drag.
        onSelect();
        if (!element.locked) drag.begin(e);
      }}
      onDragStart={(e) => e.preventDefault()}
      className={`absolute overflow-hidden text-left ${selected ? "ring-2 ring-violet-600 ring-offset-2" : "hover:ring-1 hover:ring-violet-300"}`}
      style={{
        left: element.geometry.x + (drag.preview?.dx ?? 0),
        top: element.geometry.y + (drag.preview?.dy ?? 0),
        // The page handles touch scrolling; on the element a touch is a drag (no pointercancel mid-gesture).
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        width: element.geometry.width + (resize?.dw ?? 0),
        height: element.geometry.height + (resize?.dh ?? 0),
        zIndex: element.zIndex,
        transform: `rotate(${element.geometry.rotation ?? 0}deg)`,
        opacity: element.hidden ? 0.25 : (element.style?.opacity ?? 1),
        color: element.style?.color || "#18204a",
        fontSize: element.style?.fontSize || 14,
        fontWeight: element.style?.fontWeight || 400,
        fontFamily: element.style?.fontFamily || "inherit",
        lineHeight: element.style?.lineHeight || 1.4,
        letterSpacing: element.style?.letterSpacing || 0,
        fontStyle: element.style?.italic ? "italic" : "normal",
        textDecoration: element.style?.underline ? "underline" : undefined,
        textAlign: element.style?.align || "left",
        background:
          element.type === "shape" || element.type === "frame"
            ? element.style?.backgroundColor || "#efe7ff"
            : "transparent",
        border: element.style?.borderWidth
          ? `${element.style.borderWidth}px ${element.style.borderStyle || "solid"} ${element.style.borderColor || "#d8c5f5"}`
          : undefined,
        borderRadius: element.style?.borderRadius || 0,
        padding: element.type === "text" ? 12 : 8,
      }}
    >
      {element.type === "chart" ? (
        <div className="h-full w-full overflow-hidden rounded bg-white">
          <FixtureChart piece={String(element.payload.piece ?? "human-design-full")} />
        </div>
      ) : element.type === "image" || element.type === "upload" ? (
        element.payload.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={String(element.payload.url)} alt={String(element.payload.alt ?? "Report image")} draggable={false} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 text-sm text-violet-800">Choose an image asset</div>
      ) : (
        <span>{label}</span>
      )}
      {selected && !element.locked && <span data-resize-handle className="absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize touch-none rounded-full border-2 border-white bg-violet-700" onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); resizeGesture.begin(e); }} />}
      {/* Not a <button>: the element itself is a <button>, and nested buttons are invalid HTML. */}
      {selected && !element.locked && <span role="button" tabIndex={0} aria-label="Rotate element" className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 cursor-pointer touch-none rounded-full border-2 border-white bg-fuchsia-600" onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); onRotate(15); }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onRotate(15); } }} />}
    </button>
  );
}

function FixtureChart({ piece }: { piece: string }) {
  const r = REPORT_BUILDER_FIXTURE_READING;
  if (piece === "astrology-wheel") return <AstrologyWheelChart chart={r.astrology} colors={resolveAstrologyColors({})} className="h-full w-full" />;
  if (piece === "human-design-mandala") return <MandalaChart profile={r.humanDesign} gateColor="#c8a7e8" backgroundColor="#fff" mandalaColors={resolveMandalaColors({})} className="h-full w-full" />;
  if (piece === "frequency-hologenetic") return <GeneKeysChart spheres={r.spheres} className="h-full w-full" />;
  return <HumanDesignChart profile={r.humanDesign} className="h-full w-full" />;
}
