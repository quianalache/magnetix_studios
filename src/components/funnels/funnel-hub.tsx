"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Archive, ArrowLeft, ExternalLink, Eye, EyeOff, Filter, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import { hasRouting, normalizeRouting, stepLabel } from "@/lib/checkout/funnel-routing";
import type { FunnelStep } from "@/types/checkout";
import { FUNNELS_VIEW_HREF, type FunnelHubPayload } from "@/components/funnels/funnel-ui";
import { StepRow, type StepAction } from "@/components/funnels/step-row";
import { AddStepDialog, DuplicateStepDialog, PageDialog, RenameDialog, RoutingDialog } from "@/components/funnels/step-dialogs";

const STATUS_LABEL = { draft: "Draft", published: "Published", archived: "Archived" } as const;
const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

type Dialog = { kind: "add" } | { kind: "renameFunnel" } | { kind: "rename" | "page" | "routing" | "duplicate"; step: FunnelStep } | null;

/**
 * Funnel hub (Funnel Phase 2, decisions D2 / D4 / D6): one screen with the
 * funnel's status and actions and its ordered steps. No tabs and no flow
 * canvas: each step shows where buyers go next, and Upsell / Downsell route
 * chips open the routing editor. Step Settings stay the full editor for a
 * step; the hub edits the same stored values.
 */
export function FunnelHub({ subAccountId, funnelId }: { subAccountId: string; funnelId: string }) {
  const { isAdmin } = useSubAccount();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [hub, setHub] = useState<FunnelHubPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    try {
      setHub(await commerceFetch<FunnelHubPayload>(subAccountId, `funnels/${funnelId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subAccountId, funnelId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (error && !hub) {
    return (
      <PageShell width="data">
        <EmptyState title="Couldn't open this funnel" description={error} action={<Button variant="secondary" render={<Link href={FUNNELS_VIEW_HREF(subAccountId)} />}>Back to Funnels</Button>} />
      </PageShell>
    );
  }
  if (!hub) return <PageShellLoading width="data" />;

  const { funnel, steps } = hub;
  const published = funnel.status === "published";
  const errors = hub.issues.filter((i) => i.level === "error");
  const warnings = hub.issues.filter((i) => i.level === "warning");
  const dialogStep = dialog && "step" in dialog ? dialog.step : null;

  const move = (step: FunnelStep, delta: number) => {
    const ids = steps.map((s) => s.id);
    const i = ids.indexOf(step.id);
    ids.splice(i, 1);
    ids.splice(i + delta, 0, step.id);
    void run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps`, { method: "PUT", body: { stepIds: ids } }));
  };

  async function removeStep(step: FunnelStep) {
    const pointing = steps.filter((s) => hasRouting(s.type) && s.id !== step.id && Object.values(normalizeRouting(s.routing)).some((r) => r.type === "funnel_step" && r.stepId === step.id));
    const pageName = step.pageId ? hub!.pages.find((p) => p.id === step.pageId)?.name : null;
    const ok = await confirm({
      title: `Remove “${step.name}”?`,
      description: (
        <span className="flex flex-col gap-2">
          <span>
            {step.type === "checkout"
              ? "Its checkout settings and Order Bumps are deleted. Past orders and buyers' purchases are kept."
              : pageName
                ? `The step is removed from this funnel. “${pageName}” isn't deleted and stays in your library.`
                : "The step is removed from this funnel."}
          </span>
          {pointing.length ? (
            <span>
              {pointing.map((s) => stepLabel(steps, s.id)).join(", ")} {pointing.length === 1 ? "sends" : "send"} buyers here. Those routes will go to the next step instead.
            </span>
          ) : null}
        </span>
      ),
      confirmLabel: "Remove step",
      tone: "danger",
    });
    if (ok) await run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps/${step.id}`, { method: "DELETE" }), "Step removed.");
  }

  async function archive() {
    const ok = await confirm({
      title: `Archive “${funnel.name}”?`,
      description: "Its checkout stops accepting orders and it leaves the Funnels list. Past orders, buyers and its pages are kept. Archived funnels can't be deleted.",
      confirmLabel: "Archive funnel",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await commerceFetch(subAccountId, `funnels/${funnelId}`, { method: "DELETE" });
      toast.success("Funnel archived.");
      router.push(FUNNELS_VIEW_HREF(subAccountId));
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  function onAction(action: StepAction, step: FunnelStep) {
    if (action === "up") return move(step, -1);
    if (action === "down") return move(step, 1);
    if (action === "remove") return void removeStep(step);
    setDialog({ kind: action, step });
  }

  const publishedPageId = published ? steps.find((s) => s.type !== "checkout" && s.pageId && hub.pages.find((p) => p.id === s.pageId && p.status === "published"))?.pageId : null;

  return (
    <PageShell width="data">
      {confirmDialog}
      <PageHeader
        breadcrumbs={
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
            <Link href={`/sa/${subAccountId}/pages-funnels`} className="hover:text-foreground">Pages &amp; Funnels</Link> /
            <Link href={FUNNELS_VIEW_HREF(subAccountId)} className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3" aria-hidden="true" /> Funnels
            </Link>
          </nav>
        }
        title={funnel.name}
        description={`${steps.length} ${steps.length === 1 ? "step" : "steps"} · Updated ${dateFmt.format(funnel.updatedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={funnel.status}>{STATUS_LABEL[funnel.status]}</StatusPill>
            {isAdmin ? (
              <>
                <Button
                  variant={published ? "secondary" : "default"}
                  disabled={busy}
                  onClick={() => run(() => commerceFetch(subAccountId, `funnels/${funnelId}`, { method: "PATCH", body: { status: published ? "draft" : "published" } }), published ? "Funnel unpublished." : "Funnel published.")}
                >
                  {published ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {published ? "Unpublish" : "Publish funnel"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Funnel actions"
                        disabled={busy}
                        className="flex size-(--ds-control-md) items-center justify-center rounded-lg border border-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setDialog({ kind: "renameFunnel" })}>
                      <Pencil aria-hidden="true" /> Rename funnel
                    </DropdownMenuItem>
                    {publishedPageId ? (
                      <DropdownMenuItem render={<a href={`/p/${publishedPageId}`} target="_blank" rel="noopener noreferrer" />}>
                        <ExternalLink aria-hidden="true" /> Open first page
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => void archive()}>
                      <Archive aria-hidden="true" /> Archive funnel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        }
      />

      {errors.length ? (
        <div className="flex gap-3 rounded-card bg-status-danger-bg p-4 text-status-danger-fg" role="alert" data-funnel-errors>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1 text-body-sm">
            <p className="font-semibold">{published ? "Fix these so buyers don't get stuck:" : "Fix these before publishing:"}</p>
            <ul className="flex list-disc flex-col gap-0.5 pl-4">
              {errors.map((e, i) => <li key={i}>{e.message}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
      {warnings.length ? (
        <p className="flex items-center gap-2 rounded-card bg-status-warning-bg px-4 py-2.5 text-body-sm text-status-warning-fg" data-funnel-warnings>
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`} on the steps below.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold">Steps</h2>
        {isAdmin ? (
          <Button size="sm" disabled={busy} onClick={() => setDialog({ kind: "add" })}>
            <Plus aria-hidden="true" /> Add step
          </Button>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <EmptyState icon={Filter} compact title="No steps yet" description="Add a Checkout step to start selling, then the pages buyers see before and after it." action={isAdmin ? <Button onClick={() => setDialog({ kind: "add" })}><Plus aria-hidden="true" /> Add step</Button> : undefined} />
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Funnel steps">
          {steps.map((s, i) => (
            <StepRow key={s.id} hub={hub} step={s} index={i} subAccountId={subAccountId} isAdmin={isAdmin} busy={busy} issues={hub.issues.filter((x) => x.stepId === s.id)} onAction={onAction} />
          ))}
        </ol>
      )}
      {!published ? <p className="text-caption text-muted-foreground">This funnel is a draft. Its checkout opens for buyers once you publish it; you can still preview checkouts from their settings.</p> : null}

      <AddStepDialog open={dialog?.kind === "add"} onOpenChange={(o) => !o && setDialog(null)} subAccountId={subAccountId} hub={hub} onDone={() => void load()} onRefreshPages={() => void load()} />
      <PageDialog open={dialog?.kind === "page"} onOpenChange={(o) => !o && setDialog(null)} subAccountId={subAccountId} hub={hub} step={dialog?.kind === "page" ? dialogStep : null} onDone={() => void load()} onRefreshPages={() => void load()} />
      <RoutingDialog open={dialog?.kind === "routing"} onOpenChange={(o) => !o && setDialog(null)} subAccountId={subAccountId} hub={hub} step={dialog?.kind === "routing" ? dialogStep : null} onDone={() => void load()} />
      <DuplicateStepDialog
        open={dialog?.kind === "duplicate"}
        onOpenChange={(o) => !o && setDialog(null)}
        subAccountId={subAccountId}
        hub={hub}
        step={dialog?.kind === "duplicate" ? dialogStep : null}
        onDone={(notes) => {
          toast.success("Step duplicated.", notes.length ? { description: notes.join(" ") } : undefined);
          void load();
        }}
      />
      <RenameDialog
        open={dialog?.kind === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename step"
        label="Step name"
        initial={dialogStep?.name ?? ""}
        onSave={async (name) => {
          await commerceFetch(subAccountId, `funnels/${funnelId}/steps/${dialogStep!.id}`, { method: "PATCH", body: { name } });
          toast.success("Step renamed.");
          await load();
        }}
      />
      <RenameDialog
        open={dialog?.kind === "renameFunnel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename funnel"
        label="Funnel name"
        initial={funnel.name}
        onSave={async (name) => {
          await commerceFetch(subAccountId, `funnels/${funnelId}`, { method: "PATCH", body: { name } });
          toast.success("Funnel renamed.");
          await load();
        }}
      />
    </PageShell>
  );
}
