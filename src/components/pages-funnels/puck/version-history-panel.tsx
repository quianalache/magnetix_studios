"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, FileText, History, Info, Layers, Loader2, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/system/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  PAGE_VERSION_LIMIT,
  PAGE_VERSION_REASON_LABELS,
  formatVersionTime,
  type PageVersionList,
  type PageVersionMeta,
} from "@/lib/pages-funnels/page-versions";

/**
 * Page Version History panel (approved mockups 2–4, 2026-11-17).
 * Desktop: a right-hand sheet — list, selected-version summary with a live
 * thumbnail, Preview, Restore. Phone (< 768px): a bottom sheet with the list
 * and a sticky Preview / Restore bar. Restore always goes through a
 * confirmation (dialog on desktop, bottom sheet on phone).
 *
 * The "Current draft" row is the editor's state right now — it is not a saved
 * version (unsaved edits are labeled as such) and can't be restored.
 */

export type RestoreOutcome = { ok: true } | { ok: false; error: string; conflict?: boolean };

export interface VersionHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  /** The page's Preview route — `?version=` previews a saved version, read-only. */
  previewHref: string;
  hasUnsavedChanges: () => boolean;
  /** Preview of the editor's current state (the normal Preview button). */
  onPreviewCurrent: () => void;
  onRestore: (version: PageVersionMeta) => Promise<RestoreOutcome>;
  /** Bumps after saves / publishes so an open panel refreshes its list. */
  refreshKey: number;
}

type ListState = { status: "loading" } | { status: "error"; error: string } | ({ status: "ready" } & PageVersionList);

const CURRENT = "current";

export function versionPreviewUrl(previewHref: string, versionId: string, thumb = false) {
  return `${previewHref}${previewHref.includes("?") ? "&" : "?"}version=${encodeURIComponent(versionId)}${thumb ? "&thumb=1" : ""}`;
}

function reasonText(v: PageVersionMeta): string {
  if (v.reason === "restored" && v.restoredFromAtMs) return `Restored from ${formatVersionTime(v.restoredFromAtMs)}`;
  return PAGE_VERSION_REASON_LABELS[v.reason];
}

export function VersionHistoryPanel({ open, onOpenChange, pageId, previewHref, hasUnsavedChanges, onPreviewCurrent, onRestore, refreshKey }: VersionHistoryPanelProps) {
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selected, setSelected] = useState<string>(CURRENT);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState<PageVersionMeta | null>(null);

  const load = useCallback(async () => {
    setList((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const res = await fetch("/api/pages-funnels/puck/page-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, action: "versions" }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<PageVersionList> & { error?: string };
      if (!res.ok || !Array.isArray(json.versions)) throw new Error(json.error ?? "Couldn't load Version History.");
      setList({ status: "ready", versions: json.versions, liveVersionId: json.liveVersionId ?? null, draftVersionId: json.draftVersionId ?? null, draftRevision: json.draftRevision ?? 0, limit: json.limit ?? PAGE_VERSION_LIMIT });
    } catch (err) {
      setList({ status: "error", error: err instanceof Error ? err.message : "Couldn't load Version History." });
    }
  }, [pageId]);

  useEffect(() => {
    if (!open) return;
    setDirty(hasUnsavedChanges());
    void load();
  }, [open, refreshKey, load, hasUnsavedChanges]);
  useEffect(() => {
    if (!open) {
      setSelected(CURRENT);
      setConfirming(null);
    }
  }, [open]);

  const versions = list.status === "ready" ? list.versions : [];
  const selectedVersion = versions.find((v) => v.id === selected) ?? null;
  const liveId = list.status === "ready" ? list.liveVersionId : null;

  const preview = () => {
    if (selectedVersion) window.open(versionPreviewUrl(previewHref, selectedVersion.id), "_blank");
    else onPreviewCurrent();
  };

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-5" data-version-list>
        <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Page versions">
          <VersionRow
            id={CURRENT}
            selected={selected === CURRENT}
            onSelect={setSelected}
            title={
              <>
                <span className="font-semibold text-primary">Current draft</span>
                {dirty ? <span className="text-muted-foreground"> — unsaved changes</span> : null}
              </>
            }
            subtitle={dirty ? "What you're editing now (not a saved version)" : "What you're editing now"}
          />
          {list.status === "loading" ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-[58px] w-full rounded-lg" />)
          ) : list.status === "error" ? (
            <li className="rounded-lg border border-border bg-card p-4 text-body">
              <p className="text-destructive">{list.error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
            </li>
          ) : versions.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border bg-card p-4 text-body text-muted-foreground" data-version-empty>
              <p className="font-medium text-foreground">No saved versions yet</p>
              <p className="mt-1">Versions are kept when you Save Draft or Publish, and about every 30 minutes while you edit.</p>
            </li>
          ) : (
            versions.map((v) => (
              <VersionRow
                key={v.id}
                id={v.id}
                selected={selected === v.id}
                onSelect={setSelected}
                title={<span className="font-semibold">{formatVersionTime(v.createdAtMs)}</span>}
                subtitle={reasonText(v)}
                badge={v.id === liveId ? <StatusPill tone="success">Current live</StatusPill> : null}
              />
            ))
          )}
        </ul>
        {list.status === "ready" && versions.length > 0 ? (
          <p className="mt-3 text-caption text-muted-foreground">
            {versions.length} of {list.limit} versions kept. The oldest are removed as new ones are saved; the live version is always kept.
          </p>
        ) : null}
      </div>

      {!isPhone && selectedVersion ? (
        <div className="mx-5 mb-3 rounded-lg border border-border bg-card p-3" data-selected-version>
          <p className="mb-2 text-body font-semibold">Selected version</p>
          <div className="flex gap-3">
            <VersionThumbnail previewHref={previewHref} versionId={selectedVersion.id} />
            <div className="flex min-w-0 flex-col gap-1.5 text-body">
              <p className="font-semibold">{formatVersionTime(selectedVersion.createdAtMs)}</p>
              <p className="flex items-center gap-1.5 text-muted-foreground"><Layers className="h-4 w-4 shrink-0" /> Page design + popups</p>
              {selectedVersion.createdByName ? (
                <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><User className="h-4 w-4 shrink-0" /><span className="truncate">Saved by {selectedVersion.createdByName}</span></p>
              ) : null}
              <p className="flex items-center gap-1.5 text-muted-foreground"><History className="h-4 w-4 shrink-0" /> {reasonText(selectedVersion)}</p>
              <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={preview}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("flex gap-2 border-t border-border bg-background px-4 py-3 sm:px-5", isPhone ? "flex-row pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "flex-col")}>
        {isPhone ? (
          <>
            <Button variant="outline" className="flex-1" onClick={preview}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button className="flex-1" disabled={!selectedVersion} onClick={() => selectedVersion && setConfirming(selectedVersion)}>
              <History className="h-4 w-4" /> Restore
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" disabled={!selectedVersion} onClick={() => selectedVersion && setConfirming(selectedVersion)} data-restore-version>
              <History className="h-4 w-4" /> Restore this version
            </Button>
            {!selectedVersion ? (
              <Button variant="outline" onClick={preview}>
                <Eye className="h-4 w-4" /> Preview current draft
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isPhone ? "bottom" : "right"}
          // Desktop (mockup 2): the canvas stays visible beside the panel.
          overlayClassName={isPhone ? undefined : "bg-transparent supports-backdrop-filter:backdrop-blur-none"}
          className={cn(
            "gap-0 p-0",
            isPhone ? "max-h-[85dvh] rounded-t-2xl" : "w-full sm:max-w-[440px]"
          )}
          data-version-history
        >
          {isPhone ? <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" /> : null}
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-5">
            <SheetTitle className="text-title-md">Version history</SheetTitle>
            <SheetDescription>
              {isPhone
                ? "Saved versions of this page."
                : "Checkpoints of your page design and popups (not analytics history). Restore a previous version to bring back its design."}
            </SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
      <RestoreConfirmation
        version={confirming}
        isLive={!!confirming && confirming.id === liveId}
        isPhone={isPhone}
        onCancel={() => setConfirming(null)}
        onRestore={onRestore}
      />
    </>
  );
}

function VersionRow({
  id,
  selected,
  onSelect,
  title,
  subtitle,
  badge,
}: {
  id: string;
  selected: boolean;
  onSelect: (id: string) => void;
  title: React.ReactNode;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onSelect(id)}
        data-version-row={id}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          selected ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/50"
        )}
      >
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-body">
          <span className="truncate">{title}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
            {badge ?? <span className="truncate">{subtitle}</span>}
            {badge ? <span className="sr-only">{subtitle}</span> : null}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-primary" : "border-muted-foreground/40"
          )}
        >
          {selected ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
        </span>
      </button>
    </li>
  );
}

/** A small, non-interactive render of the saved version (the read-only preview, scaled down). */
function VersionThumbnail({ previewHref, versionId }: { previewHref: string; versionId: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [versionId]);
  return (
    <div className="relative h-[164px] w-[132px] shrink-0 overflow-hidden rounded-md border border-border bg-white" aria-hidden="true">
      {!loaded ? <Skeleton className="absolute inset-0" /> : null}
      <iframe
        key={versionId}
        title="Version thumbnail"
        src={versionPreviewUrl(previewHref, versionId, true)}
        tabIndex={-1}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: 1200, height: 1490, transform: "scale(0.11)" }}
      />
    </div>
  );
}

function RestoreConfirmation({
  version,
  isLive,
  isPhone,
  onCancel,
  onRestore,
}: {
  version: PageVersionMeta | null;
  isLive: boolean;
  isPhone: boolean;
  onCancel: () => void;
  onRestore: (version: PageVersionMeta) => Promise<RestoreOutcome>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    setError(null);
    setBusy(false);
    busyRef.current = false;
  }, [version?.id]);

  const confirm = async () => {
    if (!version || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const result = await onRestore(version);
    if (!result.ok) {
      setError({ message: result.error, conflict: !!result.conflict });
      busyRef.current = false;
      setBusy(false);
    }
    // On success the editor reloads into the restored draft.
  };
  const close = (next: boolean) => {
    if (!next && !busyRef.current) onCancel();
  };
  const when = version ? formatVersionTime(version.createdAtMs) : "";

  const errorBox = error ? (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body text-destructive">
      <p>{error.message}</p>
      {error.conflict ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" /> Reload page
        </Button>
      ) : null}
    </div>
  ) : null;

  if (isPhone) {
    return (
      <Sheet open={!!version} onOpenChange={close}>
        <SheetContent side="bottom" className="gap-3 rounded-t-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-restore-confirm>
          <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
          <SheetHeader className="p-0">
            <SheetTitle className="text-title-md">Restore this version?</SheetTitle>
            <SheetDescription>
              This will replace your current draft with the version from {when}. Your current draft is kept in Version History, and the live page won&apos;t change.
            </SheetDescription>
          </SheetHeader>
          {errorBox}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={busy} data-confirm-restore>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Restore draft
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={!!version} onOpenChange={close}>
      <DialogContent className="gap-4 sm:max-w-[540px]" data-restore-confirm>
        <div className="flex items-center gap-3 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <Layers className="h-5 w-5" />
          </span>
          <DialogTitle className="text-title-lg">Restore this version?</DialogTitle>
        </div>
        <DialogDescription>Restoring a version will replace the current draft with the selected saved design.</DialogDescription>
        {version ? (
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <Layers className="h-5 w-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1 text-body">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {when}
                {isLive ? <StatusPill tone="success">Current live</StatusPill> : null}
              </p>
              <p className="text-muted-foreground">
                {version.createdByName ? `Saved by ${version.createdByName} · ` : ""}
                {reasonText(version)}
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Includes page design + popups
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex gap-3 rounded-lg bg-primary/5 p-4 text-body">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Design-only history</p>
            <p className="text-muted-foreground">
              This restores the page&apos;s layout, blocks, popups and visual settings. Your current SEO and tracking settings, page name and
              analytics stay as they are, and your current draft is saved to Version History first.
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 rounded-lg bg-status-warning-bg px-4 py-2.5 text-body font-medium text-status-warning-fg">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> This will not publish the page.
        </p>
        {errorBox}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy} data-confirm-restore>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Restore as current draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
