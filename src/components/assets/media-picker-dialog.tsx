"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Film, ImageIcon, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { assetsCall } from "@/lib/client/assets-api";
import type { MediaLibraryItem, MediaLibraryKind } from "@/types/media-library";
import { formatBytes, formatDuration } from "./assets-ui";

/**
 * Existing-file selection from the Media Library — reuse instead of a
 * duplicate upload. Lists only this sub-account's ready files (the server
 * route is tenant-scoped), optionally one kind (e.g. videos for a lesson).
 */
export function MediaPickerDialog({
  subAccountId,
  open,
  onOpenChange,
  kind,
  publicOnly = false,
  title = "Choose from Media Library",
  description = "Reuse a file you've already uploaded.",
  onSelect,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: MediaLibraryKind;
  /** Only show images with an explicit, administrator-approved public copy. */
  publicOnly?: boolean;
  title?: string;
  description?: string;
  onSelect: (item: MediaLibraryItem) => void;
}) {
  const [items, setItems] = useState<MediaLibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    setSelected(null);
    setQ("");
    const params = new URLSearchParams({ ready: "1", ...(kind ? { kind } : {}) });
    assetsCall<{ items: MediaLibraryItem[] }>(`/api/sub-accounts/${subAccountId}/media-library?${params}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as Error).message));
  }, [open, subAccountId, kind]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((i) => (!publicOnly || Boolean(i.publicUrl)) && (!s || i.title.toLowerCase().includes(s) || (i.filename ?? "").toLowerCase().includes(s) || i.tags.some((t) => t.toLowerCase().includes(s))));
  }, [items, publicOnly, q]);
  const chosen = shown.find((i) => i.id === selected) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input id="media-picker-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or tag…" className="pl-9" />
        </label>
        <div className="min-h-40 flex-1 overflow-y-auto">
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : !items ? (
            <div className="flex justify-center py-10">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {items.length ? "No files match." : "Nothing here yet — upload it in Assets → Media Library first."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shown.map((i) => {
                const Icon = i.kind === "image" ? ImageIcon : i.kind === "video" ? Film : FileText;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(i.id)}
                      onDoubleClick={() => {
                        onSelect(i);
                        onOpenChange(false);
                      }}
                      aria-pressed={selected === i.id}
                      className={cn(
                        "w-full overflow-hidden rounded-xl border text-left transition-colors",
                        selected === i.id ? "border-primary ring-primary/30 ring-2" : "hover:border-primary/40"
                      )}
                    >
                      <span className="bg-muted relative flex aspect-video items-center justify-center overflow-hidden">
                        {i.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                          <img src={i.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="text-muted-foreground h-7 w-7" />
                        )}
                        {i.kind === "video" && i.durationSeconds ? (
                          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                            {formatDuration(i.durationSeconds)}
                          </span>
                        ) : null}
                      </span>
                      <span className="block px-2.5 py-2">
                        <span className="block truncate text-sm font-medium">{i.title}</span>
                        <span className="text-muted-foreground block truncate text-xs">{formatBytes(i.sizeBytes)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              onSelect(chosen);
              onOpenChange(false);
            }}
          >
            Use this file
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
