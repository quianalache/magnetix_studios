"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Copy,
  Download,
  FileStack,
  FileUp,
  Layers,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  CircleDot,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CONTENT_SET_DESCRIPTION_MAX,
  CONTENT_SET_NAME_MAX,
  DEFAULT_CONTENT_SET_ID,
  type ContentSetStatus,
} from "@/lib/energetic-decoder/content-sets";

/**
 * Content Sets library (2026-10-07) — Energetic Decoder → Content.
 * Columns are deliberately few (owner-locked): Name (+ optional
 * description + the real "Used in N report designs" count), Status,
 * Updated, Actions. Completeness lives inside the editor, never here.
 */

export interface ContentSetRow {
  id: string;
  name: string;
  description: string;
  status: ContentSetStatus;
  isDefault: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  usageCount: number;
}

interface UsageResponse {
  reportDesigns: { id: string; title: string; updatedAt: string | null }[];
  implicit: boolean;
}

type StatusFilter = "all" | ContentSetStatus;

export function ContentSetsLibrary({ onOpenSet }: { onOpenSet: (id: string) => void }) {
  const { subAccountId, isAdmin } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets`;
  const [sets, setSets] = useState<ContentSetRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ContentSetRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentSetRow | null>(null);

  function load() {
    if (!subAccountId) return;
    fetch(base)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { sets?: ContentSetRow[] }) => {
        setSets(d.sets ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }
  useEffect(load, [subAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sets ?? []).filter(
      (s) => (statusFilter === "all" || s.status === statusFilter) && (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    );
  }, [sets, query, statusFilter]);

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

  const json = (body: unknown) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function duplicate(set: ContentSetRow) {
    void mutate(`dup:${set.id}`, () => fetch(`${base}/${set.id}/duplicate`, { method: "POST" }), `Duplicated “${set.name}” as a Draft.`);
  }
  function toggleStatus(set: ContentSetRow) {
    const next: ContentSetStatus = set.status === "active" ? "draft" : "active";
    void mutate(`status:${set.id}`, () => fetch(`${base}/${set.id}`, json({ status: next })), `“${set.name}” is now ${next === "active" ? "Active" : "a Draft"}.`);
  }
  async function exportSet(set: ContentSetRow) {
    setBusy(`export:${set.id}`);
    try {
      const res = await fetch(`${base}/${set.id}/export`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed.");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "content-set.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        Couldn&apos;t load content sets.{" "}
        <button type="button" className="font-medium text-primary underline" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 sm:p-6" data-content-sets-library>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-base font-semibold">Content Sets</h2>
          <p className="text-sm text-muted-foreground">
            The words your reports use to interpret a chart. Keep different sets for different audiences or styles — the chart
            itself never changes.
          </p>
        </div>
        {isAdmin && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setImportOpen(true)}>
              <FileUp className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Content Set
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search content sets…" className="pl-9" aria-label="Search content sets" />
        </div>
        <div className="flex rounded-lg border p-0.5 text-xs font-medium" role="group" aria-label="Filter by status">
          {(["all", "active", "draft"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={statusFilter === f}
              onClick={() => setStatusFilter(f)}
              className={cn("rounded-md px-3 py-1.5", statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : "Draft"}
            </button>
          ))}
        </div>
      </div>

      {!sets ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted/20" />
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No content sets match.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_56px] gap-3 border-b bg-muted/30 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Status</span>
            <span>Updated</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y">
            {shown.map((set) => (
              <li
                key={set.id}
                data-set-row={set.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_110px_150px_56px]"
              >
                <div className="min-w-0">
                  <button type="button" onClick={() => onOpenSet(set.id)} className="flex min-w-0 items-center gap-2 text-left">
                    <span className="truncate text-sm font-semibold hover:underline">{set.name}</span>
                    {set.isDefault && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        <Lock className="h-2.5 w-2.5" />
                        Built-in
                      </span>
                    )}
                  </button>
                  {set.description && <p className="mt-0.5 break-words text-xs text-muted-foreground">{set.description}</p>}
                  <UsedIn set={set} base={base} />
                </div>
                <div className="col-start-1 row-start-2 flex items-center gap-3 sm:col-start-auto sm:row-start-auto sm:contents">
                  <StatusPill status={set.status} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {set.updatedAt ? formatRelativeTime(new Date(set.updatedAt)) : "—"}
                  </span>
                </div>
                <div className="col-start-2 row-span-2 row-start-1 flex justify-end self-start sm:col-start-auto sm:row-span-1 sm:row-start-auto sm:self-center">
                  {busy?.endsWith(set.id) ? (
                    <Loader2 className="m-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions for {set.name}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenSet(set.id)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          {isAdmin ? "Edit" : "Open"}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            {!set.isDefault && (
                              <DropdownMenuItem onClick={() => setRenameTarget(set)}>
                                <FileStack className="mr-2 h-3.5 w-3.5" />
                                Rename &amp; describe
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => duplicate(set)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              Duplicate
                            </DropdownMenuItem>
                            {!set.isDefault && (
                              <DropdownMenuItem onClick={() => toggleStatus(set)}>
                                <CircleDot className="mr-2 h-3.5 w-3.5" />
                                {set.status === "active" ? "Mark as Draft" : "Mark as Active"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => void exportSet(set)}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              Export
                            </DropdownMenuItem>
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
              </li>
            ))}
          </ul>
        </div>
      )}

      <CreateContentSetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sets={sets ?? []}
        base={base}
        onCreated={(id) => {
          load();
          onOpenSet(id);
        }}
      />
      <ImportContentSetDialog open={importOpen} onOpenChange={setImportOpen} base={base} onCreated={(id) => { load(); onOpenSet(id); }} />
      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={async (name, description) => {
          if (!renameTarget) return;
          const ok = await mutate(`rename:${renameTarget.id}`, () => fetch(`${base}/${renameTarget.id}`, json({ name, description })), "Saved.");
          if (ok) setRenameTarget(null);
        }}
        busy={!!busy?.startsWith("rename:")}
      />
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            {deleteTarget && deleteTarget.usageCount > 0 ? (
              <p>
                This set is used in {deleteTarget.usageCount} report design{deleteTarget.usageCount === 1 ? "" : "s"}, so it
                can&apos;t be deleted. Switch those designs to another set first.
              </p>
            ) : (
              <p>This permanently removes the set and everything written in it. Reports you&apos;ve already generated keep their saved text.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!!busy?.startsWith("delete:") || (deleteTarget?.usageCount ?? 0) > 0}
                onClick={async () => {
                  if (!deleteTarget) return;
                  const ok = await mutate(`delete:${deleteTarget.id}`, () => fetch(`${base}/${deleteTarget.id}`, { method: "DELETE" }), "Content set deleted.");
                  if (ok) setDeleteTarget(null);
                }}
              >
                Delete set
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StatusPill({ status }: { status: ContentSetStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-emerald-500" : "bg-amber-500")} />
      {status === "active" ? "Active" : "Draft"}
    </span>
  );
}

/** "Used in N report designs" — opens the real list (a popover on desktop, a bottom sheet on phones). */
function UsedIn({ set, base }: { set: ContentSetRow; base: string }) {
  const isMobile = useIsMobile();
  const { saPath } = useSubAccount();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(false);
    fetch(`${base}/${set.id}/usage`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { usage: UsageResponse }) => setUsage(d.usage))
      .catch(() => setError(true));
  }, [open, base, set.id]);

  const label = `Used in ${set.usageCount} report design${set.usageCount === 1 ? "" : "s"}`;
  if (set.usageCount === 0) return <p className="mt-1 text-xs text-muted-foreground/80">Not used in any report designs</p>;

  const body = (
    <div className="space-y-2" data-used-in-list>
      {set.isDefault && <p className="text-xs text-muted-foreground">Report designs that haven&apos;t picked a content set use Default.</p>}
      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load where this set is used.</p>
      ) : !usage ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {usage.reportDesigns.map((d) => (
            <li key={d.id}>
              <a href={saPath(`/energetic-decoder/reports/${d.id}`)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                <span className="flex min-w-0 items-center gap-2">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.title}</span>
                </span>
                {d.updatedAt && <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(new Date(d.updatedAt))}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const trigger = (
    <span className="mt-1 inline-flex items-start gap-1 text-left text-xs font-medium text-primary underline-offset-2 hover:underline">
      <Layers className="mt-0.5 h-3 w-3 shrink-0" />
      {label}
    </span>
  );

  if (isMobile) {
    return (
      <>
        <button type="button" className="text-left" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {trigger}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>{set.name}</SheetTitle>
              <SheetDescription>{label}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{body}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className="text-left">
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-2 text-sm font-semibold">{label}</p>
        {body}
      </PopoverContent>
    </Popover>
  );
}

function DescriptionField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const over = value.trim().length > CONTENT_SET_DESCRIPTION_MAX;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Description <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={over} placeholder="e.g. Career-focused wording for business clients" />
      <p className={cn("text-right text-xs tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {value.trim().length} / {CONTENT_SET_DESCRIPTION_MAX}
      </p>
    </div>
  );
}

function CreateContentSetDialog({
  open,
  onOpenChange,
  sets,
  base,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sets: ContentSetRow[];
  base: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startFrom, setStartFrom] = useState<"default" | "blank" | "existing">("default");
  const [sourceId, setSourceId] = useState("");
  const [saving, setSaving] = useState(false);
  const custom = sets.filter((s) => !s.isDefault);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartFrom("default");
      setSourceId(custom[0]?.id ?? "");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = !name.trim() || name.trim().length > CONTENT_SET_NAME_MAX || description.trim().length > CONTENT_SET_DESCRIPTION_MAX || (startFrom === "existing" && !sourceId);

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, startFrom: startFrom === "existing" ? sourceId : startFrom === "default" ? DEFAULT_CONTENT_SET_ID : "blank" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; set?: { id: string } };
      if (!res.ok || !body.set) throw new Error(body.error ?? "Couldn’t create the content set.");
      toast.success("Content set created as a Draft.");
      onOpenChange(false);
      onCreated(body.set.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t create the content set.");
    } finally {
      setSaving(false);
    }
  }

  const options: { key: typeof startFrom; title: string; body: string; disabled?: boolean }[] = [
    { key: "default", title: "Default", body: "Start with a copy of the Magnetix Default text, then rewrite what you want." },
    { key: "blank", title: "Blank", body: "Start empty and write everything yourself. Anything left blank stays blank in reports." },
    { key: "existing", title: "Existing set", body: custom.length ? "Copy one of your own content sets." : "Create a set first to copy it.", disabled: custom.length === 0 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Content Set</DialogTitle>
          <DialogDescription>Covers Human Design, Astrology and Frequency. Copies are independent — later edits to the source don&apos;t change them.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cs-name">Name</Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} placeholder="e.g. Business & Career" autoFocus />
          </div>
          <DescriptionField id="cs-desc" value={description} onChange={setDescription} />
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">Start from</legend>
            {options.map((o) => (
              <label
                key={o.key}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm",
                  startFrom === o.key && "border-primary bg-primary/5",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input type="radio" name="cs-start" className="mt-1 accent-[var(--primary)]" checked={startFrom === o.key} disabled={o.disabled} onChange={() => setStartFrom(o.key)} />
                <span className="min-w-0">
                  <span className="block font-medium">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.body}</span>
                  {o.key === "existing" && startFrom === "existing" && custom.length > 0 && (
                    <select
                      aria-label="Content set to copy"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      {custom.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create and open
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  target,
  onClose,
  onSave,
  busy,
}: {
  target: ContentSetRow | null;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (target) {
      setName(target.name);
      setDescription(target.description);
    }
  }, [target]);
  const invalid = !name.trim() || description.trim().length > CONTENT_SET_DESCRIPTION_MAX;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename content set</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) onSave(name, description);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cs-rename">Name</Label>
            <Input id="cs-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} autoFocus />
          </div>
          <DescriptionField id="cs-rename-desc" value={description} onChange={setDescription} />
          <Button type="submit" disabled={invalid || busy} className="w-full">
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportPreviewResponse {
  ok: boolean;
  name: string;
  description: string;
  recognized: number;
  errors: string[];
  skipped: string[];
}

/** Import = validate a Magnetix export file, preview it, then create a NEW Draft set (never overwrites). */
function ImportContentSetDialog({ open, onOpenChange, base, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; base: string; onCreated: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
      setName("");
    }
  }, [open]);

  async function post(commit: boolean, parsed: unknown) {
    const res = await fetch(`${base}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: parsed, commit, name }) });
    return { res, body: (await res.json().catch(() => ({}))) as { error?: string; preview?: ImportPreviewResponse; created?: { id: string } } };
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await f.text());
      } catch {
        setPreview({ ok: false, name: "", description: "", recognized: 0, errors: ["This file isn’t valid JSON."], skipped: [] });
        return;
      }
      setFile(parsed);
      const { body } = await post(false, parsed);
      setPreview(body.preview ?? { ok: false, name: "", description: "", recognized: 0, errors: [body.error ?? "Couldn’t read this file."], skipped: [] });
      setName(body.preview?.name ?? "");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const { res, body } = await post(true, file);
      if (!res.ok || !body.created) throw new Error(body.error ?? "Import failed.");
      toast.success("Imported as a new Draft content set.");
      onOpenChange(false);
      onCreated(body.created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a content set</DialogTitle>
          <DialogDescription>Choose a file exported from Magnetix. It becomes a new Draft set — nothing existing is overwritten.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} aria-label="Content set file" />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy && !preview ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
            Choose file
          </Button>
          {preview && (
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              {preview.ok ? (
                <>
                  <p>
                    <span className="font-medium">{preview.recognized}</span> entries ready to import.
                    {preview.skipped.length > 0 && <span className="text-muted-foreground"> {preview.skipped.length} skipped (not in this workspace).</span>}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="cs-import-name">Name</Label>
                    <Input id="cs-import-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} />
                  </div>
                </>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-destructive">
                  {preview.errors.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={!preview?.ok || !name.trim() || busy}>
              Import as Draft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
