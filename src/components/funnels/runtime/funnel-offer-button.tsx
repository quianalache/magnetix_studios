"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { FunnelOfferActionResponse, FunnelOfferRuntimeView } from "@/lib/checkout/funnel-runtime-view";

/**
 * Accept / Decline buttons on a creator's Upsell / Downsell page (post-
 * purchase funnel runtime). The creator's button keeps its own design; this
 * adds the behavior: one-click purchase, a subscription consent step, a
 * processing state that blocks repeat clicks, Stripe authentication, and —
 * if the saved card fails — an inline Stripe payment form right under the
 * button, on the same page. All buttons on the page share one state.
 *
 * The browser never sends an Offer, price or amount: only the funnel + step
 * ids and the action. Card details go straight to Stripe (Payment Element);
 * Magnetix never sees them.
 */

type Phase = "idle" | "consent" | "processing" | "auth" | "recovery" | "done" | "notice";

interface StoreState {
  phase: Phase;
  ownerId: string | null;
  clientSecret: string | null;
  /** `setup` = a free trial's card authorization; `payment` = a charge. */
  intentType: "payment" | "setup";
  message: string | null;
  nextHref: string | null;
}

const stores = new Map<string, { state: StoreState; listeners: Set<() => void> }>();
function storeFor(key: string, initial: StoreState) {
  let s = stores.get(key);
  if (!s) {
    s = { state: initial, listeners: new Set() };
    stores.set(key, s);
  }
  return s;
}
function setStore(key: string, patch: Partial<StoreState>) {
  const s = stores.get(key);
  if (!s) return;
  s.state = { ...s.state, ...patch };
  s.listeners.forEach((l) => l());
}

const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(view: FunnelOfferRuntimeView): Promise<Stripe | null> | null {
  if (!view.stripe) return null;
  const k = `${view.stripe.publishableKey}|${view.stripe.stripeAccount ?? ""}`;
  // A Stripe.js load failure (offline, blocked) reads as "unavailable", never an uncaught error.
  if (!stripeCache.has(k)) stripeCache.set(k, loadStripe(view.stripe.publishableKey, view.stripe.stripeAccount ? { stripeAccount: view.stripe.stripeAccount } : undefined).catch(() => null));
  return stripeCache.get(k)!;
}

async function post(view: FunnelOfferRuntimeView, action: "accept" | "decline" | "status", consent?: boolean): Promise<{ ok: boolean; data: FunnelOfferActionResponse & { error?: string } }> {
  const res = await fetch(`/api/order-checkout/funnel-offer/${encodeURIComponent(view.funnelId)}/${encodeURIComponent(view.stepId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, ...(consent ? { consent: true } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as FunnelOfferActionResponse & { error?: string };
  return { ok: res.ok, data };
}

function initialPhase(view: FunnelOfferRuntimeView | null | undefined): StoreState {
  const base: StoreState = { phase: "idle", ownerId: null, clientSecret: null, intentType: "payment", message: null, nextHref: view?.nextHref ?? null };
  if (!view) return base;
  if (view.state === "succeeded" || view.state === "declined") return { ...base, phase: "done", message: view.state === "succeeded" ? "You've already accepted this offer." : "No problem — you've skipped this offer." };
  if (view.state === "processing" || view.state === "requires_action" || view.state === "payment_failed") return { ...base, phase: "processing", message: "Checking your payment…" };
  return base;
}

export function FunnelOfferButton({
  id,
  decision,
  view,
  className,
  style,
  children,
}: {
  id: string;
  decision: "accept" | "decline";
  view: FunnelOfferRuntimeView | null | undefined;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const key = view ? `${view.funnelId}:${view.stepId}` : "none";
  // The shared state lives in the BROWSER only: on the server a module-level
  // store would outlive the request and leak one visitor's state into another
  // visitor's page. Server render (and hydration) always start from this
  // visitor's own view.
  const ssrState = useMemo(() => initialPhase(view), [view]);
  const store = typeof window === "undefined" ? null : storeFor(key, ssrState);
  const state = useSyncExternalStore(
    (l) => {
      if (!store) return () => undefined;
      store.listeners.add(l);
      return () => store.listeners.delete(l);
    },
    () => store?.state ?? ssrState,
    () => ssrState,
  );
  // The first Accept button owns the inline panels unless another was clicked.
  useEffect(() => {
    if (store && decision === "accept" && !store.state.ownerId) setStore(key, { ownerId: id });
  }, [decision, id, key, store]);
  const resumed = useRef(false);

  // Resume an unfinished attempt after a refresh / authentication return.
  useEffect(() => {
    if (!view?.available || resumed.current || decision !== "accept") return;
    if (view.state === "processing" || view.state === "requires_action" || view.state === "payment_failed") {
      resumed.current = true;
      void runAction(view, key, "status");
    }
  }, [view, key, decision]);

  const usable = !!view && (view.available || state.phase === "done");
  const busy = state.phase === "processing";
  const isOwner = state.ownerId === id;

  function onClick() {
    if (!view) return setStore(key, { phase: "notice", ownerId: id, message: "This offer is available right after checkout." });
    if (state.phase === "done" && state.nextHref) return window.location.assign(state.nextHref);
    if (!view.available) return setStore(key, { phase: "notice", ownerId: id, message: view.unavailableMessage ?? "This offer isn't available right now." });
    if (busy) return;
    if (decision === "decline") return void runAction(view, key, "decline", id);
    if (view.offer?.billing === "recurring") return setStore(key, { phase: "consent", ownerId: id, message: null });
    void runAction(view, key, "accept", id);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        className={className}
        style={style}
        onClick={onClick}
        disabled={busy}
        aria-disabled={!usable || busy || undefined}
        aria-busy={busy && isOwner ? true : undefined}
        data-funnel-offer={decision}
      >
        {busy && isOwner && decision === "accept" ? (
          <span className="relative z-10 inline-flex items-center gap-2">
            <Spinner /> Processing…
          </span>
        ) : (
          children
        )}
      </button>
      {isOwner && view ? <InlinePanel view={view} storeKey={key} state={state} /> : null}
      {isOwner && !view && state.message ? (
        <p role="alert" className="mt-2 text-center text-sm text-neutral-700">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

async function runAction(view: FunnelOfferRuntimeView, key: string, action: "accept" | "decline" | "status", ownerId?: string, consent?: boolean) {
  setStore(key, { phase: "processing", ...(ownerId ? { ownerId } : {}), message: action === "decline" ? null : "Processing your purchase…" });
  let res: Awaited<ReturnType<typeof post>>;
  try {
    res = await post(view, action, consent);
  } catch {
    // A lost response isn't a failed payment: ask the server what happened (never re-charge).
    await new Promise((r) => setTimeout(r, 2000));
    try {
      res = await post(view, "status");
    } catch {
      return setStore(key, { phase: "notice", message: "We couldn't reach the server. Check your connection, then refresh this page — you won't be charged twice." });
    }
  }
  return applyResponse(view, key, res);
}

async function applyResponse(view: FunnelOfferRuntimeView, key: string, res: { ok: boolean; data: FunnelOfferActionResponse & { error?: string } }, polls = 0): Promise<void> {
  if (!res.ok) return setStore(key, { phase: "notice", message: res.data.error ?? "Something went wrong. Try again." });
  const d = res.data;
  if (d.state === "succeeded" || d.state === "declined") {
    setStore(key, { phase: "done", nextHref: d.nextHref ?? null, message: d.state !== "succeeded" ? null : d.acceptance === "trial_activation" ? "Your free trial has started." : "Thank you — your purchase is complete." });
    if (d.nextHref) window.location.assign(d.nextHref);
    return;
  }
  if (d.state === "requires_action") return setStore(key, { phase: "auth", clientSecret: d.clientSecret ?? null, intentType: d.intentType ?? "payment", message: null });
  if (d.state === "payment_failed") return setStore(key, { phase: "recovery", clientSecret: d.clientSecret ?? null, intentType: d.intentType ?? "payment", message: d.failure ?? "We couldn't complete the charge on your saved card." });
  if (d.state === "processing") {
    if (polls >= 30) return setStore(key, { phase: "notice", message: "Your payment is still processing. Refresh this page in a minute — you won't be charged twice." });
    setStore(key, { phase: "processing", message: "Processing your purchase…" });
    await new Promise((r) => setTimeout(r, 2000));
    const next = await post(view, "status").catch(() => null);
    if (!next) return setStore(key, { phase: "notice", message: "We couldn't reach the server. Refresh this page — you won't be charged twice." });
    return applyResponse(view, key, next, polls + 1);
  }
  setStore(key, { phase: "idle" });
}

function Spinner() {
  return <span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

const panelClass = "mx-auto mt-3 flex w-full max-w-md flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4 text-left text-sm text-neutral-800 shadow-sm";

function InlinePanel({ view, storeKey, state }: { view: FunnelOfferRuntimeView; storeKey: string; state: StoreState }) {
  if (state.phase === "consent" && view.offer) return <ConsentPanel view={view} storeKey={storeKey} />;
  if (state.phase === "auth") return <AuthPanel view={view} storeKey={storeKey} clientSecret={state.clientSecret} />;
  if (state.phase === "recovery") return <RecoveryPanel view={view} storeKey={storeKey} clientSecret={state.clientSecret} intentType={state.intentType} message={state.message} />;
  if (state.phase === "processing" && state.message)
    return (
      <p role="status" className="mt-2 text-center text-sm text-neutral-600">
        {state.message}
      </p>
    );
  if ((state.phase === "notice" || state.phase === "done") && state.message)
    return (
      <p role={state.phase === "notice" ? "alert" : "status"} className="mt-2 text-center text-sm text-neutral-700">
        {state.message}{" "}
        {state.phase === "done" && state.nextHref ? (
          <a href={state.nextHref} className="font-semibold underline">
            Continue
          </a>
        ) : null}
      </p>
    );
  return null;
}

function chargeDate(view: FunnelOfferRuntimeView): string | null {
  const iso = view.offer?.firstChargeDate;
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return null;
  }
}

function recurringLine(view: FunnelOfferRuntimeView): string {
  const o = view.offer!;
  if (o.trialDays > 0) {
    const date = chargeDate(view);
    return `$0 today — free for ${o.trialDays} ${o.trialDays === 1 ? "day" : "days"}, then ${o.amountLabel} every ${o.interval ?? "billing period"}${date ? ` starting ${date}` : ""}, until you cancel.`;
  }
  return `${o.amountLabel} every ${o.interval ?? "billing period"}, starting today, until you cancel.`;
}

function Terms({ view }: { view: FunnelOfferRuntimeView }) {
  const o = view.offer;
  if (!o || (!o.termsText && !o.termsUrl)) return null;
  return (
    <div className="text-xs text-neutral-600">
      {o.termsText ? <p className="whitespace-pre-line">{o.termsText}</p> : null}
      {o.termsUrl ? (
        <a href={o.termsUrl} target="_blank" rel="noreferrer" className="underline">
          Read the terms
        </a>
      ) : null}
    </div>
  );
}

function ConsentPanel({ view, storeKey }: { view: FunnelOfferRuntimeView; storeKey: string }) {
  const [agree, setAgree] = useState(false);
  const o = view.offer!;
  const trial = o.trialDays > 0;
  const date = chargeDate(view);
  return (
    <section aria-label="Confirm subscription" className={panelClass}>
      <p className="font-semibold">
        {o.title} — {trial ? `${o.trialDays}-day free trial` : "subscription"}
      </p>
      <p>
        {trial ? "" : "You'll be charged "}
        <strong>{recurringLine(view)}</strong>{" "}
        {view.hasSavedPaymentMethod ? (trial ? "We'll keep the payment method from your checkout on file for the charges after your trial." : "We'll use the payment method from your checkout.") : ""}
      </p>
      {trial ? <p className="text-xs text-neutral-600">Cancel before the trial ends and you won&apos;t be charged.</p> : null}
      <Terms view={view} />
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 size-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          {trial
            ? `I agree to start my free trial and to be charged ${o.amountLabel} every ${o.interval ?? "billing period"}${date ? ` from ${date}` : " after the trial"} until I cancel.`
            : `I agree to be charged ${o.amountLabel} every ${o.interval ?? "billing period"} until I cancel.`}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!agree}
          onClick={() => void runAction(view, storeKey, "accept", undefined, true)}
          className="rounded-full bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {trial ? "Start free trial" : "Confirm and subscribe"}
        </button>
        <button type="button" onClick={() => setStore(storeKey, { phase: "idle" })} className="rounded-full px-4 py-2 font-semibold underline">
          Go back
        </button>
      </div>
    </section>
  );
}

function AuthPanel({ view, storeKey, clientSecret }: { view: FunnelOfferRuntimeView; storeKey: string; clientSecret: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function verify() {
    const stripePromise = stripeFor(view);
    if (!stripePromise || !clientSecret) return setErr("Secure verification isn't available. Refresh the page and try again.");
    setBusy(true);
    setErr(null);
    const stripe = await stripePromise;
    if (!stripe) {
      setBusy(false);
      return setErr("Secure verification couldn't load. Check your connection and try again.");
    }
    const result = await stripe.handleNextAction({ clientSecret });
    setBusy(false);
    if (result.error) setErr(result.error.message ?? "Verification wasn't completed. You can try again.");
    // Either way the server decides (verified with Stripe) — never the browser.
    await runAction(view, storeKey, "status");
  }
  return (
    <section aria-label="Additional authentication required" className={panelClass}>
      <p className="font-semibold">Additional authentication required</p>
      <p>Your bank needs to confirm this payment. This is a one-time security step with Stripe.</p>
      {err ? (
        <p role="alert" className="text-red-700">
          {err}
        </p>
      ) : null}
      <button type="button" onClick={verify} disabled={busy} className="rounded-full bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Verifying…" : "Complete verification"}
      </button>
    </section>
  );
}

function RecoveryPanel({ view, storeKey, clientSecret, intentType, message }: { view: FunnelOfferRuntimeView; storeKey: string; clientSecret: string | null; intentType: "payment" | "setup"; message: string | null }) {
  const stripePromise = useMemo(() => stripeFor(view), [view]);
  const o = view.offer;
  return (
    <section aria-label="Update your payment method" className={panelClass}>
      <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-medium text-red-800">
        {message ?? "We couldn't complete the charge on your saved card."} Please use {intentType === "setup" ? "a card for your subscription" : "another payment method"} to continue.
      </div>
      {o ? (
        <p>
          <strong>{o.title}</strong> — {o.billing === "recurring" ? recurringLine(view) : `${o.amountLabel}, one-time.`}
        </p>
      ) : null}
      <Terms view={view} />
      {stripePromise && clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <RecoveryForm view={view} storeKey={storeKey} intentType={intentType} />
        </Elements>
      ) : (
        <p className="text-neutral-600">The secure payment form isn&apos;t available right now. Refresh the page and try again.</p>
      )}
      <button type="button" onClick={() => void runAction(view, storeKey, "decline")} className="self-center text-sm font-semibold underline">
        No thanks, continue without this offer
      </button>
    </section>
  );
}

function RecoveryForm({ view, storeKey, intentType }: { view: FunnelOfferRuntimeView; storeKey: string; intentType: "payment" | "setup" }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setErr(null);
    // A free trial authorizes the card (SetupIntent); everything else is a charge.
    const result =
      intentType === "setup"
        ? await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" })
        : await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    setBusy(false);
    if (result.error) {
      setErr(result.error.message ?? "That payment didn't go through. Try another payment method.");
      return;
    }
    await runAction(view, storeKey, "status");
  }
  const o = view.offer;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {o?.billing === "recurring" ? <p className="text-xs text-neutral-600">This card will be saved for your {o.amountLabel} / {o.interval ?? "period"} subscription.</p> : null}
      {err ? (
        <p role="alert" className="text-red-700">
          {err}
        </p>
      ) : null}
      <button type="submit" disabled={!stripe || busy} className="rounded-full bg-neutral-900 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? "Processing…" : intentType === "setup" ? "Save card and start free trial" : `Complete purchase${o ? ` — ${o.amountLabel}` : ""}`}
      </button>
    </form>
  );
}
