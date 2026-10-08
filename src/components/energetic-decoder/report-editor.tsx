"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FilePlus2,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  Lock,
  PanelLeft,
  Plus,
  Redo2,
  Save,
  Shapes,
  Trash2,
  Type,
  Undo2,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { SHORTCODE_CATALOG } from "@/lib/energetics/shortcodes";
import { MediaPickerDialog } from "@/components/assets/media-picker-dialog";
import type { MediaLibraryItem } from "@/types/media-library";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { GeneKeysChart } from "@/components/energetic-decoder/gene-keys-chart";
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
  { type: "image", label: "Images", icon: ImageIcon },
  { type: "chart", label: "Charts", icon: Grid2X2 },
  { type: "shortcode", label: "Shortcodes", icon: WandSparkles },
  { type: "shape", label: "Shapes", icon: Shapes },
  { type: "frame", label: "Frames", icon: PanelLeft },
  { type: "graphic", label: "Graphics", icon: WandSparkles },
  { type: "upload", label: "Uploads", icon: UploadCloud },
];

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
  const [panel, setPanel] = useState<"elements" | "pages" | "layers" | null>(
    "elements"
  );
  const [mobileDrawer, setMobileDrawer] = useState<
    "elements" | "pages" | "layers" | "element" | "page" | null
  >(null);
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 28 : 60));
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
  function deleteElement(elementId: string) {
    updatePage((p) => ({ ...p, elements: (p.elements ?? []).filter((e) => e.id !== elementId) }));
    setSelectedId(null);
  }
  function addElement(type: ReportElementType) {
    const e = newElement(type, elements.length);
    updatePage((p) => ({ ...p, elements: [...(p.elements ?? []), e] }));
    setSelectedId(e.id);
    setPanel("layers");
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
  function insertTemplate(name: string) {
    const p: ReportPage = { id: id(), title: `${name} page`, visibleIf: null, blocks: [], elements: [newElement("text", 0), newElement(name === "Chart" ? "chart" : "shape", 1)] };
    p.elements = (p.elements ?? []).map((e, i) => ({ ...e, geometry: { ...e.geometry, x: 72, y: 90 + i * 150 }, payload: e.type === "text" ? { text: `${name} — Magnetix structural template` } : e.payload }));
    commit([...pages, p]);
    toast.success(`${name} template inserted`);
  }
  function duplicatePage() {
    const copy = {
      ...activePage,
      id: id(),
      title: `${activePage.title} copy`,
      elements: elements.map((e, i) => ({
        ...e,
        id: id(),
        zIndex: i,
        geometry: { ...e.geometry, x: e.geometry.x + 12, y: e.geometry.y + 12 },
      })),
    };
    commit([...pages, copy]);
    setActivePageId(copy.id);
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
      JSON.stringify({ title, pages, contentSetId, layoutVersion: 2, pageSize })
    );
    const query = new URLSearchParams({ source: "sample", draft: "1", contentSetId });
    window.open(`/sa/${subAccountId}/energetic-decoder/reports/${initial.id}/preview?${query}`, "_blank");
  }

  function openMobileDrawer(drawer: NonNullable<typeof mobileDrawer>) {
    setPanel(drawer === "layers" ? "layers" : "elements");
    setMobileDrawer(drawer);
  }

  const renderElementsPanel = () => (
    <>
      <input
        placeholder="Search elements…"
        className="h-9 w-full rounded-lg border px-3 text-sm"
      />
      {tools.map((t) => (
        <button
          key={t.type}
          onClick={() => addElement(t.type)}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-3 text-left text-sm transition hover:border-violet-200 hover:bg-[#fbf7ff]"
        >
          <t.icon className="h-5 w-5 text-violet-700" />
          {t.label}
          <Plus className="text-muted-foreground ml-auto h-4 w-4" />
        </button>
      ))}
      <div className="text-muted-foreground border-t pt-3 text-xs font-semibold tracking-wide uppercase">
        Template library
      </div>
      {["Cover", "About", "Chart", "Summary", "Type", "Strategy", "Authority", "Profile", "Centers", "Channels", "Gates", "Astrology", "Frequency", "Closing", "Blank"].map((x) => (
        <button
          key={x}
          onClick={() => insertTemplate(x)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-violet-50"
        >
          {x}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ))}
    </>
  );

  const renderPagesPanel = () => (
    <PagePanel
      pages={pages}
      activePageId={activePageId}
      setActivePageId={setActivePageId}
      addPage={addPage}
      duplicatePage={duplicatePage}
      deletePage={deletePage}
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
      onSelect={setSelectedId}
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
    <div className="min-h-screen bg-[#fbfaff] text-[#18204a] dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1600px] px-3 py-3 sm:px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
          <div className="pointer-events-none absolute -top-20 right-24 h-36 w-64 rounded-full bg-[radial-gradient(circle_at_70%_30%,#fff4cf,transparent_10%),radial-gradient(ellipse,#efe3ff,transparent_65%)] opacity-90" />
          <div className="relative flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              router.push(`/sa/${subAccountId}/energetic-decoder?tab=builder`)
            }
            className="text-muted-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="bg-border hidden h-6 w-px sm:block" />
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="min-w-[180px] flex-1 rounded-lg border border-transparent px-2 py-1 font-serif text-xl font-semibold outline-none focus:border-violet-200"
            aria-label="Report Design title"
          />
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
            {initial.status ?? "Draft"}
            {dirty ? " · Unsaved" : ""}
          </span>
          <button
            title="Undo"
            onClick={undo}
            className="rounded-lg p-2 hover:bg-violet-50"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            title="Redo"
            onClick={redo}
            className="rounded-lg p-2 hover:bg-violet-50"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <label className="hidden items-center gap-1 text-sm sm:flex">
            Zoom
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="rounded-lg border px-2 py-1"
            >
              <option value={40}>40%</option>
              <option value={60}>60%</option>
              <option value={75}>75%</option>
              <option value={100}>100%</option>
            </select>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-800"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={preview}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5420a8] px-4 py-2 text-sm font-semibold text-white"
          >
            <Eye className="h-4 w-4" /> Preview PDF
          </button>
          </div>
        </div>
        <div className="relative mt-4 grid min-h-[calc(100vh-110px)] grid-cols-1 gap-4 overflow-x-hidden lg:grid-cols-[250px_minmax(0,1fr)_280px]">
          <aside className="order-2 hidden max-h-72 overflow-y-auto rounded-2xl border border-violet-100 bg-white p-3 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 lg:order-none lg:block lg:max-h-none">
            <div className="flex gap-1 border-b pb-2">
              <button
                onClick={() => setPanel("elements")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${panel === "elements" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                <PanelLeft className="mr-1 inline h-4 w-4" />
                Elements
              </button>
              <button
                onClick={() => setPanel("pages")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${panel === "pages" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                Pages
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {panel === "elements" && renderElementsPanel()}
              {panel === "pages" && renderPagesPanel()}
            </div>
          </aside>
          <main className="order-1 h-[calc(100vh-185px)] min-h-[520px] min-w-0 overflow-auto rounded-2xl border border-violet-100 bg-[#f0edf7] p-4 shadow-inner dark:border-violet-900/40 dark:bg-slate-800 lg:order-none lg:h-auto lg:min-h-[calc(100vh-110px)]">
            <div
              className="report-canvas-stage mx-auto flex w-fit flex-col gap-6"
              style={{
                transform: `scale(${zoom / 60})`,
                transformOrigin: "top center",
              }}
            >
              {pages.map((p, i) => (
                <CanvasPage
                  key={p.id}
                  page={p}
                  index={i}
                  dimensions={pageDimensions}
                  elements={p.elements ?? []}
                  selectedId={selectedId}
                  onSelect={(elementId) => {
                    setActivePageId(p.id);
                    setSelectedId(elementId);
                    setPanel("layers");
                    if (window.innerWidth < 1024) setMobileDrawer("layers");
                  }}
                  onMove={(elementId, dx, dy) =>
                    updateElement(elementId, (e) => ({
                      ...e,
                      geometry: {
                        ...e.geometry,
                        x: Math.max(0, e.geometry.x + dx),
                        y: Math.max(0, e.geometry.y + dy),
                      },
                    }))
                  }
                  onResize={(elementId, dw, dh) => updateElement(elementId, (e) => ({ ...e, geometry: { ...e.geometry, width: Math.max(80, e.geometry.width + dw), height: Math.max(50, e.geometry.height + dh) } }))}
                  onRotate={(elementId, degrees) => updateElement(elementId, (e) => ({ ...e, geometry: { ...e.geometry, rotation: (e.geometry.rotation ?? 0) + degrees } }))}
                />
              ))}
            </div>
          </main>
          <aside className="order-3 hidden max-h-96 overflow-y-auto rounded-2xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-900 lg:order-none lg:block lg:max-h-none">
            <div className="flex gap-1 border-b pb-2">
              <button
                onClick={() => setPanel("layers")}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${panel === "layers" ? "bg-violet-100 text-violet-800" : ""}`}
              >
                <Layers3 className="mr-1 inline h-4 w-4" />
                Layers
              </button>
              <button
                onClick={() => setPanel("elements")}
                className="rounded-lg px-2 py-2 text-sm font-semibold"
              >
                Element
              </button>
            </div>
            {panel === "layers" ? renderLayerPanel() : renderElementPanel()}
          </aside>
          {mobileDrawer && (
            <>
              <button
                type="button"
                aria-label="Close tool drawer"
                onClick={() => setMobileDrawer(null)}
                className="fixed inset-0 z-30 bg-[#18204a]/25 lg:hidden"
              />
              <section className={`fixed inset-x-3 bottom-20 z-40 max-h-[min(72vh,760px)] overflow-y-auto rounded-3xl border border-violet-200 bg-white p-4 shadow-2xl dark:border-violet-900/50 dark:bg-slate-900 md:inset-y-3 md:bottom-3 md:top-3 md:max-h-none md:w-[min(360px,calc(100vw-24px))] lg:hidden ${mobileDrawer === "layers" || mobileDrawer === "element" || mobileDrawer === "page" ? "md:left-auto md:right-3 md:rounded-l-3xl md:rounded-r-none" : "md:right-auto md:left-3 md:rounded-l-none md:rounded-r-3xl"}`}>
                <div className="mb-3 flex items-center justify-between border-b border-violet-100 pb-3">
                  <h2 className="font-serif text-xl font-semibold text-[#18204a] dark:text-white">
                    {mobileDrawer === "elements" ? "Add Elements" : mobileDrawer === "pages" ? "Pages" : mobileDrawer === "layers" ? "Layers" : mobileDrawer === "page" ? "Page Settings" : "Element"}
                  </h2>
                  <button type="button" onClick={() => setMobileDrawer(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-violet-800 hover:bg-violet-50">Close</button>
                </div>
                <div className="space-y-2">
                  {mobileDrawer === "elements" && renderElementsPanel()}
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
              <button type="button" onClick={() => openMobileDrawer("pages")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "pages" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Pages</button>
            </div>
          </div>
          <div className="pointer-events-none fixed inset-y-0 right-3 z-40 hidden items-center md:flex lg:hidden">
            <div className="pointer-events-auto grid gap-1 rounded-2xl border border-violet-200 bg-white/95 p-2 shadow-xl backdrop-blur">
              <button type="button" onClick={() => openMobileDrawer("layers")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "layers" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Layers</button>
              <button type="button" onClick={() => openMobileDrawer("element")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "element" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Element</button>
              <button type="button" onClick={() => openMobileDrawer("page")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mobileDrawer === "page" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Page</button>
            </div>
          </div>
          <nav aria-label="Responsive builder tools" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-2xl border border-violet-200 bg-white/95 p-2 shadow-xl backdrop-blur md:hidden lg:hidden">
            <button type="button" onClick={() => openMobileDrawer("elements")} className={`rounded-xl px-1 py-2 text-xs font-semibold ${mobileDrawer === "elements" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Elements</button>
            <button type="button" onClick={() => openMobileDrawer("pages")} className={`rounded-xl px-1 py-2 text-xs font-semibold ${mobileDrawer === "pages" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Pages</button>
            <button type="button" onClick={() => openMobileDrawer("layers")} className={`rounded-xl px-1 py-2 text-xs font-semibold ${mobileDrawer === "layers" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Layers</button>
            <button type="button" onClick={() => openMobileDrawer("element")} className={`rounded-xl px-1 py-2 text-xs font-semibold ${mobileDrawer === "element" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Element</button>
            <button type="button" onClick={() => openMobileDrawer("page")} className={`rounded-xl px-1 py-2 text-xs font-semibold ${mobileDrawer === "page" ? "bg-violet-100 text-violet-800" : "text-[#18204a]"}`}>Page</button>
          </nav>
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
      <style jsx>{`@media (max-width: 640px) { .report-canvas-stage { transform: scale(.42) !important; transform-origin: top left !important; margin-left: 0 !important; } }`}</style>
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
}: {
  pages: ReportPage[];
  activePageId: string;
  setActivePageId: (id: string) => void;
  addPage: () => void;
  duplicatePage: () => void;
  deletePage: (id: string) => void;
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
            <span className="min-w-0 flex-1 truncate">{p.title}</span>
          </button>
          <div className="mt-2 flex justify-end gap-1">
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
  const [tab, setTab] = useState<"element" | "page">(defaultTab);
  const [shortcodeSearch, setShortcodeSearch] = useState("");
  return (
    <div className="mt-3 space-y-4">
      <div className="flex gap-2 border-b pb-2 text-sm font-semibold">
        <button
          onClick={() => setTab("element")}
          className={
            tab === "element" ? "text-violet-700" : "text-muted-foreground"
          }
        >
          Element
        </button>
        <button
          onClick={() => setTab("page")}
          className={
            tab === "page" ? "text-violet-700" : "text-muted-foreground"
          }
        >
          Page
        </button>
      </div>
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
                <label className="text-xs">Font<input className="mt-1 h-8 w-full rounded border px-2" value={String(selected.style?.fontFamily ?? "Playfair Display")} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, fontFamily: e.target.value } }))} /></label>
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
          )}
          {(selected.type === "image" || selected.type === "upload") && (
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              <p className="font-medium">Media Library image</p>
              <p className="text-muted-foreground text-xs">Choose an existing approved image asset for this report.</p>
              <button type="button" onClick={onChooseImage} className="rounded-lg border px-3 py-2 text-sm font-medium text-violet-800">Choose image</button>
            </div>
          )}
          {(selected.type === "shape" || selected.type === "frame") && <label className="block text-sm font-medium">Background<input type="color" className="mt-1 h-9 w-full rounded border" value={selected.style?.backgroundColor ?? "#e8ddff"} onChange={(e) => update((x) => ({ ...x, style: { ...x.style, backgroundColor: e.target.value } }))} /></label>}
          <details open className="rounded-xl border border-violet-100 p-3"><summary className="cursor-pointer text-sm font-semibold">Position & size</summary><p className="text-muted-foreground mt-2 text-xs">Drag the selected element on canvas. Use the lower-right handle to resize and the top handle to rotate.</p></details>
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
            {CHART_RULE_ATTRIBUTES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
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
  index,
  dimensions,
  elements,
  selectedId,
  onSelect,
  onMove,
  onResize,
  onRotate,
}: {
  page: ReportPage;
  index: number;
  dimensions: { width: number; height: number };
  elements: ReportCanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, dw: number, dh: number) => void;
  onRotate: (id: string, degrees: number) => void;
}) {
  return (
    <section
      className="relative bg-white shadow-xl"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        background: page.pageBackground || "#fff",
      }}
    >
      <div className="text-muted-foreground absolute -top-6 left-0 flex items-center gap-2 text-xs">
        <span>Page {index + 1}</span>
        <span>{page.title}</span>
      </div>
      {elements.map((e) => (
        <CanvasElement
          key={e.id}
          element={e}
          selected={e.id === selectedId}
          onSelect={() => onSelect(e.id)}
          onMove={(dx, dy) => onMove(e.id, dx, dy)}
          onResize={(dw, dh) => onResize(e.id, dw, dh)}
          onRotate={(degrees) => onRotate(e.id, degrees)}
        />
      ))}
    </section>
  );
}

function CanvasElement({
  element,
  selected,
  onSelect,
  onMove,
  onResize,
  onRotate,
}: {
  element: ReportCanvasElement;
  selected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
  onRotate: (degrees: number) => void;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
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
      onClick={onSelect}
      onPointerDown={(e) => {
        if (element.locked) return;
        setDrag({ x: e.clientX, y: e.clientY });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        onMove((e.clientX - drag.x) / 1, (e.clientY - drag.y) / 1);
        setDrag({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={() => setDrag(null)}
      className={`absolute overflow-hidden text-left ${selected ? "ring-2 ring-violet-600 ring-offset-2" : "hover:ring-1 hover:ring-violet-300"}`}
      style={{
        left: element.geometry.x,
        top: element.geometry.y,
        width: element.geometry.width,
        height: element.geometry.height,
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
        element.payload.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={String(element.payload.url)} alt={String(element.payload.alt ?? "Report image")} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 text-sm text-violet-800">Choose an image asset</div>
      ) : (
        <span>{label}</span>
      )}
      {selected && !element.locked && <span className="absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-violet-700" onPointerDown={(e) => { e.stopPropagation(); const start = { x: e.clientX, y: e.clientY }; const move = (m: PointerEvent) => onResize(m.clientX - start.x, m.clientY - start.y); const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); }} />}
      {selected && !element.locked && <button type="button" aria-label="Rotate element" className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-fuchsia-600" onPointerDown={(e) => { e.stopPropagation(); onRotate(15); }}> </button>}
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
