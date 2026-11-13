"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Filter, ShoppingCart } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { OptionSelect } from "@/components/system/option-select";
import { CheckoutSettingsEditor, type EditorPayload } from "@/components/checkout/checkout-settings-editor";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import type { Funnel, FunnelStep } from "@/types/checkout";
import type { FunnelHubPayload } from "@/components/funnels/funnel-ui";
import { StepSettingsForm } from "@/components/funnels/step-settings-form";

type StepPayload = EditorPayload & { funnel: Funnel; step: FunnelStep; steps: FunnelStep[] };

/**
 * Funnel → Step Settings. Checkout steps open Checkout Settings (unchanged);
 * Page, Upsell, Downsell and Thank you steps open the step settings form
 * (name, page, Accept / Decline routing) — Funnel Phase 2.
 */
export default function StepSettingsPage() {
  const { subAccountId, funnelId, stepId } = useParams<{ subAccountId: string; funnelId: string; stepId: string }>();
  const [hub, setHub] = useState<FunnelHubPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setHub(await commerceFetch<FunnelHubPayload>(subAccountId, `funnels/${funnelId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subAccountId, funnelId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <PageShell width="wide"><EmptyState title="Couldn't open this step" description={error} /></PageShell>;
  if (!hub) return <PageShellLoading width="form" blocks={3} />;
  const step = hub.steps.find((s) => s.id === stepId);
  if (!step) return <PageShell width="form"><EmptyState title="Step not found" description="It may have been removed from this funnel." /></PageShell>;
  if (step.type !== "checkout") return <StepSettingsForm key={stepId} subAccountId={subAccountId} hub={hub} stepId={stepId} onSaved={load} />;
  return <CheckoutStepSettings />;
}

/** Funnel → Checkout Step Settings. */
function CheckoutStepSettings() {
  const { subAccountId, funnelId, stepId } = useParams<{ subAccountId: string; funnelId: string; stepId: string }>();
  const { isAdmin } = useSubAccount();
  const router = useRouter();
  const [payload, setPayload] = useState<StepPayload | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setPayload(null);
    commerceFetch<StepPayload>(subAccountId, `funnels/${funnelId}/steps/${stepId}/checkout`).then(setPayload, (e: Error) => setError(e.message));
  }, [subAccountId, funnelId, stepId]);
  useEffect(load, [load]);
  useEffect(() => {
    commerceFetch<{ funnels: Funnel[] }>(subAccountId, "funnels").then((d) => setFunnels(d.funnels), () => undefined);
  }, [subAccountId]);

  if (error) return <PageShell width="wide"><EmptyState title="Couldn't open this checkout step" description={error} /></PageShell>;
  if (!payload) return <PageShellLoading width="wide" blocks={3} />;
  const { funnel, step, steps } = payload;
  if (step.type !== "checkout") return <PageShell width="wide"><EmptyState title="Not a checkout step" description="Only Checkout steps have checkout settings." /></PageShell>;
  const checkoutSteps = steps.filter((s) => s.type === "checkout");
  const publicUrl = funnel.status === "published" && step.checkoutConfigId ? `/checkout/${step.checkoutConfigId}` : null;

  return (
    <PageShell width="wide">
      <PageHeader
        breadcrumbs={
          <nav aria-label="Breadcrumb" className="text-muted-foreground flex flex-wrap items-center gap-1 text-caption">
            <Link href={`/sa/${subAccountId}/pages-funnels`} className="hover:text-foreground">Pages &amp; Funnels</Link> /
            <Link href={`/sa/${subAccountId}/pages-funnels?view=funnels`} className="hover:text-foreground">Funnels</Link> /
            <Link href={`/sa/${subAccountId}/pages-funnels/funnels/${funnelId}`} className="hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3" aria-hidden />{funnel.name}</Link> /
            <span className="text-foreground">{step.name}</span>
          </nav>
        }
        title="Checkout Step Settings"
        description="Configure the offer, Order Bumps, customer fields and what happens after purchase for this funnel step."
        actions={<StatusPill status={funnel.status}>{funnel.status === "published" ? "Funnel published" : "Funnel draft"}</StatusPill>}
      />
      {!isAdmin ? (
        <EmptyState title="Admins only" description="Ask a workspace admin to change checkout settings." />
      ) : (
        <CheckoutSettingsEditor
          key={stepId}
          kind="funnel_step"
          subAccountId={subAccountId}
          payload={payload}
          publicUrl={publicUrl}
          onSave={(body) => commerceFetch<EditorPayload>(subAccountId, `funnels/${funnelId}/steps/${stepId}/checkout`, { method: "PUT", body }).then((p) => (setPayload((cur) => ({ ...cur!, ...p })), p))}
          toolbarStart={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="text-muted-foreground size-4" aria-hidden />
                <div className="w-56">
                  <OptionSelect aria-label="Funnel" size="sm" value={funnelId} onChange={(v) => v && v !== funnelId && router.push(`/sa/${subAccountId}/pages-funnels/funnels/${v}`)} options={funnels.map((f) => ({ value: f.id, label: f.name }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-muted-foreground size-4" aria-hidden />
                <div className="w-48">
                  <OptionSelect aria-label="Checkout step" size="sm" value={stepId} onChange={(v) => v && v !== stepId && router.push(`/sa/${subAccountId}/pages-funnels/funnels/${funnelId}/steps/${v}`)} options={checkoutSteps.map((s) => ({ value: s.id, label: s.name }))} />
                </div>
              </div>
            </div>
          }
        />
      )}
    </PageShell>
  );
}
