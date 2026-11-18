"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Copy, FilePlus2, FileText, Info, Layers, Loader2, SearchX, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchField } from "@/components/system/search-field";
import { StatusPill } from "@/components/system/status-pill";
import { MyTemplates } from "@/components/pages-funnels/templates/my-templates";
import { useMediaQuery } from "@/hooks/use-media-query";
import { commerceFetch } from "@/lib/client/commerce-api";
import { cn } from "@/lib/utils";
import type { FunnelStep } from "@/types/checkout";
import type { PageTemplateSummary } from "@/types/page-templates";
import { pageEditorHref, type FunnelHubPayload } from "@/components/funnels/funnel-ui";

/**
 * "Add a page" (page-first funnels — owner-approved mockups 1–3, 2026-11-17).
 * Replaces the old step-type picker behind the hub's existing "Add step"
 * button. The creator chooses how the page starts — blank, from a saved
 * template, or an explicit DRAFT COPY of an existing page — and the server
 * gives the step its role from what the page holds (a page with a Checkout
 * block becomes this funnel's checkout page; see `addPageStep`). Reuses the
 * existing writers: Create Page, Saved Page Templates and page duplication.
 * Phones get the same flow as a bottom sheet (mockup 3).
 */

type Stage = "choose" | "blank" | "template" | "existing";
type Method = "blank" | "template" | "existing";

const METHODS: { id: Method; title: string; description: string; phoneDescription: string; icon: LucideIcon }[] = [
  { id: "blank", title: "Start blank", description: "Create a new page from scratch.", phoneDescription: "Create a new page from scratch with the visual editor.", icon: FileText },
  { id: "template", title: "Use a template", description: "Start from one of your saved designs.", phoneDescription: "Start from a saved page design and customize it.", icon: Layers },
  { id: "existing", title: "Use existing page", description: "Choose a page to duplicate into this funnel as a draft.", phoneDescription: "Add a copy of a page you've already created in this account.", icon: Copy },
];

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function AddPageDialog({
  open,
  onOpenChange,
  subAccountId,
  hub,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subAccountId: string;
  hub: FunnelHubPayload;
  onDone: (step: FunnelStep) => void;
}) {
  const router = useRouter();
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const [stage, setStage] = useState<Stage>("choose");
  const [method, setMethod] = useState<Method>("blank");
  const [name, setName] = useState("New Page");
  const [template, setTemplate] = useState<PageTemplateSummary | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard: a double click must never add two pages.
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStage("choose");
    setMethod("blank");
    setName("New Page");
    setTemplate(null);
    setPageId(null);
    setQuery("");
    setError(null);
    setBusy(false);
    submitting.current = false;
  }, [open]);

  const atLimit = hub.steps.length >= 30;
  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...hub.pages].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [hub.pages, query]);

  const close = (o: boolean) => {
    if (!busy) onOpenChange(o);
  };

  async function submit() {
    if (busy || submitting.current || atLimit) return;
    const body =
      stage === "blank"
        ? { source: "blank", name: name.trim() }
        : stage === "template" && template
          ? { source: "template", templateId: template.id, name: name.trim() }
          : stage === "existing" && pageId
            ? { source: "existing", pageId }
            : null;
    if (!body) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const d = await commerceFetch<{ step: FunnelStep; notes?: string[] }>(subAccountId, `funnels/${hub.funnel.id}/steps`, { method: "POST", body });
      const copied = stage === "existing";
      toast.success(copied ? "Page copied into this funnel." : "Page added to this funnel.", {
        description: [copied ? "The copy is a new draft. The original page didn't change." : "It's a new draft.", ...(d.notes ?? [])].join(" "),
        duration: d.notes?.length ? 10_000 : 5_000,
        action: d.step.pageId ? { label: "Edit page", onClick: () => router.push(pageEditorHref(subAccountId, d.step.pageId!)) } : undefined,
      });
      onDone(d.step);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (method === "blank") setName("New Page");
    setError(null);
    setStage(method);
  }

  const title = stage === "existing" ? "Add a page" : stage === "template" ? "Use a template" : stage === "blank" ? "Start blank" : "Add a page";
  const description =
    stage === "choose"
      ? isPhone
        ? "Choose how to add the next page in this funnel."
        : "Choose how you want to add the next page in this funnel. Page behavior is determined by the blocks and connections on the page."
      : stage === "existing"
        ? "Choose how to add a page to this funnel."
        : stage === "template"
          ? "Choose a saved design. The new page is an independent draft; the template doesn't change."
          : "Name the new page. You'll design it in the Page Builder.";

  const canSubmit =
    !busy && !atLimit && (stage === "blank" ? !!name.trim() : stage === "template" ? !!template && !!name.trim() : stage === "existing" ? !!pageId : false);
  const submitLabel = stage === "existing" ? "Duplicate into this funnel" : "Add page";

  const body = (
    <div className={cn("flex min-h-0 flex-col gap-4", isPhone ? "px-5" : "")} data-add-page-stage={stage}>
      {atLimit ? (
        <p className="rounded-lg bg-status-warning-bg p-3 text-body-sm text-status-warning-fg">This funnel has 30 steps, the most a funnel can have. Remove a step to add another.</p>
      ) : null}

      {stage === "choose" ? (
        <>
          <div className={cn("grid gap-3", isPhone ? "grid-cols-1" : "grid-cols-2")} role="radiogroup" aria-label="How to add the page">
            {METHODS.map((m) => (
              <MethodCard key={m.id} method={m} phone={isPhone} selected={method === m.id} disabled={atLimit} onSelect={() => setMethod(m.id)} onActivate={() => { setMethod(m.id); setError(null); setStage(m.id); }} />
            ))}
          </div>
          <p className={cn("flex items-start gap-2 text-caption", isPhone ? "text-muted-foreground" : "rounded-lg bg-tint-violet p-3 text-primary")} data-add-page-note>
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {isPhone ? "Page behavior is set by the blocks and connections on the page." : "Checkout and one-click offer behavior are configured inside the page, not by choosing a step type here."}
          </p>
        </>
      ) : null}

      {stage === "blank" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-page-name">Page name</Label>
          <Input id="add-page-name" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canSubmit && void submit()} />
          <p className="text-caption text-muted-foreground">The page starts as an unpublished draft in this funnel. Add a Checkout block to take payment on it.</p>
        </div>
      ) : null}

      {stage === "template" ? (
        <div className="flex flex-col gap-4">
          <MyTemplates
            subAccountId={subAccountId}
            canManage={false}
            selectedId={template?.id ?? null}
            onSelect={(t) => {
              setTemplate(t);
              setName(t.name.slice(0, 60));
            }}
            onDeleted={() => setTemplate(null)}
          />
          {template ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-page-template-name">Page name</Label>
              <Input id="add-page-template-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === "existing" ? (
        <>
          <div className={cn("grid gap-3", isPhone ? "grid-cols-1" : "grid-cols-2")} role="radiogroup" aria-label="How to add the page">
            <RadioCard icon={FilePlus2} title="Create new page" description="Start from a blank page or a template." selected={false} onSelect={() => { setError(null); setStage("choose"); setMethod("blank"); }} />
            <RadioCard icon={FileText} title="Use existing page" description="Add a copy of a page you've already created." selected onSelect={() => undefined} />
          </div>
          <div className="flex min-h-0 flex-col gap-1 rounded-xl border border-border bg-card p-3" data-existing-pages>
            <SearchField value={query} onChange={setQuery} placeholder="Search pages" aria-label="Search pages" />
            {hub.pages.length === 0 ? (
              <p className="px-1 py-6 text-center text-body-sm text-muted-foreground">There are no pages in this workspace yet. Start blank or use a template instead.</p>
            ) : pages.length === 0 ? (
              <p className="flex flex-col items-center gap-1 px-1 py-6 text-center text-body-sm text-muted-foreground">
                <SearchX className="size-5" aria-hidden="true" /> No pages match “{query.trim()}”.
              </p>
            ) : (
              <ul className={cn("flex flex-col divide-y divide-border overflow-y-auto", isPhone ? "max-h-[36dvh]" : "max-h-72")} role="radiogroup" aria-label="Pages">
                {pages.map((p) => {
                  const funnels = hub.pageFunnels?.[p.id] ?? [];
                  const on = pageId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPageId(p.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                        data-existing-page={p.id}
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-primary" : "border-border")} aria-hidden="true">
                          {on ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate text-body-sm font-semibold">{p.name}</span>
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-muted-foreground">
                            <StatusPill status={p.status === "published" ? "published" : "draft"}>{p.status === "published" ? "Published" : "Draft"}</StatusPill>
                            {p.updatedAt ? <span>· last updated {dateFmt.format(p.updatedAt)}</span> : null}
                            {funnels.length ? <span className="truncate">· In {funnels.slice(0, 2).join(", ")}{funnels.length > 2 ? ` +${funnels.length - 2}` : ""}</span> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="flex items-start gap-2 text-caption text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Selected pages are duplicated into this funnel as a draft so the original stays unchanged.
          </p>
        </>
      ) : null}

      {error ? (
        <p className="text-caption text-destructive" role="alert" data-add-page-error>
          {error}
        </p>
      ) : null}
    </div>
  );

  const primary =
    stage === "choose" ? (
      <Button type="button" size={isPhone ? "lg" : "default"} className={isPhone ? "w-full" : undefined} disabled={atLimit} onClick={next} data-add-page-continue>
        Continue
      </Button>
    ) : (
      <Button type="button" size={isPhone ? "lg" : "default"} className={isPhone ? "w-full" : undefined} disabled={!canSubmit} onClick={() => void submit()} data-add-page-submit>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitLabel}
      </Button>
    );
  const secondary =
    stage === "choose" ? (
      <Button type="button" variant={isPhone ? "ghost" : "secondary"} className={isPhone ? "w-full" : undefined} disabled={busy} onClick={() => close(false)}>
        Cancel
      </Button>
    ) : (
      <Button type="button" variant={isPhone ? "ghost" : "secondary"} className={isPhone ? "w-full" : undefined} disabled={busy} onClick={() => { setError(null); setStage("choose"); }} data-add-page-back>
        {isPhone ? null : <ArrowLeft aria-hidden="true" />}Back
      </Button>
    );

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={close}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-4 overflow-y-auto rounded-t-2xl pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]" data-add-page-sheet>
          <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
          <SheetHeader className="px-5 pt-1 pb-0">
            <SheetTitle className="text-title-md">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {body}
          <div className="flex flex-col gap-1 border-t border-border px-5 pt-4">
            {primary}
            {secondary}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", stage === "template" ? "sm:max-w-3xl" : "sm:max-w-2xl")} data-add-page-dialog>
        <DialogHeader>
          <DialogTitle className="text-title-md">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          {secondary}
          {primary}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MethodCard({
  method,
  phone,
  selected,
  disabled,
  onSelect,
  onActivate,
}: {
  method: (typeof METHODS)[number];
  phone: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onActivate: () => void;
}) {
  const Icon = method.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      onDoubleClick={onActivate}
      className={cn(
        "flex items-start gap-4 rounded-xl border bg-card text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        phone ? "p-4" : "p-5",
        selected ? "border-primary/60 ring-3 ring-primary/20" : "border-border hover:border-primary/40",
      )}
      data-add-page-method={method.id}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-body font-semibold">{method.title}</span>
        <span className="text-body-sm text-muted-foreground">{phone ? method.phoneDescription : method.description}</span>
      </span>
    </button>
  );
}

function RadioCard({ icon: Icon, title, description, selected, onSelect }: { icon: LucideIcon; title: string; description: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary/60 bg-accent ring-3 ring-primary/20" : "border-border hover:border-primary/40",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-sm font-semibold">{title}</span>
        <span className="text-caption text-muted-foreground">{description}</span>
      </span>
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary" : "border-border")} aria-hidden="true">
        {selected ? <span className="size-2.5 rounded-full bg-primary" /> : null}
      </span>
    </button>
  );
}
