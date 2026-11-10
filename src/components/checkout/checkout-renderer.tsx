"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, ArrowRight, Check, CreditCard, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { ctaLabel, friendlyPaymentError, needsPayment } from "@/lib/checkout/display";
import type { CheckoutView } from "@/lib/checkout/view-types";
import { DEFAULT_CHECKOUT_PRESENTATION, effectiveShow, trimmedText, type CheckoutPresentation } from "@/lib/checkout/presentation";
import type { OrderTotals } from "@/types/checkout";
import {
  AgreementCheckbox,
  BuyerFields,
  CheckoutHeader,
  CouponField,
  MarketingOptIn,
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
  presentation: rawPresentation,
  mode,
  forcedStep,
  embedded = false,
}: {
  view: CheckoutView;
  /** Admin preview / builder: price locally instead of calling the public API. */
  previewQuote?: (bumpIds: string[], couponCode: string) => Promise<QuoteResponse>;
  device?: "desktop" | "tablet" | "mobile";
  /** Page Builder block presentation (Phase 3). Defaults to the hosted look. */
  presentation?: CheckoutPresentation;
  /** "builder": Page Builder canvas — never calls the public API or Stripe. */
  mode?: "public" | "preview" | "builder";
  /** Builder preview switcher (two-step): which step to show. Display only. */
  forcedStep?: 1 | 2;
  /** Rendered inside a page (Page Builder block) rather than as the page. */
  embedded?: boolean;
}) {
  const builder = mode === "builder";
  const preview = view.preview || builder || mode === "preview";
  const twoStep = view.format === "two_step";
  // Hosted pages (no block presentation) keep the Phase 2 layout exactly:
  // on a two-step checkout the code field is its own card on Step 2.
  const pres = rawPresentation ?? (twoStep ? { ...DEFAULT_CHECKOUT_PRESENTATION, couponPlacement: "before_payment" as const } : DEFAULT_CHECKOUT_PRESENTATION);
  const show = effectiveShow(pres, view);
  const text = trimmedText(pres.text);
  const [stepState, setStep] = useState<1 | 2>(1);
  const step = forcedStep ?? stepState;
  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER);
  const [agree, setAgree] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
  const startedEmail = useRef<string>("");
  const rootRef = useRef<HTMLDivElement>(null);
  const attribution = useRef<ReturnType<typeof readAttributionFromBrowser> | null>(null);
  const restored = useRef(false);
  const appliedCode = coupon.status === "applied" ? coupon.code : "";

  /* ----------------------------- server quotes ---------------------------- */
  const quote = useCallback(
    async (nextBumps: string[], code: string): Promise<QuoteResponse | null> => {
      if (builder && !previewQuote) return null;
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
    [builder, previewQuote, view.configId],
  );

  const applyRestoredSelection = useCallback(
    (ids: string[], code: string) => {
      const live = ids.filter((id) => view.bumps.some((b) => b.bumpId === id));
      setBumpIds(live);
      if (live.length || code) {
        void quote(live, code).then((d) => {
          if (d?.coupon?.applied) setCoupon({ status: "applied", code: d.coupon.code, label: d.coupon.label, scope: d.coupon.scope, recurringNote: d.coupon.recurringNote });
          else if (code && d?.coupon && !d.coupon.applied) setNotice(`Your code ${d.coupon.code} can no longer be used: ${d.coupon.message}`);
        });
      }
    },
    [quote, view.bumps],
  );

  /* ------------------------------ persistence ----------------------------- */
  useEffect(() => {
    attribution.current = readAttributionFromBrowser();
    if (preview) return;
    const params = new URLSearchParams(window.location.search);
    const resumeToken = params.get("resume");
    if (resumeToken) {
      // Abandoned-checkout link: prefill, then re-quote everything server-side.
      params.delete("resume");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
      void fetch(`/api/order-checkout/${view.configId}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resumeToken }) })
        .then((r) => (r.status === 429 ? { status: "busy" } : r.json().catch(() => ({}))))
        .then((d: { status?: string; sessionId?: string; buyer?: { name: string; email: string; phone: string }; bumpIds?: string[]; couponCode?: string | null }) => {
          if (d.status === "ok" && d.buyer) {
            const [first, ...rest] = d.buyer.name.split(" ");
            setBuyer({ ...EMPTY_BUYER, name: d.buyer.name, firstName: first ?? "", lastName: rest.join(" "), email: d.buyer.email, phone: d.buyer.phone });
            startedEmail.current = d.buyer.email;
            setSessionId(d.sessionId ?? null);
            applyRestoredSelection(d.bumpIds ?? [], d.couponCode ?? "");
            setNotice("Welcome back — we saved your details. Prices are checked again before you pay.");
          } else if (d.status === "completed") {
            setNotice("You've already completed this purchase. Check your email for access.");
          } else if (d.status === "busy") {
            setNotice("We couldn't load your saved details just now. Wait a few minutes and open the link again, or start below.");
          } else {
            setNotice("That checkout link has expired. You can start again below.");
          }
        })
        .catch(() => undefined);
      restored.current = true;
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(view.configId)) ?? "null") as { step?: 1 | 2; buyer?: Buyer; bumpIds?: string[]; coupon?: string; agree?: boolean; optIn?: boolean; sessionId?: string } | null;
      if (saved) {
        if (saved.buyer) setBuyer({ ...EMPTY_BUYER, ...saved.buyer });
        if (saved.agree) setAgree(true);
        if (saved.optIn) setOptIn(true);
        if (saved.sessionId) {
          setSessionId(saved.sessionId);
          startedEmail.current = saved.buyer?.email?.trim().toLowerCase() ?? "";
        }
        if (twoStep && saved.step === 2) setStep(2);
        applyRestoredSelection(saved.bumpIds ?? [], saved.coupon ?? "");
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
      sessionStorage.setItem(storageKey(view.configId), JSON.stringify({ step: stepState, buyer, bumpIds, coupon: appliedCode, agree, optIn, sessionId }));
    } catch {
      /* ignore */
    }
  }, [preview, view.configId, stepState, buyer, bumpIds, appliedCode, agree, optIn, sessionId]);

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

  const buyerBody = () => ({
    name: buyer.name,
    firstName: buyer.firstName,
    lastName: buyer.lastName,
    email: buyer.email,
    phone: buyer.phone,
    marketingOptIn: show.marketingOptIn && optIn,
    sessionId,
    bumpIds,
    couponCode: appliedCode,
    attribution: attribution.current,
  });
  const startBody = () => ({ ...buyerBody(), agreementAccepted: agree, replacesOrderId: lastOrderId.current });

  /**
   * One-step checkout start: once the buyer LEAVES the email field with a
   * valid address (not per keystroke), and once per address.
   */
  function onEmailCommitted() {
    if (preview || twoStep || !view.crm?.captureOnStart) return;
    const email = buyer.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === startedEmail.current) return;
    startedEmail.current = email;
    void fetch(`/api/order-checkout/${view.configId}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buyerBody()) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sessionId?: string | null } | null) => {
        if (d?.sessionId) setSessionId(d.sessionId);
      })
      .catch(() => undefined);
  }

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
      if (d.sessionId) setSessionId(d.sessionId);
      setStep(2);
      if (embedded) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
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
  const compact = device !== "desktop" || pres.layout === "single_column";
  const forceColumns = pres.layout === "two_column" && device === "desktop";
  const label = ctaLabel(text.submitLabel || view.display.submitLabel, totals);
  const payNeeded = needsPayment(totals);
  const agreementMissing = view.agreement.mode !== "notRequired" && !agree;
  const lineFor = (bumpId: string) => totals.lines.find((l) => l.bumpId === bumpId) ?? null;
  const couponExcludesBumps = coupon.status === "applied" && totals.lines.some((l) => l.role === "bump" && l.unitAmountCents > 0 && l.discountCents === 0);
  const Heading = preview || embedded ? "h2" : "h1";
  const widthClass = { full: "max-w-none", wide: "max-w-6xl", narrow: "max-w-xl" }[pres.width];
  const buttonPres = { width: pres.buttonWidth, align: pres.buttonAlign };
  const shell = (children: React.ReactNode) => (
    <div
      ref={rootRef}
      className={cn("w-full", widthClass, pres.alignment === "center" ? "mx-auto" : "me-auto", pres.container === "card" && "tenant-card rounded-2xl p-4 sm:p-6")}
      data-checkout-preset={pres.preset}
      data-checkout-layout={compact ? "stacked" : "columns"}
    >
      {children}
    </div>
  );

  if (unavailable) {
    return shell(
      <div className="mx-auto w-full max-w-lg py-10">
        <div className="tenant-card rounded-2xl p-8 text-center" role="alert">
          <h2 className="tenant-display text-title-lg">This offer isn&apos;t available</h2>
          <p className="text-muted-foreground mt-2 text-body-sm">{unavailable} You haven&apos;t been charged.</p>
        </div>
      </div>,
    );
  }
  if (done) {
    return shell(
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
      </div>,
    );
  }

  // Stacked (phones, single-column preset, compact previews): one column in
  // reading order. Columns (from 1024px, or always for "two column" on a
  // desktop canvas): content one side, sticky summary the other.
  const colsAt = forceColumns ? "grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-start gap-6" : "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-6";
  const container = compact ? "flex flex-col gap-5" : cn("flex flex-col gap-5", colsAt, pres.summaryPosition === "left" && (forceColumns ? "grid-cols-[minmax(0,380px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"));
  const leftCol = compact ? "contents" : forceColumns ? "flex flex-col gap-5" : "contents lg:flex lg:flex-col lg:gap-5";
  const summaryOrder = pres.mobileSummary === "top" ? "order-0" : "order-4";
  const rightCol = compact
    ? cn(summaryOrder, "flex flex-col gap-5")
    : forceColumns
      ? cn("sticky top-6 flex flex-col gap-5", pres.summaryPosition === "left" && "order-first")
      : cn(summaryOrder, "flex flex-col gap-5 lg:sticky lg:top-6", pres.summaryPosition === "left" ? "lg:order-first" : "lg:order-none");

  const bumpsSection = show.bumps && (
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
          variant={pres.bumpStyle}
          showImage={pres.showBumpImages}
          showDescription={pres.showBumpDescriptions}
        />
      ))}
    </section>
  );
  const couponField = show.couponField ? <CouponField state={coupon} input={couponInput} setInput={setCouponInput} onApply={applyCoupon} onRemove={removeCoupon} /> : null;
  const couponInSummary = pres.couponPlacement === "summary";
  const couponCard = couponField && !couponInSummary && (
    <section className="tenant-card rounded-2xl p-5" aria-labelledby="co-coupon-title">
      <h2 id="co-coupon-title" className="mb-3 font-semibold text-body">Have a discount code?</h2>
      {couponField}
    </section>
  );

  const optInBox = show.marketingOptIn && view.crm?.marketingOptIn ? <MarketingOptIn label={view.crm.marketingOptIn.label} checked={optIn} onChange={setOptIn} /> : null;

  const paymentSection = (
    <section className="tenant-card flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="co-pay-title">
      <h2 id="co-pay-title" className="font-semibold text-title-md">{payNeeded ? "Payment details" : "Confirm your order"}</h2>
      {notice && <p className="tenant-soft rounded-lg p-3 text-body-sm" role="status">{notice}</p>}
      {preview ? (
        <>
          {payNeeded && <EditorPaymentPlaceholder builder={builder} />}
          <AgreementCheckbox view={view} checked={agree} onChange={setAgree} />
          <SubmitButton label={label} disabled busy={false} pres={buttonPres} />
        </>
      ) : !payNeeded ? (
        <FreeSubmit view={view} agree={agree} setAgree={setAgree} label={label} buildBody={startBody} onError={handleStartError} onOrder={(id) => (lastOrderId.current = id)} onDone={finish} pres={buttonPres} />
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
            pres={buttonPres}
          />
        </Elements>
      )}
      {formError && <p className="text-destructive text-body-sm" role="alert">{formError}</p>}
    </section>
  );

  const summary = (title?: string) => (
    <OrderSummary view={view} totals={totals} quoting={quoting} coupon={coupon} title={title} concise={!show.orderSummary} showSecure={show.trust} thumbnails={{ primary: show.offerImage, bumps: pres.showBumpImages }}>
      {couponInSummary ? couponField : null}
    </OrderSummary>
  );
  const intro = (compactIntro?: boolean) => (
    <OfferIntro view={view} totals={totals} compact={compactIntro} showImage={show.offerImage} showDescription={show.offerDescription} showBenefits={show.benefits} />
  );
  const step1Title = text.step1Title || "Your information";
  const step2Title = text.step2Title || "Payment & review";
  const headingText = twoStep
    ? step === 1
      ? text.step1Title || "Complete your information"
      : step2Title
    : text.heading || view.display.headline || "Complete your order";
  const subheading = text.subheading || view.display.subheadline;
  const detailsSection = (
    <section className="tenant-card rounded-2xl p-5" aria-labelledby="co-details-title">
      <h2 id="co-details-title" className="mb-4 font-semibold text-title-md">Your information</h2>
      <BuyerFields view={view} buyer={buyer} setBuyer={setBuyer} errors={errors} onEmailBlur={onEmailCommitted} />
      {optInBox && <div className="mt-4">{optInBox}</div>}
    </section>
  );
  const payBlock = (
    <>
      {pres.bumpPlacement === "before_payment" && bumpsSection}
      {couponCard}
      {paymentSection}
      {pres.bumpPlacement === "after_payment" && bumpsSection}
    </>
  );

  return shell(
    <>
      {show.header && <CheckoutHeader brand={view.brand} />}
      {(show.heading || (show.subheading && subheading) || show.progress) && (
        <div className={cn(show.header ? "py-6" : "pb-6", pres.alignment === "center" && pres.width === "narrow" && "text-center")}>
          {show.heading && <Heading className="tenant-display text-display-md text-balance">{headingText}</Heading>}
          {show.subheading && subheading && <p className="text-muted-foreground mt-2 max-w-2xl text-body">{subheading}</p>}
          {show.progress && (
            <div className={cn("mt-5 max-w-xl", pres.alignment === "center" && pres.width === "narrow" && "mx-auto")}>
              <ProgressSteps step={step} labels={[step1Title, step2Title]} />
            </div>
          )}
        </div>
      )}

      {!twoStep && (
        <div className={container}>
          <div className={leftCol}>
            <div className="order-1">{intro()}</div>
            <div className="order-2">{detailsSection}</div>
            <div className="order-5 flex flex-col gap-5">{payBlock}</div>
            {show.guarantee && (
              <div className="order-6">
                <TrustRow view={view} />
              </div>
            )}
          </div>
          <aside className={rightCol} aria-label="Order summary">
            {summary()}
          </aside>
        </div>
      )}

      {twoStep && step === 1 && (
        <div className={show.summaryOnStep1 ? container : "flex flex-col gap-5"}>
          <div className={show.summaryOnStep1 ? leftCol : "contents"}>
            <section className="tenant-card order-1 rounded-2xl p-5" aria-labelledby="co-details-title">
              <h2 id="co-details-title" className="mb-4 font-semibold text-title-md">Your information</h2>
              <BuyerFields view={view} buyer={buyer} setBuyer={setBuyer} errors={errors} />
              {optInBox && <div className="mt-4">{optInBox}</div>}
              <ActionButton onClick={continueToPayment} pres={buttonPres} className="mt-6">
                {text.continueLabel || "Continue to payment"} <ArrowRight className="size-4" aria-hidden />
              </ActionButton>
              {formError && <p className="text-destructive mt-3 text-body-sm" role="alert">{formError}</p>}
              <p className="text-muted-foreground mt-4 flex items-center gap-2 text-caption">
                <Lock className="size-3.5 shrink-0" aria-hidden /> Your details are only used for this order.
              </p>
            </section>
          </div>
          {show.summaryOnStep1 && (
            <aside className={cn(rightCol, "order-2")} aria-label="Your order">
              {intro(true)}
              {summary("Your order")}
            </aside>
          )}
        </div>
      )}

      {twoStep && step === 2 && (
        <div className={container}>
          <div className={leftCol}>
            <div className="order-1">
              <button type="button" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-body-sm" onClick={() => setStep(1)} disabled={!!forcedStep}>
                <ArrowLeft className="size-4" aria-hidden /> Edit your information
                <span className="sr-only"> ({buyer.email})</span>
              </button>
            </div>
            <div className="order-2 flex flex-col gap-5">{payBlock}</div>
            {show.guarantee && (
              <div className="order-6">
                <TrustRow view={view} />
              </div>
            )}
          </div>
          <aside className={rightCol} aria-label="Order summary">
            {summary("Your order")}
            {show.trust && <WhatHappensNext totals={totals} />}
          </aside>
        </div>
      )}
    </>,
  );
}

/* ------------------------------ submit pieces ------------------------------ */

type ButtonPres = { width: "full" | "auto"; align: "left" | "center" };

function ActionButton({ onClick, pres, className, children }: { onClick: () => void; pres: ButtonPres; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex", pres.align === "center" ? "justify-center" : "justify-start", className)}>
      <button type="button" onClick={onClick} className={cn("tenant-button inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 font-semibold text-body", pres.width === "full" && "w-full")}>
        {children}
      </button>
    </div>
  );
}

function SubmitButton({ label, disabled, busy, pres }: { label: string; disabled: boolean; busy: boolean; pres: ButtonPres }) {
  return (
    <div className={cn("flex", pres.align === "center" ? "justify-center" : "justify-start")}>
      <button type="submit" disabled={disabled || busy} className={cn("tenant-button inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 font-semibold text-body disabled:opacity-60", pres.width === "full" && "w-full")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
        {busy ? "Processing…" : label}
      </button>
    </div>
  );
}

/** Editor / preview stand-in for Stripe's fields — never a real input. */
function EditorPaymentPlaceholder({ builder }: { builder: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-checkout-payment="placeholder">
      <div aria-hidden className="text-muted-foreground flex h-11 items-center justify-between rounded-lg border px-3 text-body-sm">
        <span className="flex items-center gap-2">
          <CreditCard className="size-4" /> Card number
        </span>
        <span>MM / YY · CVC</span>
      </div>
      <p className="text-muted-foreground text-caption">
        {builder ? "Stripe's secure payment fields appear here on the published page. Payments can't be taken in the editor." : "The secure Stripe payment form appears here. Preview never takes payments."}
      </p>
    </div>
  );
}

type StartError = (d: { error?: string; fields?: Record<string, string>; code?: string }, status: number) => Promise<void>;

async function postStart(view: CheckoutView, body: Record<string, unknown>) {
  const r = await fetch(`/api/order-checkout/${view.configId}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

/** Nothing to pay (free Offer, or a 100% discount on a one-time order). */
function FreeSubmit({ view, agree, setAgree, label, buildBody, onError, onOrder, onDone, pres }: { view: CheckoutView; agree: boolean; setAgree: (v: boolean) => void; label: string; buildBody: () => Record<string, unknown>; onError: StartError; onOrder: (id: string) => void; onDone: (orderId: string) => Promise<void>; pres: ButtonPres }) {
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
      <SubmitButton label={label} disabled={false} busy={busy} pres={pres} />
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
  pres,
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
  pres: ButtonPres;
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
      <PaymentElement options={{ layout: "tabs", ...(view.brand.name ? { business: { name: view.brand.name } } : {}) }} />
      {view.billingAddress === "full" ? (
        <AddressElement options={{ mode: "billing" }} />
      ) : (
        <p className="text-muted-foreground text-caption">Billing details are collected securely by Stripe with your payment.</p>
      )}
      <AgreementCheckbox view={view} checked={agree} onChange={setAgree} error={agreeError} />
      <SubmitButton label={label} disabled={!stripe} busy={busy} pres={pres} />
    </form>
  );
}
