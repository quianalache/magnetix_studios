"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { ctaLabel, friendlyPaymentError, needsPayment } from "@/lib/checkout/display";
import type { CheckoutView } from "@/lib/checkout/view-types";
import type { OrderTotals } from "@/types/checkout";
import {
  AgreementCheckbox,
  BuyerFields,
  CheckoutHeader,
  CouponField,
  OfferIntro,
  OrderBumpCard,
  OrderSummary,
  ProgressSteps,
  TrustRow,
  WhatHappensNext,
  type Buyer,
  type CouponState,
} from "@/components/checkout/public/checkout-parts";

/**
 * The shared public checkout (Checkout Foundation Phase 2). One renderer for
 * a Funnel Checkout Step, an Offer's hosted checkout and the admin preview;
 * built from the presentational parts in ./public so the Page Builder block
 * can reuse them. Every price, discount and add-on comes from the server.
 *
 * Payment: Stripe Payment Element with a deferred intent. The Element shows
 * the current amount; on submit the server creates the order and the
 * PaymentIntent / Subscription, then the Element confirms it.
 */

type QuoteCoupon = { code: string; applied: true; label: string; scope: string; recurringNote: string | null } | { code: string; applied: false; message: string } | null;
export type QuoteResponse = { totals: OrderTotals; coupon: QuoteCoupon; removedBumpIds?: string[] };

const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string, account: string | null) {
  const k = `${key}|${account ?? ""}`;
  if (!stripeCache.has(k)) stripeCache.set(k, loadStripe(key, account ? { stripeAccount: account } : undefined));
  return stripeCache.get(k)!;
}

type ElementsMode = { mode: "payment" | "subscription" | "setup"; currency: string; amount?: number; setupFutureUsage?: "off_session" };
function elementsModeFor(totals: OrderTotals): ElementsMode {
  const currency = totals.currency.toLowerCase();
  if (totals.dueTodayCents <= 0) return { mode: "setup", currency };
  if (totals.recurring) return { mode: "subscription", amount: totals.dueTodayCents, currency };
  return { mode: "payment", amount: totals.dueTodayCents, currency, setupFutureUsage: "off_session" };
}

const EMPTY_BUYER: Buyer = { name: "", firstName: "", lastName: "", email: "", phone: "" };
const storageKey = (configId: string) => `mx-checkout:${configId}`;

export function CheckoutRenderer({
  view,
  previewQuote,
  device = "desktop",
}: {
  view: CheckoutView;
  /** Admin preview: price locally instead of calling the public API. */
  previewQuote?: (bumpIds: string[], couponCode: string) => Promise<QuoteResponse>;
  device?: "desktop" | "tablet" | "mobile";
}) {
  const preview = view.preview;
  const twoStep = view.format === "two_step";
  const [step, setStep] = useState<1 | 2>(1);
  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER);
  const [agree, setAgree] = useState(false);
  const [bumpIds, setBumpIds] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState>({ status: "empty" });
  const [totals, setTotals] = useState<OrderTotals>(view.initialTotals);
  const [quoting, setQuoting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; text: string; href: string | null } | null>(null);
  const lastOrderId = useRef<string | null>(null);
  const attribution = useRef<ReturnType<typeof readAttributionFromBrowser> | null>(null);
  const restored = useRef(false);
  const appliedCode = coupon.status === "applied" ? coupon.code : "";

  /* ----------------------------- server quotes ---------------------------- */
  const quote = useCallback(
    async (nextBumps: string[], code: string): Promise<QuoteResponse | null> => {
      setQuoting(true);
      try {
        const data: QuoteResponse | null = previewQuote
          ? await previewQuote(nextBumps, code)
          : await fetch(`/api/order-checkout/${view.configId}/quote`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bumpIds: nextBumps, couponCode: code }),
            }).then(async (r) => {
              const d = await r.json().catch(() => ({}));
              if (r.status === 404) {
                setUnavailable(d.error ?? "This offer is no longer available.");
                return null;
              }
              if (!r.ok) throw new Error(d.error ?? "Couldn't update your total.");
              return d;
            });
        if (!data) return null;
        setTotals(data.totals);
        if (data.removedBumpIds?.length) {
          const removed = data.removedBumpIds;
          setBumpIds((ids) => ids.filter((id) => !removed.includes(id)));
          setNotice("An add-on you chose is no longer available, so it was removed from your order.");
        }
        return data;
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Couldn't update your total. Check your connection.");
        return null;
      } finally {
        setQuoting(false);
      }
    },
    [previewQuote, view.configId],
  );

  /* ------------------------------ persistence ----------------------------- */
  useEffect(() => {
    attribution.current = readAttributionFromBrowser();
    if (preview) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(view.configId)) ?? "null") as { step?: 1 | 2; buyer?: Buyer; bumpIds?: string[]; coupon?: string; agree?: boolean } | null;
      if (saved) {
        if (saved.buyer) setBuyer({ ...EMPTY_BUYER, ...saved.buyer });
        if (saved.agree) setAgree(true);
        if (twoStep && saved.step === 2) setStep(2);
        const ids = (saved.bumpIds ?? []).filter((id) => view.bumps.some((b) => b.bumpId === id));
        setBumpIds(ids);
        if (ids.length || saved.coupon) {
          void quote(ids, saved.coupon ?? "").then((d) => {
            if (d?.coupon?.applied) setCoupon({ status: "applied", code: d.coupon.code, label: d.coupon.label, scope: d.coupon.scope, recurringNote: d.coupon.recurringNote });
          });
        }
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    restored.current = true;
    // Restore once per checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.configId]);

  useEffect(() => {
    if (preview || !restored.current) return;
    try {
      // Never store prices — they're always re-quoted from the server.
      sessionStorage.setItem(storageKey(view.configId), JSON.stringify({ step, buyer, bumpIds, coupon: appliedCode, agree }));
    } catch {
      /* ignore */
    }
  }, [preview, view.configId, step, buyer, bumpIds, appliedCode, agree]);

  useEffect(() => setTotals(view.initialTotals), [view.initialTotals]);

  /* ------------------------------- actions -------------------------------- */
  function toggleBump(id: string) {
    const next = bumpIds.includes(id) ? bumpIds.filter((b) => b !== id) : [...bumpIds, id];
    setBumpIds(next);
    setNotice(null);
    void quote(next, appliedCode);
  }
  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCoupon({ status: "applying", code });
    const d = await quote(bumpIds, code);
    if (d?.coupon?.applied) {
      setCoupon({ status: "applied", code: d.coupon.code, label: d.coupon.label, scope: d.coupon.scope, recurringNote: d.coupon.recurringNote });
      setCouponInput("");
    } else setCoupon({ status: "error", code, message: d?.coupon && !d.coupon.applied ? d.coupon.message : "That code isn't valid." });
  }
  function removeCoupon() {
    setCoupon({ status: "empty" });
    void quote(bumpIds, "");
  }

  const buyerBody = () => ({ name: buyer.name, firstName: buyer.firstName, lastName: buyer.lastName, email: buyer.email, phone: buyer.phone });
  const startBody = () => ({ ...buyerBody(), bumpIds, couponCode: appliedCode, agreementAccepted: agree, attribution: attribution.current, replacesOrderId: lastOrderId.current });

  async function continueToPayment() {
    setErrors({});
    setFormError(null);
    if (preview) return setStep(2);
    try {
      const r = await fetch(`/api/order-checkout/${view.configId}/buyer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buyerBody()) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrors(d.fields ?? {});
        setFormError(d.error ?? "Check your details.");
        return;
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("We couldn't reach the checkout. Check your connection and try again.");
    }
  }

  /** Handle a server refusal from /start in buyer terms. */
  const handleStartError = useCallback(
    async (d: { error?: string; fields?: Record<string, string>; code?: string }, status: number) => {
      if (d.code === "coupon") {
        setCoupon({ status: "error", code: appliedCode, message: d.error ?? "That code can no longer be used." });
        await quote(bumpIds, "");
        setFormError("Your discount code can no longer be used, so it was removed. Review your total and try again.");
        return;
      }
      if (d.code === "stale_bump") {
        await quote(bumpIds, appliedCode);
        setFormError(d.error ?? "Your order changed. Review it and try again.");
        return;
      }
      if (status === 404 || d.code === "unavailable") {
        setUnavailable(d.error ?? "This offer is no longer available.");
        return;
      }
      const fields = d.fields ?? {};
      setErrors(fields);
      setFormError(d.error ?? "We couldn't start checkout. Try again.");
      if (twoStep && (fields.name || fields.email || fields.phone || fields.firstName || fields.lastName)) setStep(1);
    },
    [appliedCode, bumpIds, quote, twoStep],
  );

  const finish = useCallback(
    async (orderId: string) => {
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`/api/order-checkout/${view.configId}/orders/${orderId}`).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (d.status === "paid") {
          try {
            sessionStorage.removeItem(storageKey(view.configId));
          } catch {
            /* ignore */
          }
          const needsSignIn = typeof d.redirectTo === "string" && d.redirectTo.startsWith("/my/login");
          if (d.redirectTo && !needsSignIn) {
            window.location.href = d.redirectTo;
            return;
          }
          setDone({
            title: "You're all set",
            text: needsSignIn ? `Your purchase is complete and saved to ${d.maskedEmail}. Sign in with that email to open it.` : "Your purchase is complete.",
            href: d.redirectTo || null,
          });
          return;
        }
        if (d.status === "failed" || d.status === "canceled") {
          setDone(null);
          setFormError("Your payment didn't go through. You haven't been charged — please try again.");
          return;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      setDone({ title: "Payment received", text: "We're finishing your order. You'll get access in a moment — you can safely close this page.", href: null });
    },
    [view.configId],
  );

  // Return from a redirect-based payment method (?order=…).
  useEffect(() => {
    if (preview) return;
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (orderId) {
      setDone({ title: "Finishing your order…", text: "This only takes a moment.", href: null });
      void finish(orderId);
    }
  }, [finish, preview]);

  /* -------------------------------- layout -------------------------------- */
  const compact = device !== "desktop";
  const label = ctaLabel(view.display.submitLabel, totals);
  const payNeeded = needsPayment(totals);
  const agreementMissing = view.agreement.mode !== "notRequired" && !agree;
  const lineFor = (bumpId: string) => totals.lines.find((l) => l.bumpId === bumpId) ?? null;
  const couponExcludesBumps = coupon.status === "applied" && totals.lines.some((l) => l.role === "bump" && l.unitAmountCents > 0 && l.discountCents === 0);
  const Heading = preview ? "h2" : "h1";

  if (unavailable) {
    return (
      <div className="mx-auto w-full max-w-lg py-10">
        <div className="tenant-card rounded-2xl p-8 text-center" role="alert">
          <h2 className="tenant-display text-title-lg">This offer isn&apos;t available</h2>
          <p className="text-muted-foreground mt-2 text-body-sm">{unavailable} You haven&apos;t been charged.</p>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mx-auto w-full max-w-lg py-10">
        <div className="tenant-card rounded-2xl p-8 text-center" role="status">
          <div className="tenant-mark mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
            {done.title.startsWith("Finishing") ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Check className="size-6" aria-hidden />}
          </div>
          <h2 className="tenant-display text-title-lg">{done.title}</h2>
          <p className="text-muted-foreground mt-2 text-body-sm">{done.text}</p>
          {done.href && (
            <a href={done.href} className="tenant-button mt-6 inline-flex h-11 items-center justify-center rounded-lg px-6 font-semibold text-body-sm">
              Continue
            </a>
          )}
        </div>
      </div>
    );
  }

  // Phones (and the compact admin preview): one column, sections ordered for
  // reading. From 1024px: content left, sticky summary right.
  const container = compact ? "flex flex-col gap-5" : "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-6";
  const leftCol = compact ? "contents" : "contents lg:flex lg:flex-col lg:gap-5";
  const rightCol = compact ? "order-4 flex flex-col gap-5" : "order-4 flex flex-col gap-5 lg:order-none lg:sticky lg:top-6";

  const bumpsSection = view.bumps.length > 0 && (
    <section className="flex flex-col gap-3" aria-labelledby="co-bumps-title">
      <h2 id="co-bumps-title" className="font-semibold text-body">
        Add to your order <span className="text-muted-foreground font-normal">(optional)</span>
      </h2>
      {view.bumps.map((b) => (
        <OrderBumpCard
          key={b.bumpId}
          bump={b}
          selected={bumpIds.includes(b.bumpId)}
          onToggle={() => toggleBump(b.bumpId)}
          line={bumpIds.includes(b.bumpId) ? lineFor(b.bumpId) : null}
          couponExcludesBumps={couponExcludesBumps}
          currency={totals.currency}
          disabled={quoting && !previewQuote}
        />
      ))}
    </section>
  );
  const couponField = view.couponsEnabled ? <CouponField state={coupon} input={couponInput} setInput={setCouponInput} onApply={applyCoupon} onRemove={removeCoupon} /> : null;

  const paymentSection = (
    <section className="tenant-card flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="co-pay-title">
      <h2 id="co-pay-title" className="font-semibold text-title-md">{payNeeded ? "Payment details" : "Confirm your order"}</h2>
      {notice && <p className="tenant-soft rounded-lg p-3 text-body-sm" role="status">{notice}</p>}
      {preview ? (
        <>
          {payNeeded && <div className="tenant-soft text-muted-foreground rounded-xl p-4 text-body-sm">The secure Stripe payment form appears here. Preview never takes payments.</div>}
          <AgreementCheckbox view={view} checked={agree} onChange={setAgree} />
          <SubmitButton label={label} disabled busy={false} />
        </>
      ) : !payNeeded ? (
        <FreeSubmit view={view} agree={agree} setAgree={setAgree} label={label} buildBody={startBody} onError={handleStartError} onOrder={(id) => (lastOrderId.current = id)} onDone={finish} />
      ) : !view.payment.ready || !view.payment.publishableKey ? (
        <div className="tenant-soft text-muted-foreground rounded-xl p-4 text-body-sm" role="alert">{view.payment.message ?? "Card payments aren't available right now."}</div>
      ) : (
        <Elements
          stripe={stripeFor(view.payment.publishableKey, view.payment.stripeAccount)}
          options={{ ...elementsModeFor(totals), appearance: { theme: "stripe", variables: { colorPrimary: view.brand.primary ?? undefined, borderRadius: "10px" } } } as StripeElementsOptions}
        >
          <PayForm
            view={view}
            totals={totals}
            agree={agree}
            setAgree={setAgree}
            agreementMissing={agreementMissing}
            label={label}
            buildBody={startBody}
            onError={handleStartError}
            onOrder={(id) => (lastOrderId.current = id)}
            onPaymentError={(msg) => setFormError(msg)}
            onDone={finish}
            clearError={() => setFormError(null)}
          />
        </Elements>
      )}
      {formError && <p className="text-destructive text-body-sm" role="alert">{formError}</p>}
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <CheckoutHeader brand={view.brand} />
      <div className="py-6">
        <Heading className="tenant-display text-display-md text-balance">
          {twoStep ? (step === 1 ? "Complete your information" : "Payment & review") : view.display.headline || "Complete your order"}
        </Heading>
        {view.display.subheadline && <p className="text-muted-foreground mt-2 max-w-2xl text-body">{view.display.subheadline}</p>}
        {twoStep && (
          <div className="mt-5 max-w-xl">
            <ProgressSteps step={step} />
          </div>
        )}
      </div>

      {!twoStep && (
        <div className={container}>
          <div className={leftCol}>
            <div className="order-1">
              <OfferIntro view={view} totals={totals} />
            </div>
            <section className="tenant-card order-2 rounded-2xl p-5" aria-labelledby="co-details-title">
              <h2 id="co-details-title" className="mb-4 font-semibold text-title-md">Your information</h2>
              <BuyerFields view={view} buyer={buyer} setBuyer={setBuyer} errors={errors} />
            </section>
            {bumpsSection && <div className="order-3">{bumpsSection}</div>}
            <div className="order-5">{paymentSection}</div>
            <div className="order-6">
              <TrustRow view={view} />
            </div>
          </div>
          <aside className={rightCol} aria-label="Order summary">
            <OrderSummary view={view} totals={totals} quoting={quoting} coupon={coupon}>
              {couponField}
            </OrderSummary>
          </aside>
        </div>
      )}

      {twoStep && step === 1 && (
        <div className={container}>
          <div className={leftCol}>
            <section className="tenant-card order-1 rounded-2xl p-5" aria-labelledby="co-details-title">
              <h2 id="co-details-title" className="mb-4 font-semibold text-title-md">Your information</h2>
              <BuyerFields view={view} buyer={buyer} setBuyer={setBuyer} errors={errors} />
              <button type="button" onClick={continueToPayment} className="tenant-button mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg font-semibold text-body">
                Continue to payment <ArrowRight className="size-4" aria-hidden />
              </button>
              {formError && <p className="text-destructive mt-3 text-body-sm" role="alert">{formError}</p>}
              <p className="text-muted-foreground mt-4 flex items-center gap-2 text-caption">
                <Lock className="size-3.5 shrink-0" aria-hidden /> Your details are only used for this order.
              </p>
            </section>
          </div>
          <aside className={cn(rightCol, "order-2")} aria-label="Your order">
            <OfferIntro view={view} totals={totals} compact />
            <OrderSummary view={view} totals={totals} quoting={quoting} coupon={coupon} title="Your order" />
          </aside>
        </div>
      )}

      {twoStep && step === 2 && (
        <div className={container}>
          <div className={leftCol}>
            <div className="order-1">
              <button type="button" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-body-sm" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" aria-hidden /> Edit your information
                <span className="sr-only"> ({buyer.email})</span>
              </button>
            </div>
            {bumpsSection && <div className="order-2">{bumpsSection}</div>}
            {couponField && (
              <section className="tenant-card order-3 rounded-2xl p-5" aria-labelledby="co-coupon-title">
                <h2 id="co-coupon-title" className="mb-3 font-semibold text-body">Have a discount code?</h2>
                {couponField}
              </section>
            )}
            <div className="order-5">{paymentSection}</div>
            <div className="order-6">
              <TrustRow view={view} />
            </div>
          </div>
          <aside className={rightCol} aria-label="Order summary">
            <OrderSummary view={view} totals={totals} quoting={quoting} coupon={coupon} title="Your order" />
            <WhatHappensNext totals={totals} />
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ submit pieces ------------------------------ */

function SubmitButton({ label, disabled, busy }: { label: string; disabled: boolean; busy: boolean }) {
  return (
    <button type="submit" disabled={disabled || busy} className="tenant-button inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg font-semibold text-body disabled:opacity-60">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
      {busy ? "Processing…" : label}
    </button>
  );
}

type StartError = (d: { error?: string; fields?: Record<string, string>; code?: string }, status: number) => Promise<void>;

async function postStart(view: CheckoutView, body: Record<string, unknown>) {
  const r = await fetch(`/api/order-checkout/${view.configId}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

/** Nothing to pay (free Offer, or a 100% discount on a one-time order). */
function FreeSubmit({ view, agree, setAgree, label, buildBody, onError, onOrder, onDone }: { view: CheckoutView; agree: boolean; setAgree: (v: boolean) => void; label: string; buildBody: () => Record<string, unknown>; onError: StartError; onOrder: (id: string) => void; onDone: (orderId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [agreeError, setAgreeError] = useState<string | undefined>();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (view.agreement.mode !== "notRequired" && !agree) return setAgreeError("Please agree to the terms to continue.");
    setAgreeError(undefined);
    setBusy(true);
    try {
      const res = await postStart(view, buildBody());
      if (!res.ok) return await onError(res.data, res.status);
      onOrder(res.data.orderId);
      await onDone(res.data.orderId);
    } catch {
      await onError({ error: "We couldn't reach the checkout. Check your connection and try again." }, 0);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground text-body-sm">Nothing to pay today — no card needed.</p>
      <AgreementCheckbox view={view} checked={agree} onChange={setAgree} error={agreeError} />
      <SubmitButton label={label} disabled={false} busy={busy} />
    </form>
  );
}

function PayForm({
  view,
  totals,
  agree,
  setAgree,
  agreementMissing,
  label,
  buildBody,
  onError,
  onOrder,
  onPaymentError,
  onDone,
  clearError,
}: {
  view: CheckoutView;
  totals: OrderTotals;
  agree: boolean;
  setAgree: (v: boolean) => void;
  agreementMissing: boolean;
  label: string;
  buildBody: () => Record<string, unknown>;
  onError: StartError;
  onOrder: (id: string) => void;
  onPaymentError: (msg: string) => void;
  onDone: (orderId: string) => Promise<void>;
  clearError: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [agreeError, setAgreeError] = useState<string | undefined>();
  const modeOptions = useMemo(() => elementsModeFor(totals), [totals]);

  useEffect(() => {
    elements?.update(modeOptions as never);
  }, [elements, modeOptions]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (agreementMissing) return setAgreeError("Please agree to the terms to continue.");
    setAgreeError(undefined);
    clearError();
    setBusy(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) return onPaymentError(friendlyPaymentError(submitError));
      let res: Awaited<ReturnType<typeof postStart>>;
      try {
        res = await postStart(view, buildBody());
      } catch {
        return onPaymentError("We couldn't reach the checkout. Check your connection and try again — you haven't been charged.");
      }
      if (!res.ok) return await onError(res.data, res.status);
      onOrder(res.data.orderId);
      if (res.data.next === "redirect") return await onDone(res.data.orderId);
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set("order", res.data.orderId);
      const result =
        res.data.intentType === "setup"
          ? await stripe.confirmSetup({ elements, clientSecret: res.data.clientSecret, confirmParams: { return_url: returnUrl.toString() }, redirect: "if_required" })
          : await stripe.confirmPayment({ elements, clientSecret: res.data.clientSecret, confirmParams: { return_url: returnUrl.toString() }, redirect: "if_required" });
      if (result.error) {
        // Diagnostic only (type/code — never card data) to help support.
        console.warn("[checkout] payment not completed", result.error.type, result.error.code ?? "", result.error.message ?? "");
        return onPaymentError(friendlyPaymentError(result.error));
      }
      await onDone(res.data.orderId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {view.billingAddress === "full" ? (
        <AddressElement options={{ mode: "billing" }} />
      ) : (
        <p className="text-muted-foreground text-caption">Billing details are collected securely by Stripe with your payment.</p>
      )}
      <AgreementCheckbox view={view} checked={agree} onChange={setAgree} error={agreeError} />
      <SubmitButton label={label} disabled={!stripe} busy={busy} />
    </form>
  );
}
