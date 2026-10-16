"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Info, Loader2, MoreHorizontal, Palette, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { EmptyState } from "@/components/system/empty-state";
import { CHART_SYSTEM_LABEL, ChartDesignPreview } from "@/components/energetic-decoder/chart-design-controls";

/**
 * Chart Designs library (unified Chart Designs, 2026-10) — one row per
 * unified design. Opening a design goes to its own full-screen editor
 * (/energetic-decoder/chart-designs/[setId]); this screen only lists and
 * manages them.
 *
 * A workspace whose existing designs haven't been grouped by the one-time
 * migration yet keeps its per-system cards (`legacyFallback`) — viewing
 * this screen never groups, copies or changes anything.
 */

interface ListResponse {
  sets: ChartDesignSetWithMembers[];
  migrationRequired: boolean;
}

function lastUpdated(set: ChartDesignSetWithMembers): Date | null {
  const stamps = [set.updatedAt, set.designs.humanDesign?.updatedAt, set.designs.mandala?.updatedAt, set.designs.astrology?.updatedAt]
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime());
  return stamps.length > 0 ? new Date(Math.max(...stamps)) : null;
}

/**
 * `frame` places the library in its page (v2, 2026-10-16): the Chart Designs
 * tab passes the Decoder page header, which receives the New Chart Design
 * action, and the section tabs. Every state — loading, error, migration,
 * gallery — renders inside the same frame so the page never jumps.
 */
export function ChartDesignLibrary({
  legacyFallback,
  frame = (_actions, body) => body,
}: {
  legacyFallback: ReactNode;
  frame?: (actions: ReactNode, body: ReactNode) => ReactNode;
}) {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [sampleHd, setSampleHd] = useState<HumanDesignProfile | null>(null);
  const [sampleAstro, setSampleAstro] = useState<AstrologyChart | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<ChartDesignSetWithMembers | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChartDesignSetWithMembers | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/chart-design-sets`;
  const editorPath = (id: string) => saPath(`/energetic-decoder/chart-designs/${id}`);

  function load() {
    if (!subAccountId) return;
    fetch(base)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: ListResponse) => {
        setData({ sets: d.sets ?? [], migrationRequired: d.migrationRequired === true });
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }
  useEffect(load, [subAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/preview`)
      .then((r) => r.json())
      .then((d) => {
        setSampleHd(d.humanDesign ?? null);
        setSampleAstro(d.astrology ?? null);
      })
      .catch(() => undefined);
  }, [subAccountId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.sets ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [data, query]);

  async function mutate<T>(key: string, fn: () => Promise<Response>, success: string): Promise<T | null> {
    setBusy(key);
    try {
      const res = await fn();
      const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      toast.success(success);
      load();
      return body;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const body = await mutate<{ set: { id: string } }>(
      "create",
      () => fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() || "Untitled design" }) }),
      "Chart design created from your Default.",
    );
    if (body?.set) {
      setCreateOpen(false);
      setNewName("");
      router.push(editorPath(body.set.id));
    }
  }

  async function rename() {
    if (!renameTarget || !renameValue.trim()) return;
    const ok = await mutate(
      `rename:${renameTarget.id}`,
      () => fetch(`${base}/${renameTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }) }),
      "Renamed.",
    );
    if (ok) setRenameTarget(null);
  }

  function duplicate(set: ChartDesignSetWithMembers) {
    void mutate(`dup:${set.id}`, () => fetch(`${base}/${set.id}/duplicate`, { method: "POST" }), `Duplicated "${set.name}".`);
  }

  function makeDefault(set: ChartDesignSetWithMembers) {
    void mutate(
      `default:${set.id}`,
      () => fetch(`${base}/${set.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDefault: true }) }),
      `"${set.name}" is now the default design.`,
    );
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const ok = await mutate(`delete:${deleteTarget.id}`, () => fetch(`${base}/${deleteTarget.id}`, { method: "DELETE" }), "Chart design deleted.");
    if (ok) setDeleteTarget(null);
  }

  const newButton = isAdmin ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="size-4" />
      New Chart Design
    </Button>
  ) : null;

  if (loadError) {
    return frame(
      null,
      <div className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
        Couldn&apos;t load chart designs.{" "}
        <button type="button" className="font-medium text-link underline" onClick={load}>
          Try again
        </button>
      </div>,
    );
  }
  if (!data) {
    return frame(
      null,
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-card bg-muted" />
        ))}
      </div>,
    );
  }

  if (data.migrationRequired) {
    return frame(
      null,
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-card border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-link" />
          <p>
            Your chart designs are being upgraded to unified Chart Designs — one design covering Human Design, Mandala and
            Astrology together. Until the upgrade is applied to this workspace, your current designs keep working exactly as
            they are below.
          </p>
        </div>
        {legacyFallback}
      </div>,
    );
  }

  return frame(
    newButton,
    <div className="space-y-4" data-chart-design-gallery>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chart designs…" className="pl-9" aria-label="Search chart designs" />
        </div>
        <span className="text-caption text-muted-foreground tabular-nums">
          {data.sets.length} {data.sets.length === 1 ? "design" : "designs"}
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Palette} title={query ? "No chart designs match that search." : "No chart designs yet."} className="rounded-card border border-dashed border-border bg-card" />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((set) => {
            const updated = lastUpdated(set);
            return (
              <li key={set.id} className="min-w-0">
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(editorPath(set.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(editorPath(set.id));
                  }}
                  data-chart-design-card={set.id}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-card shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {/* Real previews of this design on a neutral tray. */}
                  <div className="flex justify-center gap-2 border-b border-border bg-muted px-3 py-3">
                    {(["humanDesign", "mandala"] as const).map((system) => (
                      <div key={system} className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1.5 sm:size-28" title={CHART_SYSTEM_LABEL[system]}>
                        <ChartDesignPreview system={system} design={set.designs[system]} sampleHd={sampleHd} sampleAstro={sampleAstro} size="thumb" className="h-full w-full" />
                      </div>
                    ))}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 truncate text-body font-semibold text-foreground">{set.name}</p>
                      {set.isDefault && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-tag-gold-bg px-2 py-0.5 text-caption font-medium text-tag-gold-fg">
                          <Star className="size-3 fill-current" aria-hidden="true" />
                          Default
                        </span>
                      )}
                      <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {busy?.endsWith(set.id) ? (
                          <Loader2 className="m-2 size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <DropdownMenu>
                            {/* `relative` contains the sr-only label below: without a positioned ancestor its
                                absolute box escapes <main>'s scroll area and stretches the whole document. */}
                            <DropdownMenuTrigger className="relative inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions for {set.name}</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(editorPath(set.id))}>
                                <Palette className="mr-2 h-3.5 w-3.5" />
                                {isAdmin ? "Edit" : "Open"}
                              </DropdownMenuItem>
                              {isAdmin && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setRenameTarget(set);
                                      setRenameValue(set.name);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicate(set)}>
                                    <Copy className="mr-2 h-3.5 w-3.5" />
                                    Duplicate
                                  </DropdownMenuItem>
                                  {!set.isDefault && (
                                    <DropdownMenuItem onClick={() => makeDefault(set)}>
                                      <Star className="mr-2 h-3.5 w-3.5" />
                                      Set as default
                                    </DropdownMenuItem>
                                  )}
                                  {!set.isDefault && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(set)}>
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    {updated && <p className="-mt-1.5 text-caption text-muted-foreground">Updated {formatRelativeTime(updated)}</p>}
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {(["humanDesign", "mandala", "astrology"] as const).map((system) => (
                        <span key={system} className="rounded-md bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                          {CHART_SYSTEM_LABEL[system]}
                        </span>
                      ))}
                      <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-caption text-ink-tertiary">Frequency · Coming soon</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Chart Design</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cd-new-name">Name</Label>
              <Input id="cd-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Client Premium" maxLength={80} autoFocus />
              <p className="text-xs text-muted-foreground">Starts as a copy of your Default design — then customize each chart.</p>
            </div>
            <Button type="submit" disabled={busy === "create"} className="w-full">
              {busy === "create" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create and open
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chart design</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={80} autoFocus aria-label="Design name" />
            <Button type="submit" disabled={!renameValue.trim() || busy?.startsWith("rename:")} className="w-full">
              Save name
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            <p>
              This removes the design for every chart system. Reports you&apos;ve already generated keep their saved look. A
              design that any profile still uses can&apos;t be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy?.startsWith("delete:")}>
                Delete design
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>,
  );
}
