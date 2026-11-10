"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Link2, Loader2, ShoppingCart } from "lucide-react";
import { CheckoutRenderer, type QuoteResponse } from "@/components/checkout/checkout-renderer";
import { tenantBrandStyle } from "@/lib/brand/tenant-brand";
import { connectionLabel } from "@/lib/checkout/presentation";
import { checkoutKeyFor, checkoutSettingsHref, normalizeCheckoutBlock, type CheckoutBlockPayload } from "@/lib/pages-funnels/checkout-block";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import { BackgroundLayer } from "@/components/pages-funnels/puck/background-layer";
import { useCheckoutPreviewStep } from "@/components/pages-funnels/puck/checkout-preview";
import type { BackgroundConfig, PuckPageMetadata, StyleConfig } from "@/types/pages-funnels-puck";

/**
 * Page Builder Checkout / Order Form block (Checkout Foundation Phase 3).
 *
 * A PRESENTATION layer over a connected Funnel Checkout Step: it renders the
 * Phase 2 shared checkout (`CheckoutRenderer`) with the block's layout and
 * visibility settings. Price, Offer, Order Bumps, coupon acceptance,
 * fulfilment and totals come only from the Checkout Step + the server.
 *
 * Contexts:
 *  - builder: the real checkout UI from authoritative data, but never
 *    payable — no Stripe, no order, no Contact, no public API calls. A
 *    builder-only bar shows the connection, "Edit Checkout Settings" and, for
 *    two-step checkouts, a Step 1 / Step 2 preview switcher (display only).
 *  - preview (staff Preview): same safety, no builder bar.
 *  - published: the real checkout. An unconnected / unavailable / foreign
 *    checkout renders nothing for visitors.
 */
export interface CheckoutRenderProps {
  id: string;
  checkoutConfigId?: unknown;
  presentation?: unknown;
  background?: BackgroundConfig;
  style?: StyleConfig;
  metadata?: PuckPageMetadata;
}

export type CheckoutRenderContext = "builder" | "preview" | "published";
export type CheckoutResolveState = { status: "loading" | "error" } | { status: "done"; payload: CheckoutBlockPayload | null };

export function CheckoutBlockView({
  id,
  props: rawProps,
  style,
  context,
  resolution,
  subAccountId,
  brandKit,
}: {
  id: string;
  props: Record<string, unknown>;
  style?: StyleConfig;
  context: CheckoutRenderContext;
  resolution: CheckoutResolveState;
  subAccountId?: string;
  brandKit?: PuckPageMetadata["brandKit"];
}) {
  const props = normalizeCheckoutBlock(rawProps);
  // Driven by the Settings panel's Step 1 / Step 2 switcher (canvas clicks
  // select the block in Puck, they don't reach the block's own buttons).
  const previewStep = useCheckoutPreviewStep(id, context === "builder");
  const payload = resolution.status === "done" ? resolution.payload : null;
  const view = payload?.view ?? null;
  const responsiveCss = resolveResponsiveCss(id, style);
  const editorSafe = context !== "published";

  const previewQuote = useCallback(
    async (bumpIds: string[], couponCode: string): Promise<QuoteResponse> => {
      if (!view) throw new Error("Checkout unavailable.");
      const r = await fetch(`/api/sub-accounts/${view.subAccountId}/commerce/checkout-preview/${view.configId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bumpIds, couponCode }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't update the total.");
      return d as QuoteResponse;
    },
    [view],
  );

  // Visitors never see an unconnected, unavailable or unresolved block.
  if (context === "published" && !view) return null;

  let body: React.ReactNode;
  if (resolution.status === "loading") {
    body = (
      <div className="border-border text-muted-foreground flex h-40 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm" data-checkout-block-state="loading">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading checkout…
      </div>
    );
  } else if (!payload) {
    body =
      context === "builder" ? (
        <CheckoutConnectState error={resolution.status === "error"} />
      ) : context === "preview" ? (
        <Notice state="unconnected">This Checkout block isn&apos;t connected to a Checkout Step, so visitors won&apos;t see it.</Notice>
      ) : null;
  } else if (!view) {
    body = editorSafe ? <Notice state="problem">{payload.problem ?? "This checkout can't be shown yet."} Visitors won&apos;t see it until this is fixed in Checkout Settings.</Notice> : null;
  } else {
    const twoStep = view.format === "two_step";
    body = (
      <div className="flex flex-col gap-3">
        {context === "builder" && (
          <BuilderBar payload={payload} subAccountId={subAccountId ?? view.subAccountId} twoStep={twoStep} step={previewStep} />
        )}
        {editorSafe && payload.connection.funnelStatus !== "published" && (
          <Notice state="draft">
            The funnel &ldquo;{payload.connection.funnelName}&rdquo; is a draft — visitors won&apos;t see this checkout until it&apos;s published.
          </Notice>
        )}
        <div className="tenant-surface" style={tenantBrandStyle({ name: view.brand.name, logoUrl: view.brand.logoUrl, primary: view.brand.primary })} data-public-shell="checkout-block">
          {context === "published" && view.payment.mode === "test" && (
            <p className="bg-status-warning-bg text-status-warning-fg mx-auto mb-4 w-fit rounded-full px-3 py-1 text-caption font-semibold">Test mode — no real money will be charged</p>
          )}
          <CheckoutRenderer
            // Re-mount when the connected checkout changes shape.
            key={`${view.configId}-${view.format}-${view.bumps.map((b) => b.bumpId).join(",")}`}
            view={view}
            presentation={props.presentation}
            mode={context === "published" ? "public" : context}
            previewQuote={editorSafe ? previewQuote : undefined}
            forcedStep={context === "builder" && twoStep ? previewStep : undefined}
            embedded
          />
        </div>
      </div>
    );
  }
  if (!body) return null;

  return (
    <div id={id} data-checkout-block="" data-checkout-context={context} className="relative w-full self-stretch overflow-hidden text-start" style={resolveBaseStyleProps(style)}>
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      <BackgroundLayer background={rawProps.background as BackgroundConfig | undefined} brandKit={brandKit} />
      <div className="relative">{body}</div>
    </div>
  );
}

/** Builder-only: connection, Edit Checkout Settings, and which two-step step is shown. */
function BuilderBar({ payload, subAccountId, twoStep, step }: { payload: CheckoutBlockPayload; subAccountId: string; twoStep: boolean; step: 1 | 2 }) {
  return (
    <div className="border-border bg-muted/40 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs" data-checkout-builder-bar="">
      <Link2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        Connected to: <strong>{connectionLabel(payload.connection)}</strong>
        {payload.connection.primaryOfferTitle ? <span className="text-muted-foreground"> · {payload.connection.primaryOfferTitle}</span> : null}
      </span>
      {twoStep && (
        <span className="bg-background rounded-md border px-2 py-1 font-medium" data-checkout-preview-step={step}>
          Previewing {step === 1 ? "Step 1 — Your information" : "Step 2 — Payment & review"}
        </span>
      )}
      <a href={checkoutSettingsHref(subAccountId, payload.connection)} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 font-medium hover:underline">
        Edit Checkout Settings <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    </div>
  );
}

function CheckoutConnectState({ error }: { error: boolean }) {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center" data-checkout-block-state="unset">
      <span className="bg-background text-muted-foreground flex size-10 items-center justify-center rounded-full border" aria-hidden="true">
        <ShoppingCart className="size-5" />
      </span>
      <p className="text-foreground text-sm font-semibold">{error ? "The checkout couldn't be loaded" : "Connect a Checkout Step"}</p>
      <p className="text-muted-foreground max-w-sm text-xs">
        {error
          ? "Check your connection and try again."
          : "Choose a Funnel Checkout Step in Settings → Checkout connection. Pricing, Offers, Order Bumps, Coupons and fulfillment are managed in that step's Checkout Settings."}
      </p>
    </div>
  );
}

function Notice({ state, children }: { state: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800" data-checkout-block-state={state}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Builder canvas variant: resolves through the member-only, page-anchored
 * `resolve-checkout` route. Re-fetches only when the CONNECTION changes —
 * presentation edits re-render locally with no network call.
 */
export function CheckoutElementClientRender({ id, style, metadata, ...rest }: CheckoutRenderProps) {
  const props = normalizeCheckoutBlock(rest);
  const pageId = metadata?.pageId ?? "";
  const key = checkoutKeyFor(props);
  const [resolution, setResolution] = useState<CheckoutResolveState>({ status: "loading" });

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setResolution({ status: "loading" });
    fetch(`/api/pages-funnels/puck/resolve-checkout?pageId=${encodeURIComponent(pageId)}&keys=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : res.status === 404 ? { resolved: {} } : Promise.reject(res.status)))
      .then((data: { resolved?: Record<string, CheckoutBlockPayload | null> }) => {
        if (!cancelled) setResolution({ status: "done", payload: data.resolved?.[key] ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolution({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, pageId]);

  return <CheckoutBlockView id={id} props={rest} style={style} context="builder" resolution={resolution} subAccountId={metadata?.subAccountId} brandKit={metadata?.brandKit} />;
}
