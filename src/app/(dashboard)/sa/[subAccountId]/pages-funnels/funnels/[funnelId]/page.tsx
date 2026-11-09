"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, Settings2, Trash2 } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { OptionSelect } from "@/components/system/option-select";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";

const FUNNEL_STATUS_LABEL = { draft: "Draft", published: "Published", archived: "Archived" } as const;
import type { Funnel, FunnelStep, FunnelStepType } from "@/types/checkout";

const TYPE_LABEL: Record<FunnelStepType, string> = { page: "Page", checkout: "Checkout", upsell: "Upsell", downsell: "Downsell", thank_you: "Thank you" };

/** One funnel: its steps in the order buyers move through them. */
export default function FunnelDetailPage() {
  const { subAccountId, funnelId } = useParams<{ subAccountId: string; funnelId: string }>();
  const { isAdmin } = useSubAccount();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [pages, setPages] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<FunnelStepType | null>("page");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await commerceFetch<{ funnel: Funnel; steps: FunnelStep[] }>(subAccountId, `funnels/${funnelId}`);
      setFunnel(d.funnel);
      setSteps(d.steps);
      const checkoutStep = d.steps.find((s) => s.type === "checkout");
      if (checkoutStep) {
        const p = await commerceFetch<{ pages: typeof pages }>(subAccountId, `funnels/${funnelId}/steps/${checkoutStep.id}/checkout`).catch(() => ({ pages: [] }));
        setPages(p.pages ?? []);
      }
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
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, delta: number) => {
    const ids = steps.map((s) => s.id);
    const [id] = ids.splice(i, 1);
    ids.splice(i + delta, 0, id);
    void run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps`, { method: "PUT", body: { stepIds: ids } }));
  };

  if (error) return <PageShell width="data"><EmptyState title="Couldn't open this funnel" description={error} /></PageShell>;
  if (!funnel) return <PageShellLoading width="data" />;
  const published = funnel.status === "published";

  return (
    <PageShell width="data">
      {dialog}
      <PageHeader
        breadcrumbs={<Link href={`/sa/${subAccountId}/pages-funnels/funnels`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"><ArrowLeft className="size-3.5" aria-hidden /> Funnels</Link>}
        title={funnel.name}
        description="Buyers move through these steps in order. Use the arrows to reorder them."
        actions={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={funnel.status}>{FUNNEL_STATUS_LABEL[funnel.status]}</StatusPill>
              <Button variant={published ? "outline" : "default"} disabled={busy} onClick={() => run(() => commerceFetch(subAccountId, `funnels/${funnelId}`, { method: "PATCH", body: { status: published ? "draft" : "published" } }), published ? "Funnel unpublished." : "Funnel published.")}>
                {published ? "Unpublish" : "Publish funnel"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: "Archive this funnel?", description: "Its checkout stops accepting orders. Past orders are kept.", confirmLabel: "Archive", tone: "danger" })) {
                    await commerceFetch(subAccountId, `funnels/${funnelId}`, { method: "DELETE" }).then(() => router.push(`/sa/${subAccountId}/pages-funnels/funnels`), (e: Error) => toast.error(e.message));
                  }
                }}
              >
                Archive
              </Button>
            </div>
          ) : (
            <StatusPill status={funnel.status}>{FUNNEL_STATUS_LABEL[funnel.status]}</StatusPill>
          )
        }
      />
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-44"><OptionSelect aria-label="Step type" value={newType} onChange={setNewType} options={(Object.keys(TYPE_LABEL) as FunnelStepType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} /></div>
          <Input aria-label="Step name" placeholder="Step name (optional)" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} className="min-w-48 flex-1 sm:max-w-xs" />
          <Button variant="outline" disabled={busy || !newType} onClick={() => run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps`, { method: "POST", body: { type: newType, name: newName } }).then(() => setNewName("")), "Step added.")}>
            <Plus className="size-4" aria-hidden /> Add step
          </Button>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Card className="flex-row flex-wrap items-center gap-3 p-4">
              <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-body-sm tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                <p className="font-semibold text-body">{s.name}</p>
                <p className="text-muted-foreground text-caption">{TYPE_LABEL[s.type]}{s.type === "checkout" ? " · sells one Offer with optional Order Bumps" : s.pageId ? ` · ${pages.find((p) => p.id === s.pageId)?.name ?? "Page"}` : " · no page chosen"}</p>
              </div>
              {s.type === "checkout" ? (
                <div className="flex flex-wrap gap-2">
                  {published && s.checkoutConfigId && (
                    <Button variant="ghost" size="sm" render={<a href={`/checkout/${s.checkoutConfigId}`} target="_blank" rel="noopener noreferrer" />}>
                      <ExternalLink className="size-4" aria-hidden /> Open
                    </Button>
                  )}
                  <Button size="sm" render={<Link href={`/sa/${subAccountId}/pages-funnels/funnels/${funnelId}/steps/${s.id}`} />}>
                    <Settings2 className="size-4" aria-hidden /> Checkout settings
                  </Button>
                </div>
              ) : (
                isAdmin && (
                  <div className="w-full sm:w-56">
                    <OptionSelect
                      aria-label={`Page for ${s.name}`}
                      size="sm"
                      value={s.pageId}
                      noneLabel="No page"
                      onChange={(v) => run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps/${s.id}`, { method: "PATCH", body: { pageId: v } }))}
                      options={pages.map((p) => ({ value: p.id, label: `${p.name}${p.status !== "published" ? " (draft)" : ""}` }))}
                    />
                  </div>
                )
              )}
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label="Move down" disabled={busy || i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${s.name}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await confirm({ title: `Delete "${s.name}"?`, description: s.type === "checkout" ? "Its checkout settings and Order Bumps are deleted too. Past orders are kept." : "The page itself isn't deleted.", confirmLabel: "Delete step", tone: "danger" }))
                        void run(() => commerceFetch(subAccountId, `funnels/${funnelId}/steps/${s.id}`, { method: "DELETE" }), "Step deleted.");
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>
      {steps.length === 0 && <EmptyState title="No steps yet" description="Add a Checkout step to start selling." compact />}
      {!published && <p className="text-muted-foreground text-caption">This funnel is a draft. Its checkout opens for buyers once you publish it; you can still preview it from the checkout settings.</p>}
    </PageShell>
  );
}
