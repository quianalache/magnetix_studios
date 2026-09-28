"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { assetsCall, copyText } from "@/lib/client/assets-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MediaLibraryItem } from "@/types/media-library";
import { formatBytes, formatDay, formatDuration } from "./assets-ui";

function localDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Right-hand detail panel (desktop) / sheet body (phones) for one Media
 * Library file: preview (signed image / token-signed Bunny embed), open +
 * download, rename + tags, details, where it's used, and — for hosted
 * videos only, admins only — the explicit public replay link.
 */
export function MediaDetail({
  item,
  onClose,
  onChanged,
  onDeleted,
}: {
  item: MediaLibraryItem;
  onClose: () => void;
  onChanged: (item: MediaLibraryItem) => void;
  onDeleted: () => void;
}) {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/media-library/${item.id}`;
  const [preview, setPreview] = useState<{ url: string; embed: boolean } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(localDateInput(item.share?.expiresAt ?? null));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setRenaming(false);
    setConfirmDelete(false);
    setExpiry(localDateInput(item.share?.expiresAt ?? null));
  }, [item.id, item.title, item.share?.expiresAt]);

  // Preview: images use their thumbnail URL; videos + documents fetch a short-lived URL on demand.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (item.kind === "image" || item.kind === "document" || item.status !== "ready") return;
    let cancelled = false;
    assetsCall<{ url: string; embed: boolean }>(`${base}/url`)
      .then((r) => !cancelled && setPreview(r))
      .catch((e) => !cancelled && setPreviewError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [base, item.id, item.kind, item.status]);

  async function openFile(download = false) {
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const r = await assetsCall<{ url: string }>(`${base}/url${download ? "?download=1" : ""}`);
      if (win) win.location.href = r.url;
      else window.location.href = r.url;
    } catch (e) {
      win?.close();
      toast.error((e as Error).message);
    }
  }

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const r = await assetsCall<{ item: MediaLibraryItem }>(base, { method: "PATCH", json: body });
      onChanged(r.item);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      const r = await assetsCall<{ item: MediaLibraryItem }>(`${base}/refresh`, { method: "POST" });
      onChanged(r.item);
      toast.success(r.item.status === "ready" ? "Video is ready" : "Still processing");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setSharing(on: boolean) {
    setBusy("share");
    try {
      if (on) {
        await assetsCall(`${base}/share`, { method: "POST", json: expiry ? { expiresAt: new Date(`${expiry}T23:59:59`).toISOString() } : {} });
        toast.success("Replay link is on");
      } else {
        await assetsCall(`${base}/share`, { method: "DELETE" });
        toast.success("Sharing turned off — the old link no longer works");
      }
      const r = await assetsCall<{ item: MediaLibraryItem }>(base);
      onChanged(r.item);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveExpiry(value: string) {
    setExpiry(value);
    if (!item.share) return;
    setBusy("share");
    try {
      await assetsCall(`${base}/share`, { method: "POST", json: { expiresAt: value ? new Date(`${value}T23:59:59`).toISOString() : null } });
      const r = await assetsCall<{ item: MediaLibraryItem }>(base);
      onChanged(r.item);
      toast.success(value ? "Expiry saved" : "No expiry");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await assetsCall(base, { method: "DELETE" });
      toast.success("File deleted");
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  }

  const KindIcon = item.kind === "image" ? ImageIcon : item.kind === "video" ? Film : FileText;
  const shareActive = item.share && item.share.status === "active";
  const storage = item.provider === "bunny" ? "Bunny Stream (video hosting)" : item.provider === "firebase" ? "Magnetix file storage" : item.provider;

  return (
    <div className="flex h-full flex-col">
      <div className="bg-muted relative aspect-video w-full shrink-0 overflow-hidden rounded-xl">
        {item.kind === "image" && item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-contain" />
        ) : item.kind === "video" && preview?.embed ? (
          <iframe
            src={preview.url}
            title={item.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            {item.status !== "ready" ? <Loader2 className="text-muted-foreground h-7 w-7 animate-spin" /> : <KindIcon className="text-muted-foreground h-8 w-8" />}
            <span className="text-muted-foreground text-xs">
              {item.status !== "ready" ? "Processing on Bunny — check back shortly." : previewError ?? (item.kind === "document" ? "Open to view this document." : "")}
            </span>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Close details" className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <KindIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await patch({ title }, "rename")) setRenaming(false);
              }}
              className="flex gap-2"
            >
              <Input id="media-rename" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus className="h-9" />
              <Button type="submit" size="sm" disabled={busy === "rename"}>Save</Button>
            </form>
          ) : (
            <p className="truncate font-semibold" title={item.title}>{item.title}</p>
          )}
          <p className="text-muted-foreground text-xs">
            {item.mimeType.split("/")[1]?.toUpperCase() ?? item.kind}
            {item.width && item.height ? ` • ${item.width} × ${item.height}` : ""} • {formatBytes(item.sizeBytes)}
          </p>
        </div>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="File actions" />}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              {item.provider === "bunny" && (
                <DropdownMenuItem onClick={() => void refresh()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh status
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {confirmDelete && (
        <div className="border-destructive/30 bg-destructive/5 mt-3 rounded-xl border p-3 text-sm">
          <p className="font-medium">Delete this file?</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {item.usage.some((u) => u.kind !== "replay_link")
              ? "It's still in use — remove it from the places listed below first."
              : item.kind === "video"
                ? "The hosted video is removed from Bunny and any replay link stops working."
                : "The file is removed from your Media Library."}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={remove} disabled={busy === "delete"}>
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => void openFile(false)} disabled={item.status !== "ready"}>
          <ExternalLink className="mr-1.5 h-4 w-4" /> Open
        </Button>
        {item.provider === "firebase" ? (
          <Button size="sm" variant="outline" onClick={() => void openFile(true)}>
            <Download className="mr-1.5 h-4 w-4" /> Download
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled title="Hosted videos stream from Bunny and aren't downloadable">
            <Download className="mr-1.5 h-4 w-4" /> Download
          </Button>
        )}
      </div>

      {item.kind === "video" && (
        <section className="mt-5 rounded-xl border p-3" aria-labelledby="replay-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="replay-heading" className="flex items-center gap-1.5 text-sm font-semibold">
              <Share2 className="h-4 w-4" /> Public replay link
            </h3>
            {isAdmin && (
              <Switch
                checked={!!shareActive}
                disabled={busy === "share" || item.status !== "ready"}
                onCheckedChange={(v) => void setSharing(v === true)}
                aria-label={shareActive ? "Turn off the replay link" : "Share a public replay link"}
              />
            )}
          </div>
          {shareActive && item.share ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <Input id="replay-url" readOnly value={item.share.url} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await copyText(item.share!.url)) toast.success("Replay link copied");
                    else toast.error("Couldn't copy — select the link and copy it");
                  }}
                >
                  <Copy className="mr-1.5 h-4 w-4" /> Copy
                </Button>
              </div>
              {item.share.expired && <p className="text-destructive text-xs">This link has expired. Set a later date to reopen it.</p>}
              {isAdmin && (
                <label className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Expires</span>
                  <Input id="replay-expiry" type="date" value={expiry} min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} onChange={(e) => void saveExpiry(e.target.value)} className="h-8 w-40 text-xs" />
                  {expiry && (
                    <button type="button" className="text-primary hover:underline" onClick={() => void saveExpiry("")}>
                      No expiry
                    </button>
                  )}
                </label>
              )}
              <p className="text-muted-foreground text-xs">
                Anyone with this link can watch this one video — never the rest of its course. Opened {item.share.viewCount} {item.share.viewCount === 1 ? "time" : "times"}.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground mt-2 flex gap-1.5 text-xs">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {item.status !== "ready"
                ? "Available once the video finishes processing."
                : "Private — only your team and people with access to where it's used can watch it. Turn this on to share just this video with a Magnetix link you can turn off anytime."}
            </p>
          )}
          {!shareActive && isAdmin && item.status === "ready" && (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Optional expiry</span>
              <Input id="replay-expiry-new" type="date" value={expiry} min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} className="h-8 w-40 text-xs" />
            </label>
          )}
        </section>
      )}

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold">Details</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Type</dt>
          <dd>{item.kind === "video" ? "Video" : item.kind === "image" ? "Image" : "Document"} ({item.mimeType})</dd>
          {item.width && item.height ? (<><dt className="text-muted-foreground">Dimensions</dt><dd>{item.width} × {item.height}</dd></>) : null}
          <dt className="text-muted-foreground">File size</dt>
          <dd>{formatBytes(item.sizeBytes)}</dd>
          {item.durationSeconds ? (<><dt className="text-muted-foreground">Duration</dt><dd>{formatDuration(item.durationSeconds)}</dd></>) : null}
          <dt className="text-muted-foreground">Uploaded</dt>
          <dd>{formatDay(item.createdAt)}{item.uploadedByName ? ` by ${item.uploadedByName}` : ""}</dd>
          <dt className="text-muted-foreground">Storage</dt>
          <dd>{storage}</dd>
          {item.filename && item.filename !== item.title ? (<><dt className="text-muted-foreground">Original file</dt><dd className="truncate">{item.filename}</dd></>) : null}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.tags.map((t) => (
            <span key={t} className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {t}
              {isAdmin && (
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => void patch({ tags: item.tags.filter((x) => x !== t) }, "tags")}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {isAdmin && (
            <input
              id="media-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && tagInput.trim()) {
                  e.preventDefault();
                  if (await patch({ tags: [...item.tags, tagInput.trim()] }, "tags")) setTagInput("");
                }
              }}
              placeholder="+ Add tag"
              aria-label="Add tag"
              className="w-24 rounded-full border border-dashed bg-transparent px-2 py-0.5 text-xs outline-none"
            />
          )}
        </div>
      </section>

      <section className="mt-5 pb-2">
        <h3 className="mb-2 text-sm font-semibold">Used In ({item.usage.length})</h3>
        {item.usage.length === 0 ? (
          <p className="text-muted-foreground text-xs">Not used anywhere yet. Choose it from a course lesson or a resource to reuse it — no second upload needed.</p>
        ) : (
          <ul className="space-y-1.5">
            {item.usage.map((u, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs">
                <Link2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.label}</span>
                  <span className="text-muted-foreground block truncate">{u.detail}</span>
                </span>
                {u.href && (
                  <Link href={saPath(u.href)} className={cn("text-primary shrink-0 font-medium hover:underline")}>
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
