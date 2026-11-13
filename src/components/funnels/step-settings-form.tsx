"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, SquarePen } from "lucide-react";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState } from "@/components/system/empty-state";
import { OptionSelect } from "@/components/system/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import { hasRouting, normalizeRouting, STEP_TYPE_LABELS } from "@/lib/checkout/funnel-routing";
import { normalizeStepOffer } from "@/lib/checkout/funnel-offer";
import type { StepOfferSettings, StepRouting } from "@/types/checkout";
import { useConfirm } from "@/components/system/confirm-dialog";
import { CrmSection, OfferSection, PaymentSection, StepOfferSummary, useStepOfferReadiness, type StepOfferPayloadDTO } from "@/components/funnels/step-offer-sections";
import { FUNNELS_VIEW_HREF, OFFER_LATER_NOTE, pageEditorHref, pageNeedsCopy, stepSettingsHref, type FunnelHubPayload } from "@/components/funnels/funnel-ui";
import { toastCopied } from "@/components/funnels/step-dialogs";
import { PageField, RoutingFields, type PageChoice } from "@/components/funnels/step-fields";

/**
 * Step Settings for Page, Upsell, Downsell and Thank you steps (Funnel
 * Phase 2): name, page and — for Upsell / Downsell — the Offer, payment,
 * Accept / Decline routing and CRM & follow-up. One page, one Save. The
 * authoritative editor for a step; the funnel hub's dialogs change the same
 * stored values. Checkout steps keep Checkout Settings. Saving only stores
 * settings — nothing is charged and no CRM action runs.
 */
export function StepSettingsForm({ subAccountId, hub, stepId, onSaved }: { subAccountId: string; hub: FunnelHubPayload; stepId: string; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const { isAdmin } = useSubAccount();
  const step = hub.steps.find((s) => s.id === stepId)!;
  const index = hub.steps.findIndex((s) => s.id === stepId);
  const [name, setName] = useState(step.name);
  const [page, setPage] = useState<PageChoice>({ pageId: step.pageId, copyPage: false });
  const [routing, setRouting] = useState<StepRouting>(normalizeRouting(step.routing));
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [forced, setForced] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ page?: string; routing?: string; form?: string }>({});
  const isOffer = hasRouting(step.type);
  const [offerPayload, setOfferPayload] = useState<StepOfferPayloadDTO | null>(null);
  const [offerLoadError, setOfferLoadError] = useState<string | null>(null);
  const [offer, setOffer] = useState<StepOfferSettings>(normalizeStepOffer(step.offer));
  const [offerErrors, setOfferErrors] = useState<Record<string, string>>({});
  const { confirm, dialog: confirmDialog } = useConfirm();
  const loadOffer = useCallback(async () => {
    if (!isOffer) return;
    try {
      setOfferLoadError(null);
      setOfferPayload(await commerceFetch<StepOfferPayloadDTO>(subAccountId, `funnels/${hub.funnel.id}/steps/${stepId}`));
    } catch (err) {
      setOfferLoadError((err as Error).message);
    }
  }, [isOffer, subAccountId, hub.funnel.id, stepId]);
  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);
  const hasEarlierCheckout = hub.steps.slice(0, Math.max(0, index)).some((s) => s.type === "checkout");
  const needsCopy = !!page.pageId && page.pageId !== step.pageId && (forced === page.pageId || pageNeedsCopy({ type: step.type, currentPageId: step.pageId, pageId: page.pageId, pageUses: hub.pageUses, pageExclusiveUses: hub.pageExclusiveUses ?? {} }));

  useEffect(() => {
    setName(step.name);
    setPage({ pageId: step.pageId, copyPage: false });
    setRouting(normalizeRouting(step.routing));
    setOffer(normalizeStepOffer(step.offer));
  }, [step]);

  const offerDirty = isOffer && JSON.stringify(offer) !== JSON.stringify(normalizeStepOffer(step.offer));
  const dirty = useMemo(
    () => name.trim() !== step.name || (!needsCopy && (page.pageId !== step.pageId || page.copyPage)) || (hasRouting(step.type) && JSON.stringify(routing) !== JSON.stringify(normalizeRouting(step.routing))) || offerDirty,
    [name, page, routing, step, needsCopy, offerDirty],
  );

  /** Switching steps or leaving with unsaved changes asks first. */
  async function goToStep(id: string) {
    if (dirty && !(await confirm({ title: "Leave without saving?", description: "Your changes to this step haven't been saved.", confirmLabel: "Leave without saving", tone: "danger" }))) return;
    router.push(stepSettingsHref(subAccountId, hub.funnel.id, id));
  }

  async function save() {
    setBusy(true);
    setErrors({});
    const body: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== step.name) body.name = name.trim();
    // A page that must be copied is only ever copied by "Duplicate & Use".
    if (!needsCopy && (page.pageId !== step.pageId || page.copyPage)) {
      body.pageId = page.pageId;
      if (page.pageId) body.copyPage = page.copyPage;
    }
    if (hasRouting(step.type)) body.routing = routing;
    if (offerDirty) body.offer = offer;
    setOfferErrors({});
    try {
      await commerceFetch(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}`, { method: "PATCH", body });
      toast.success("Step saved.");
      await onSaved();
      await loadOffer();
    } catch (err) {
      const e = err as Error & { fields?: Record<string, string>; status?: number };
      if (e.status === 409 && e.fields?.pageId) setForced(page.pageId);
      const offerFields = Object.fromEntries(Object.entries(e.fields ?? {}).filter(([k]) => k === "offerId" || k.startsWith("onAccept.") || k.startsWith("onDecline.")));
      setOfferErrors(offerFields);
      setErrors({
        page: e.fields?.pageId && e.status !== 409 ? e.message : undefined,
        routing: e.fields?.routing ? e.message : undefined,
        form: !e.fields ? e.message : Object.keys(offerFields).length ? "Fix the highlighted settings." : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  /** "Duplicate & Use": copy the chosen page and assign the copy to this step now. */
  async function duplicateAndUse() {
    if (!page.pageId || copying) return;
    setCopying(true);
    try {
      const d = await commerceFetch<{ step: { pageId: string | null } }>(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}`, { method: "PATCH", body: { pageId: page.pageId, copyPage: true } });
      toastCopied("Page copied and assigned to this step.", subAccountId, d.step.pageId, router.push);
      setForced(null);
      await onSaved();
    } catch (err) {
      setErrors({ page: (err as Error).message });
    } finally {
      setCopying(false);
    }
  }

  const otherSteps = hub.steps.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.name}` }));
  const currentPage = step.pageId ? hub.pages.find((p) => p.id === step.pageId) : null;

  return (
    <PageShell width="form">
      <PageHeader
        breadcrumbs={
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
            <Link href={`/sa/${subAccountId}/pages-funnels`} className="hover:text-foreground">Pages &amp; Funnels</Link> /
            <Link href={FUNNELS_VIEW_HREF(subAccountId)} className="hover:text-foreground">Funnels</Link> /
            <Link href={`/sa/${subAccountId}/pages-funnels/funnels/${hub.funnel.id}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3" aria-hidden="true" />
              {hub.funnel.name}
            </Link>
          </nav>
        }
        title={`Step ${index + 1} · ${step.name}`}
        description={`${STEP_TYPE_LABELS[step.type]} step settings.`}
        actions={
          <div className="w-52">
            <OptionSelect aria-label="Step" size="sm" value={step.id} onChange={(v) => v && v !== step.id && void goToStep(v)} options={otherSteps} />
          </div>
        }
      />
      {!isAdmin ? (
        <EmptyState title="Admins only" description="Ask a workspace admin to change step settings." />
      ) : (
        <div className="flex flex-col gap-4">
          {isOffer && offerPayload ? <OfferSummary payload={offerPayload} value={offer} hasEarlierCheckout={hasEarlierCheckout} /> : null}
          {isOffer && offerLoadError ? (
            <p role="alert" className="text-body-sm text-destructive">
              Couldn&apos;t load this step&apos;s Offer settings: {offerLoadError}{" "}
              <button type="button" className="underline" onClick={() => void loadOffer()}>Try again</button>
            </p>
          ) : null}
          <SettingsSection title="Step & page" description="The step name is only shown to your team. The page is what visitors see on this step.">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="step-name">Step name</Label>
              <Input id="step-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="text-caption text-muted-foreground">Type: {STEP_TYPE_LABELS[step.type]}</p>
            <PageField id="step-settings-page" type={step.type} currentPageId={step.pageId} value={page} onChange={setPage} pages={hub.pages} needsCopy={needsCopy} onDuplicateAndUse={() => void duplicateAndUse()} duplicating={copying} subAccountId={subAccountId} onRefresh={() => void onSaved()} error={errors.page} />
            {currentPage ? (
              <Button variant="secondary" size="sm" className="self-start" render={<Link href={pageEditorHref(subAccountId, currentPage.id)} />}>
                <SquarePen aria-hidden="true" /> Edit “{currentPage.name}”
              </Button>
            ) : null}
            {step.pageId && page.pageId !== step.pageId && !needsCopy ? <p className="text-caption text-muted-foreground">The current page isn&apos;t deleted; it just won&apos;t be used by this step.</p> : null}
          </SettingsSection>
          {isOffer && offerPayload ? <OfferAndPayment payload={offerPayload} value={offer} onChange={setOffer} hasEarlierCheckout={hasEarlierCheckout} error={offerErrors.offerId} subAccountId={subAccountId} /> : null}
          {hasRouting(step.type) ? (
            <SettingsSection title="Routing" description="Where buyers go after this offer. Buttons on the page can't change these routes.">
              <RoutingFields idPrefix="step-settings-route" steps={hub.steps} stepId={step.id} value={routing} onChange={setRouting} error={errors.routing} />
              <p className="rounded-lg bg-tint-violet p-3 text-caption text-muted-foreground">
                If accepted: used only once the payment succeeds. If declined: used when the buyer chooses to decline. If a payment fails or is still pending, the buyer stays on this step. {OFFER_LATER_NOTE}
              </p>
            </SettingsSection>
          ) : (
            <SettingsSection title="Routing" description="Visitors continue to the next step in the funnel.">
              <p className="text-body-sm text-muted-foreground">
                {hub.steps[index + 1] ? `Next: Step ${index + 2} · ${hub.steps[index + 1].name}` : "This is the last step."} Change the order on the funnel page.
              </p>
            </SettingsSection>
          )}
          {isOffer && offerPayload ? <CrmSection subAccountId={subAccountId} value={offer} onChange={setOffer} workflows={offerPayload.workflows} errors={offerErrors} /> : null}
          {errors.form ? <p className="text-body-sm text-destructive" role="alert">{errors.form}</p> : null}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
            <Button variant="secondary" render={<Link href={`/sa/${subAccountId}/pages-funnels/funnels/${hub.funnel.id}`} />}>Back to funnel</Button>
            <Button disabled={busy || !dirty} onClick={save}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Save changes</Button>
          </div>
        </div>
      )}
      {confirmDialog}
    </PageShell>
  );
}

function OfferSummary({ payload, value, hasEarlierCheckout }: { payload: StepOfferPayloadDTO; value: StepOfferSettings; hasEarlierCheckout: boolean }) {
  const r = useStepOfferReadiness({ payload, value, hasEarlierCheckout });
  return <StepOfferSummary status={r.status} runtimeAvailable={payload.runtime.postPurchaseCharging} offer={r.offer} value={value} workflows={payload.workflows} />;
}

function OfferAndPayment({ payload, value, onChange, hasEarlierCheckout, error, subAccountId }: { payload: StepOfferPayloadDTO; value: StepOfferSettings; onChange: (v: StepOfferSettings) => void; hasEarlierCheckout: boolean; error?: string; subAccountId: string }) {
  const r = useStepOfferReadiness({ payload, value, hasEarlierCheckout });
  return (
    <>
      <OfferSection payload={payload} value={value} onChange={onChange} error={error} subAccountId={subAccountId} />
      <PaymentSection offer={r.offer} value={value} onChange={onChange} prereqs={r.prereqs} runtimeAvailable={payload.runtime.postPurchaseCharging} />
    </>
  );
}
