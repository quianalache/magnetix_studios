"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  CalendarDays,
  Database,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Play,
  Search,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { assetsCall } from "@/lib/client/assets-api";
import { uploadToMediaLibrary } from "@/lib/client/media-library-upload";
import { uploadHostedVideo } from "@/lib/client/bunny-upload";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { MediaLibraryItem } from "@/types/media-library";
import { EmptyPanel, FilterSelect, formatBytes, formatDay, formatDuration, Pager, StatTile, TagPill } from "./assets-ui";
import { MediaDetail } from "./media-detail";

const PAGE_SIZE = 24;
const DAY = 86_400_000;

export interface MediaUploadRequest {
  kind: "file" | "video";
  nonce: number;
}

/**
 * Media Library — the canonical MediaAsset records of this sub-account.
 * Images/documents upload through the Media Library route; videos use the
 * existing Bunny hosted-video upload. Everything opens through short-lived
 * authorized URLs.
 */
export function MediaLibrary({ uploadRequest }: { uploadRequest: MediaUploadRequest | null }) {
  const { subAccountId, agencyId, isAdmin } = useSubAccount();
  const [items, setItems] = useState<MediaLibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [usage, setUsage] = useState("all");
  const [when, setWhen] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number | null }[]>([]);
  const [isXl, setIsXl] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await assetsCall<{ items: MediaLibraryItem[] }>(`/api/sub-accounts/${subAccountId}/media-library`);
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Details dock beside the grid from xl up; below that they open as a sheet.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setIsXl(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!uploadRequest) return;
    (uploadRequest.kind === "video" ? videoInput : fileInput).current?.click();
  }, [uploadRequest]);

  useEffect(() => setPage(1), [q, kind, usage, when, source, sort]);

  async function uploadFiles(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      const id = `${Date.now()}-${file.name}`;
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      try {
        const item = await uploadToMediaLibrary(subAccountId, file, {
          onProgress: (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: Math.round(p * 100) } : x))),
        });
        setItems((cur) => [item, ...(cur ?? [])]);
        toast.success(`Uploaded ${file.name}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id));
      }
    }
  }

  async function uploadVideo(file: File | undefined) {
    if (!file || !agencyId) return;
    const id = `${Date.now()}-${file.name}`;
    setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
    try {
      await uploadHostedVideo({
        ownerScope: { kind: "tenant", agencyId, subAccountId },
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        onProgress: (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
      });
      toast.success("Video uploaded — Bunny is processing it");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploads((u) => u.filter((x) => x.id !== id));
    }
  }

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      images: list.filter((i) => i.kind === "image").length,
      videos: list.filter((i) => i.kind === "video").length,
      documents: list.filter((i) => i.kind === "document").length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const now = Date.now();
    const list = (items ?? []).filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (source !== "all" && i.provider !== source) return false;
      if (usage === "used" && i.usage.length === 0) return false;
      if (usage === "unused" && i.usage.length > 0) return false;
      if (usage === "shared" && !(i.share && i.share.status === "active")) return false;
      if (when !== "all" && (!i.createdAt || now - Date.parse(i.createdAt) > Number(when) * DAY)) return false;
      return !s || [i.title, i.filename ?? "", ...i.tags].some((x) => x.toLowerCase().includes(s));
    });
    return list.sort((a, b) =>
      sort === "name" ? a.title.localeCompare(b.title) : sort === "size" ? (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) : (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    );
  }, [items, q, kind, usage, when, source, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = (items ?? []).find((i) => i.id === selectedId) ?? null;

  function replaceItem(next: MediaLibraryItem) {
    setItems((cur) => (cur ?? []).map((i) => (i.id === next.id ? next : i)));
  }

  function Thumb({ i, className }: { i: MediaLibraryItem; className?: string }) {
    const Icon = i.kind === "image" ? ImageIcon : i.kind === "video" ? Film : FileText;
    return (
      <span className={cn("bg-muted relative flex items-center justify-center overflow-hidden", className)}>
        {i.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={i.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : i.kind === "video" ? (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-900 via-violet-700 to-fuchsia-600">
            {i.status === "ready" ? <Play className="h-8 w-8 fill-white/90 text-white/90" /> : <Loader2 className="h-7 w-7 animate-spin text-white/80" />}
          </span>
        ) : (
          <Icon className="text-muted-foreground h-8 w-8" />
        )}
        <span className="absolute bottom-2 left-2 flex items-center gap-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-violet-700 shadow-xs dark:bg-black/60 dark:text-violet-200">
            <Icon className="h-3.5 w-3.5" />
          </span>
          {i.kind === "video" && i.durationSeconds ? (
            <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{formatDuration(i.durationSeconds)}</span>
          ) : null}
          {i.status !== "ready" && i.status !== "failed" ? <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">Processing</span> : null}
          {i.status === "failed" ? <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] text-white">Failed</span> : null}
        </span>
      </span>
    );
  }

  function usageChips(i: MediaLibraryItem) {
    const labels = [...new Set(i.usage.map((u) => (u.kind === "course_lesson" ? "Courses" : u.kind === "resource" ? "Resources" : "Shared")))];
    return (
      <span className="flex flex-wrap gap-1">
        {labels.slice(0, 2).map((l) => (
          <TagPill key={l} label={l} className="py-0.5" />
        ))}
        {labels.length > 2 && <TagPill label={`+${labels.length - 2}`} className="py-0.5" />}
        {labels.length === 0 && i.tags.slice(0, 2).map((t) => <TagPill key={t} label={t} className="py-0.5" />)}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <input ref={fileInput} type="file" multiple className="sr-only" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ""; }} />
      <input ref={videoInput} type="file" className="sr-only" accept="video/*" onChange={(e) => { void uploadVideo(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon={FileText} tone="violet" value={items ? counts.total : "–"} label="Total Files" active={kind === "all"} onClick={() => setKind("all")} />
        <StatTile icon={ImageIcon} tone="pink" value={items ? counts.images : "–"} label="Images" active={kind === "image"} onClick={() => setKind(kind === "image" ? "all" : "image")} />
        <StatTile icon={Film} tone="blue" value={items ? counts.videos : "–"} label="Videos" active={kind === "video"} onClick={() => setKind(kind === "video" ? "all" : "video")} />
        <StatTile icon={FileText} tone="green" value={items ? counts.documents : "–"} label="Documents" active={kind === "document"} onClick={() => setKind(kind === "document" ? "all" : "document")} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative block lg:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input id="media-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media by name, tags, or keyword…" className="bg-card h-10 pl-9" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterSelect id="media-kind" icon={FileText} label="File type" value={kind} onChange={setKind} options={[{ value: "all", label: "All File Types" }, { value: "image", label: "Images" }, { value: "video", label: "Videos" }, { value: "document", label: "Documents" }]} />
          <FilterSelect id="media-usage" icon={Layers} label="Usage" value={usage} onChange={setUsage} options={[{ value: "all", label: "All Usage" }, { value: "used", label: "In use" }, { value: "unused", label: "Not used yet" }, { value: "shared", label: "Shared replay links" }]} />
          <FilterSelect id="media-when" icon={CalendarDays} label="Upload date" value={when} onChange={setWhen} options={[{ value: "all", label: "All Upload Dates" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
          <FilterSelect id="media-source" icon={Database} label="Storage" value={source} onChange={setSource} options={[{ value: "all", label: "All Sources" }, { value: "firebase", label: "Magnetix files" }, { value: "bunny", label: "Bunny videos" }]} />
        </div>
        <div className="bg-card ml-auto hidden h-10 overflow-hidden rounded-xl border sm:flex" role="group" aria-label="View">
          {(
            [
              ["grid", LayoutGrid],
              ["list", List],
            ] as const
          ).map(([v, Icon]) => (
            <button key={v} type="button" aria-pressed={view === v} aria-label={`${v} view`} onClick={() => setView(v)} className={cn("flex w-11 items-center justify-center", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="bg-card flex items-center gap-3 rounded-xl border px-4 py-2 text-sm">
              <Loader2 className="text-primary h-4 w-4 animate-spin" />
              <span className="min-w-0 flex-1 truncate">Uploading {u.name}</span>
              {u.progress !== null && <span className="text-muted-foreground tabular-nums">{u.progress}%</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          Media Library <span className="text-muted-foreground font-semibold">({filtered.length})</span>
        </h2>
        <FilterSelect id="media-sort" icon={ArrowUpDown} label="Sort" value={sort} onChange={setSort} options={[{ value: "recent", label: "Sort: Most recent" }, { value: "name", label: "Sort: Name" }, { value: "size", label: "Sort: Largest" }]} />
      </div>

      <div className="flex gap-5">
        <div className="min-w-0 flex-1 space-y-4">
          {error ? (
            <p className="text-destructive text-sm">Couldn&apos;t load media: {error}</p>
          ) : !items ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="bg-muted/40 aspect-[4/3] animate-pulse rounded-2xl border" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyPanel
              icon={ImageIcon}
              title={items.length ? "No files match" : "Your Media Library is empty"}
              body={items.length ? "Try another search or filter." : "Upload images, documents and videos once, then reuse them across courses and resources."}
            />
          ) : view === "grid" ? (
            <ul className={cn("grid grid-cols-2 gap-4 lg:grid-cols-3", selected ? "2xl:grid-cols-3" : "2xl:grid-cols-4")}>
              {shown.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(i.id === selectedId ? null : i.id)}
                    aria-pressed={i.id === selectedId}
                    className={cn(
                      "bg-card w-full overflow-hidden rounded-2xl border text-left shadow-xs transition-colors",
                      i.id === selectedId ? "border-primary ring-primary/30 ring-2" : "hover:border-primary/40"
                    )}
                  >
                    <Thumb i={i} className="aspect-[4/3] w-full" />
                    <span className="block space-y-1 p-3">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.title}</span>
                        <MoreHorizontal className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {(i.mimeType.split("/")[1] ?? i.kind).toUpperCase()}
                        {i.width && i.height ? ` • ${i.width} × ${i.height}` : ""} • {formatBytes(i.sizeBytes)}
                      </span>
                      <span className="text-muted-foreground block text-xs">{formatDay(i.createdAt)}</span>
                      {usageChips(i)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="bg-card divide-y rounded-2xl border">
              {shown.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setSelectedId(i.id === selectedId ? null : i.id)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left", i.id === selectedId ? "bg-primary/5" : "hover:bg-muted/50")}>
                    <Thumb i={i} className="h-12 w-16 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{i.title}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {(i.mimeType.split("/")[1] ?? i.kind).toUpperCase()} • {formatBytes(i.sizeBytes)} • {formatDay(i.createdAt)}
                      </span>
                    </span>
                    <span className="hidden sm:block">{usageChips(i)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} noun="files" onPage={setPage} />
          {!isAdmin && <p className="text-muted-foreground text-xs">Only sub-account admins can upload, rename, share or delete files.</p>}
        </div>

        {selected && isXl && (
          <aside className="bg-card sticky top-4 max-h-[calc(100dvh-6rem)] w-[380px] shrink-0 self-start overflow-y-auto rounded-2xl border p-4 shadow-xs" aria-label="File details">
            <MediaDetail item={selected} onClose={() => setSelectedId(null)} onChanged={replaceItem} onDeleted={() => { setSelectedId(null); void load(); }} />
          </aside>
        )}
      </div>

      {/* Below xl the details open as a sheet. */}
      <Sheet open={!!selected && !isXl} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetTitle className="sr-only">{selected?.title ?? "File"}</SheetTitle>
          <SheetDescription className="sr-only">File details</SheetDescription>
          {selected && <MediaDetail item={selected} onClose={() => setSelectedId(null)} onChanged={replaceItem} onDeleted={() => { setSelectedId(null); void load(); }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
