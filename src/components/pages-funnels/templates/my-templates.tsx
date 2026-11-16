"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, LayoutTemplate, Loader2, MoreHorizontal, Pencil, RefreshCw, SearchX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/system/empty-state";
import { SearchField } from "@/components/system/search-field";
import { useConfirm } from "@/components/system/confirm-dialog";
import { PAGE_TYPE_ICONS } from "@/components/pages-funnels/home/page-type-icons";
import { cn } from "@/lib/utils";
import { PAGE_TEMPLATE_LIMITS, templateNameProblem } from "@/lib/pages-funnels/page-templates";
import { deletePageTemplate, listPageTemplates, renamePageTemplate, templatePreviewHref } from "@/lib/pages-funnels/page-templates-client";
import { PAGE_TYPE_LABELS } from "@/types/pages-funnels";
import type { PageTemplateSummary } from "@/types/page-templates";

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const SEARCH_FROM = 7;

/**
 * My Templates (Saved Page Templates, 2026-11-16 — approved mockups 3 and 4):
 * the workspace's saved page designs inside Create Page → Use a Template.
 * Any member sees them; admins can rename and delete. Selecting one fills
 * Page Setup; Continue creates a new independent page from it.
 */
export function MyTemplates({
  subAccountId,
  canManage,
  selectedId,
  onSelect,
  onDeleted,
}: {
  subAccountId: string;
  canManage: boolean;
  selectedId: string | null;
  onSelect: (template: PageTemplateSummary) => void;
  onDeleted: (templateId: string) => void;
}) {
  const [templates, setTemplates] = useState<PageTemplateSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<PageTemplateSummary | null>(null);
  const [renaming, setRenaming] = useState<PageTemplateSummary | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setTemplates(await listPageTemplates(subAccountId));
    } catch {
      setFailed(true);
    }
  }, [subAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A just-saved template's preview image is made in the background — check back a few times.
  const pending = templates?.some((t) => t.previewStatus === "pending" && Date.now() - t.createdAt < 3 * 60_000) ?? false;
  useEffect(() => {
    if (!pending) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      void load();
      if (tries >= 12) window.clearInterval(timer);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [pending, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!templates) return [];
    return q ? templates.filter((t) => `${t.name} ${t.description} ${PAGE_TYPE_LABELS[t.pageType] ?? ""}`.toLowerCase().includes(q)) : templates;
  }, [templates, query]);

  async function remove(t: PageTemplateSummary) {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      description: "This removes the saved template only. The original page and any pages already created from it stay exactly as they are.",
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePageTemplate(subAccountId, t.id);
      setTemplates((list) => list?.filter((x) => x.id !== t.id) ?? null);
      onDeleted(t.id);
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the template.");
    }
  }

  return (
    <section aria-labelledby="my-templates-heading" className="flex flex-col gap-3" data-my-templates="">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="my-templates-heading" className="text-body font-semibold">
            My Templates
          </h2>
          <p className="text-caption text-muted-foreground">Saved by members of this workspace.</p>
        </div>
        {templates && templates.length >= SEARCH_FROM ? (
          <SearchField value={query} onChange={setQuery} placeholder="Search templates…" aria-label="Search templates" className="w-full sm:w-64" />
        ) : null}
      </div>

      {failed ? (
        <EmptyState
          icon={RefreshCw}
          compact
          title="Couldn't load your templates"
          description="Check your connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : !templates ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading templates">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          compact
          title="No saved templates yet"
          description="Design any page, then choose Save as Template from its ⋮ menu or the builder to reuse it here."
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} compact title="No templates match" description="Try a different search." action={<Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <li key={t.id} className="min-w-0">
              <TemplateCard
                template={t}
                selected={selectedId === t.id}
                canManage={canManage}
                onSelect={() => onSelect(t)}
                onPreview={() => setPreviewing(t)}
                onRename={() => setRenaming(t)}
                onDelete={() => void remove(t)}
              />
            </li>
          ))}
        </ul>
      )}

      <TemplatePreviewDialog
        template={previewing}
        onOpenChange={(o) => !o && setPreviewing(null)}
        onUse={(t) => {
          onSelect(t);
          setPreviewing(null);
        }}
      />
      <RenameTemplateDialog
        template={renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        onSave={async (name, description) => {
          if (!renaming) return;
          const updated = await renamePageTemplate(subAccountId, renaming.id, name, description);
          setTemplates((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
          if (selectedId === updated.id) onSelect(updated);
          toast.success("Template renamed");
        }}
      />
      {dialog}
    </section>
  );
}

export function TemplateThumbnail({ template, className }: { template: PageTemplateSummary; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = PAGE_TYPE_ICONS[template.pageType] ?? PAGE_TYPE_ICONS.generic;
  if (template.preview?.url && !failed) {
    return (
      <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-muted", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- template-owned tokenized Storage URL */}
        <img src={template.preview.url} alt={`Preview of ${template.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover object-top" />
      </div>
    );
  }
  const preparing = template.previewStatus === "pending" && Date.now() - template.updatedAt < 5 * 60_000;
  const note = preparing ? "Preview is being prepared" : "Open Preview to see this design";
  return (
    <div className={cn("flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-tint-violet px-4 text-center", className)} data-template-thumbnail="fallback">
      <span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary shadow-card">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="text-caption text-muted-foreground">{note}</span>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  canManage,
  onSelect,
  onPreview,
  onRename,
  onDelete,
}: {
  template: PageTemplateSummary;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const TypeIcon = PAGE_TYPE_ICONS[template.pageType] ?? PAGE_TYPE_ICONS.generic;
  return (
    <article
      className={cn("relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors", selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40")}
      data-template-card={template.id}
    >
      <button type="button" onClick={onSelect} className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Use template ${template.name}`} aria-pressed={selected}>
        <TemplateThumbnail template={template} className="border-b border-border-subtle" />
      </button>
      {selected ? (
        <span className="absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
          <Check className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Selected</span>
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-body-sm font-semibold" title={template.name}>
            {template.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Actions for template ${template.name}`}
                  className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onPreview}>
                <Eye aria-hidden="true" /> Preview
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil aria-hidden="true" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 aria-hidden="true" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {PAGE_TYPE_LABELS[template.pageType] ?? "Page"}
        </p>
        {template.description ? <p className="line-clamp-2 text-caption text-muted-foreground">{template.description}</p> : null}
        <p className="text-caption text-muted-foreground">
          Saved {dateFmt.format(template.updatedAt)}
          {template.createdByName ? ` · ${template.createdByName}` : ""}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-body-sm font-semibold">
          <button type="button" onClick={onPreview} className="rounded text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            Preview
          </button>
          <button type="button" onClick={onSelect} className="rounded text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {selected ? "Selected" : "Use template"}
          </button>
        </div>
      </div>
    </article>
  );
}

function TemplatePreviewDialog({ template, onOpenChange, onUse }: { template: PageTemplateSummary | null; onOpenChange: (open: boolean) => void; onUse: (t: PageTemplateSummary) => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [template?.id]);
  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[56rem] flex-col gap-3 sm:max-w-5xl" data-template-preview-dialog="">
        {template ? (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="text-title-md">Template preview</DialogTitle>
              <DialogDescription>
                <span className="font-semibold text-foreground">{template.name}</span> · {PAGE_TYPE_LABELS[template.pageType] ?? "Page"} · Saved {dateFmt.format(template.updatedAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
              {!loaded ? (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-body-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading preview…
                </div>
              ) : null}
              <iframe
                key={template.id}
                src={templatePreviewHref(template.id)}
                title={`Preview of the template ${template.name}`}
                className={cn("size-full bg-white", loaded ? "opacity-100" : "opacity-0")}
                onLoad={() => setLoaded(true)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" onClick={() => onUse(template)}>
                <LayoutTemplate aria-hidden="true" /> Use this template
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameTemplateDialog({
  template,
  onOpenChange,
  onSave,
}: {
  template: PageTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description);
    setError(null);
  }, [template]);
  const problem = templateNameProblem(name);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (problem || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), description.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the template.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" data-rename-template-dialog="">
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
            <DialogDescription>Only the template changes. Pages already made from it keep their own names.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-template-name">Template name</Label>
            <Input id="rename-template-name" autoFocus value={name} maxLength={PAGE_TEMPLATE_LIMITS.name} aria-invalid={!!problem} onChange={(e) => setName(e.target.value)} />
            {problem ? <p className="text-caption text-destructive">{problem}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-template-description">Description (optional)</Label>
            <Textarea id="rename-template-description" rows={3} value={description} maxLength={PAGE_TEMPLATE_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-body-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !!problem}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
