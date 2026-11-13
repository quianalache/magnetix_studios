"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { commerceFetch } from "@/lib/client/commerce-api";
import { DEFAULT_ROUTING, hasRouting, normalizeRouting, STEP_TYPE_LABELS } from "@/lib/checkout/funnel-routing";
import type { FunnelStep, FunnelStepType, StepRouting } from "@/types/checkout";
import { OFFER_LATER_NOTE, pageEditorHref, pageNeedsCopy, STEP_ICONS, STEP_TYPE_HELP, STEP_TYPE_ORDER, type FunnelHubPayload } from "@/components/funnels/funnel-ui";
import { PageField, RoutingFields, type PageChoice } from "@/components/funnels/step-fields";


/* ---------------------------------- Rename --------------------------------- */

export function RenameDialog({ open, onOpenChange, title, label, initial, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; label: string; initial: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(name.trim());
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">{label}</Label>
            <Input id="rename-input" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Add step -------------------------------- */

type ErrWithCode = Error & { fields?: Record<string, string>; status?: number };
const isPageInUse = (err: unknown) => (err as ErrWithCode)?.status === 409 && !!(err as ErrWithCode)?.fields?.pageId;

/** "Page copied" confirmation with a shortcut to the copy in the Page Builder. */
export function toastCopied(message: string, subAccountId: string, pageId: string | null, push: (href: string) => void) {
  toast.success(message, pageId ? { description: "The copy is a new draft. The original page didn't change.", action: { label: "Open page", onClick: () => push(pageEditorHref(subAccountId, pageId)) } } : undefined);
}

export function AddStepDialog({
  open,
  onOpenChange,
  subAccountId,
  hub,
  onDone,
  onRefreshPages,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subAccountId: string;
  hub: FunnelHubPayload;
  onDone: (step: FunnelStep) => void;
  onRefreshPages: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<FunnelStepType | null>(null);
  const [name, setName] = useState("");
  const [page, setPage] = useState<PageChoice>({ pageId: null, copyPage: false });
  const [busy, setBusy] = useState<"add" | "copy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forced, setForced] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setType(null);
      setName("");
      setPage({ pageId: null, copyPage: false });
      setError(null);
      setForced(null);
    }
  }, [open]);
  const atLimit = hub.steps.length >= 30;
  const needsCopy = !!type && !!page.pageId && (forced === page.pageId || pageNeedsCopy({ type, currentPageId: null, pageId: page.pageId, pageUses: hub.pageUses, pageExclusiveUses: hub.pageExclusiveUses ?? {} }));

  async function add(copy: boolean) {
    if (!type || busy) return;
    setBusy(copy ? "copy" : "add");
    setError(null);
    try {
      const d = await commerceFetch<{ step: FunnelStep }>(subAccountId, `funnels/${hub.funnel.id}/steps`, {
        method: "POST",
        body: { type, name: name.trim() || STEP_TYPE_LABELS[type], ...(page.pageId ? { pageId: page.pageId, copyPage: copy || page.copyPage } : {}) },
      });
      if (copy || page.copyPage) toastCopied(`${STEP_TYPE_LABELS[type]} step added with its own copy of the page.`, subAccountId, d.step.pageId, router.push);
      else toast.success(`${STEP_TYPE_LABELS[type]} step added.`);
      onDone(d.step);
      onOpenChange(false);
    } catch (err) {
      if (isPageInUse(err)) setForced(page.pageId);
      else setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{type ? `Add a ${STEP_TYPE_LABELS[type]} step` : "Add a step"}</DialogTitle>
          <DialogDescription>{type ? "Name the step and choose its page. You can change both later." : "Choose the type of step to add to the end of this funnel."}</DialogDescription>
        </DialogHeader>
        {atLimit ? <p className="rounded-lg bg-status-warning-bg p-3 text-body-sm text-status-warning-fg">This funnel has 30 steps, the most a funnel can have. Remove a step to add another.</p> : null}
        {!type ? (
          <div className="grid gap-2 sm:grid-cols-2" role="list">
            {STEP_TYPE_ORDER.map((t) => {
              const Icon = STEP_ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  role="listitem"
                  disabled={atLimit}
                  onClick={() => {
                    setType(t);
                    setName(STEP_TYPE_LABELS[t]);
                  }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  data-add-step-type={t}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body-sm font-semibold">{STEP_TYPE_LABELS[t]}</span>
                    <span className="text-caption text-muted-foreground">{STEP_TYPE_HELP[t]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-step-name">Step name</Label>
              <Input id="add-step-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <PageField
              id="add-step-page"
              type={type}
              currentPageId={null}
              value={page}
              onChange={(v) => {
                setPage(v);
                setError(null);
              }}
              pages={hub.pages}
              needsCopy={needsCopy}
              onDuplicateAndUse={() => void add(true)}
              duplicating={busy === "copy"}
              subAccountId={subAccountId}
              onRefresh={onRefreshPages}
              error={error}
            />
            {type === "checkout" ? <p className="text-caption text-muted-foreground">After adding it, open Checkout settings to choose the Offer.</p> : null}
            {hasRouting(type) ? <p className="rounded-lg bg-tint-violet p-3 text-caption text-muted-foreground">{OFFER_LATER_NOTE} New {type} steps go to the next step on both Accept and Decline until you change them.</p> : null}
          </div>
        )}
        <DialogFooter>
          {type ? (
            <Button type="button" variant="ghost" className="sm:mr-auto" disabled={!!busy} onClick={() => setType(null)}>
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
          ) : null}
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          {type ? (
            <Button type="button" disabled={!!busy || atLimit || needsCopy} onClick={() => void add(false)}>
              {busy === "add" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Add step
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Change page ------------------------------- */

export function PageDialog({ open, onOpenChange, subAccountId, hub, step, onDone, onRefreshPages }: { open: boolean; onOpenChange: (o: boolean) => void; subAccountId: string; hub: FunnelHubPayload; step: FunnelStep | null; onDone: () => void; onRefreshPages: () => void }) {
  const router = useRouter();
  const [page, setPage] = useState<PageChoice>({ pageId: null, copyPage: false });
  const [busy, setBusy] = useState<"save" | "copy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forced, setForced] = useState<string | null>(null);
  useEffect(() => {
    if (open && step) {
      setPage({ pageId: step.pageId, copyPage: false });
      setError(null);
      setForced(null);
    }
  }, [open, step]);
  if (!step) return null;
  const changed = page.pageId !== step.pageId || page.copyPage;
  const current = step.pageId ? hub.pages.find((p) => p.id === step.pageId) : null;
  const needsCopy = !!page.pageId && page.pageId !== step.pageId && (forced === page.pageId || pageNeedsCopy({ type: step.type, currentPageId: step.pageId, pageId: page.pageId, pageUses: hub.pageUses, pageExclusiveUses: hub.pageExclusiveUses ?? {} }));

  async function save(copy: boolean) {
    if (!step || busy) return;
    setBusy(copy ? "copy" : "save");
    setError(null);
    try {
      const d = await commerceFetch<{ step: FunnelStep }>(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}`, { method: "PATCH", body: { pageId: page.pageId, ...(page.pageId ? { copyPage: copy || page.copyPage } : {}) } });
      if (copy || page.copyPage) toastCopied("Page copied and assigned to this step.", subAccountId, d.step.pageId, router.push);
      else toast.success(page.pageId ? "Page updated." : "Page removed from this step.");
      onDone();
      onOpenChange(false);
    } catch (err) {
      if (isPageInUse(err)) setForced(page.pageId);
      else setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step.pageId ? "Change page" : "Choose a page"}</DialogTitle>
          <DialogDescription>For {step.name}. Pages come from your Pages & Funnels library.</DialogDescription>
        </DialogHeader>
        <PageField
          id="step-page"
          type={step.type}
          currentPageId={step.pageId}
          value={page}
          onChange={(v) => {
            setPage(v);
            setError(null);
          }}
          pages={hub.pages}
          needsCopy={needsCopy}
          onDuplicateAndUse={() => void save(true)}
          duplicating={busy === "copy"}
          subAccountId={subAccountId}
          onRefresh={onRefreshPages}
          error={error}
        />
        {step.pageId && page.pageId !== step.pageId && !needsCopy ? (
          <p className="rounded-lg bg-status-warning-bg p-3 text-caption text-status-warning-fg">
            {current ? `“${current.name}”` : "The current page"} won&apos;t be used by this step anymore. The page itself isn&apos;t deleted and stays in your library.
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!!busy || !changed || needsCopy} onClick={() => void save(false)}>{busy === "save" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Routing --------------------------------- */

export function RoutingDialog({ open, onOpenChange, subAccountId, hub, step, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; subAccountId: string; hub: FunnelHubPayload; step: FunnelStep | null; onDone: () => void }) {
  const [routing, setRouting] = useState<StepRouting>(DEFAULT_ROUTING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && step) {
      setRouting(normalizeRouting(step.routing));
      setError(null);
    }
  }, [open, step]);
  if (!step) return null;
  async function save() {
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    try {
      await commerceFetch(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}`, { method: "PATCH", body: { routing } });
      toast.success("Routing saved.");
      onDone();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Routing for {step.name}</DialogTitle>
          <DialogDescription>Choose where buyers go after this {step.type}. Routes can only point to steps in this funnel.</DialogDescription>
        </DialogHeader>
        <RoutingFields idPrefix="route" steps={hub.steps} stepId={step.id} value={routing} onChange={setRouting} error={error} />
        <p className="text-caption text-muted-foreground">{OFFER_LATER_NOTE}</p>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={save}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Save routing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Duplicate -------------------------------- */

type Mode = "copy" | "same" | "none";

export function DuplicateStepDialog({ open, onOpenChange, subAccountId, hub, step, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; subAccountId: string; hub: FunnelHubPayload; step: FunnelStep | null; onDone: (notes: string[]) => void }) {
  // No default: the creator chooses what happens to the page (never a silent copy).
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMode(null);
      setError(null);
    }
  }, [open]);
  if (!step) return null;
  const exclusive = hasRouting(step.type);
  const pageName = step.pageId ? (hub.pages.find((p) => p.id === step.pageId)?.name ?? "its page") : null;
  const atLimit = hub.steps.length >= 30;

  async function run() {
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await commerceFetch<{ notes: string[] }>(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}/duplicate`, { method: "POST", body: { pageMode: step.pageId ? mode : "none" } });
      onDone(d.notes ?? []);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const option = (value: Mode, title: string, help: string, disabled = false) => (
    <label className={cn("flex items-start gap-3 rounded-lg border border-border p-3", disabled ? "opacity-60" : "cursor-pointer hover:border-primary/40")}>
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-sm font-semibold">{title}</span>
        <span className="text-caption text-muted-foreground">{help}</span>
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate {step.name}</DialogTitle>
          <DialogDescription>The copy is added right after this step.{step.type === "checkout" ? " It gets its own checkout with the same settings. Orders and buyers are never copied." : ""}</DialogDescription>
        </DialogHeader>
        {atLimit ? <p className="rounded-lg bg-status-warning-bg p-3 text-body-sm text-status-warning-fg">This funnel already has 30 steps.</p> : null}
        {step.pageId ? (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} aria-label="What happens to the page" className="flex flex-col gap-2">
            {option("copy", "Duplicate the page too", `Makes a new draft copy of “${pageName}” for the new step. You can edit it without changing the original.`)}
            {option("same", "Use the same page", exclusive ? `An ${step.type} needs its own page, so this isn't available.` : `Both steps show “${pageName}”. Editing it changes both.`, exclusive)}
            {option("none", "Don’t add a page", "The new step starts without a page. Choose one later.")}
          </RadioGroup>
        ) : (
          <p className="text-body-sm text-muted-foreground">This step has no page, so only the step is copied.</p>
        )}
        {hasRouting(step.type) ? <p className="text-caption text-muted-foreground">Its Accept and Decline routes are copied when they stay valid in the new position.</p> : null}
        {error ? <p className="text-caption text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={busy || atLimit || (!!step.pageId && !mode)} onClick={run}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Duplicate step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
