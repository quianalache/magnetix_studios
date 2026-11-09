"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Check, Loader2, Lock, ShieldCheck, Tag as TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatMoney, recurringTermsText } from "@/lib/checkout/pricing";
import { readAttributionFromBrowser } from "@/lib/attribution";
import type { CheckoutView } from "@/lib/checkout/view-types";
import type { OrderTotals } from "@/types/checkout";

/**
 * The shared buyer checkout (Checkout Foundation Phase 1). Renders a
 * CheckoutView from the server for: a Funnel Checkout Step, an Offer's
 * hosted checkout, and the admin live preview. Every price, discount and
 * bump comes back from the server; this component only displays it.
 *
 * Payment: Stripe Payment Element with a deferred intent. The Element is
 * shown with the current amount; on submit the server creates the order
 * and the PaymentIntent / Subscription, then the Element confirms it.
 */

type Buyer = { name: string; firstName: string; lastName: string; email: string; phone: string };
type QuoteResponse = { totals: OrderTotals; coupon: { code: string; applied: boolean; message?: string } | null };

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
  const [bumpIds, setBumpIds] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [totals, setTotals] = useState<OrderTotals>(view.initialTotals);
  const [quoting, setQuoting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", firstName: "", lastName: "", email: "", phone: "" });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; text: string; href: string | null } | null>(null);
  const attribution = useRef<ReturnType<typeof readAttributionFromBrowser> | null>(null);

  useEffect(() => {
    attribution.current = readAttributionFromBrowser();
  }, []);
  useEffect(() => setTotals(view.initialTotals), [view.initialTotals]);

  const quote = useCallback(
    async (nextBumps: string[], code: string) => {
      setQuoting(true);
      try {
        const data: QuoteResponse = previewQuote
          ? await previewQuote(nextBumps, code)
          : await fetch(`/api/order-checkout/${view.configId}/quote`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bumpIds: nextBumps, couponCode: code }),
            }).then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error ?? "Couldn't update your total.");
              return d;
            });
        setTotals(data.totals);
        if (data.coupon) {
          setCouponMessage(data.coupon.applied ? { ok: true, text: `${data.coupon.code} applied` } : { ok: false, text: data.coupon.message ?? "That code isn't valid." });
          if (!data.coupon.applied) setCouponCode("");
        } else setCouponMessage(null);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Couldn't update your total.");
      } finally {
        setQuoting(false);
      }
    },
    [previewQuote, view.configId],
  );

  function toggleBump(id: string) {
    const next = bumpIds.includes(id) ? bumpIds.filter((b) => b !== id) : [...bumpIds, id];
    setBumpIds(next);
    void quote(next, couponCode);
  }
  function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponCode(code);
    void quote(bumpIds, code);
  }
  function removeCoupon() {
    setCouponCode("");
    setCouponInput("");
    setCouponMessage(null);
    void quote(bumpIds, "");
  }

  const buyerBody = () => ({
    name: buyer.name,
    firstName: buyer.firstName,
    lastName: buyer.lastName,
    email: buyer.email,
    phone: buyer.phone,
  });

  async function continueToPayment() {
    setErrors({});
    setFormError(null);
    if (preview) return setStep(2);
    const r = await fetch(`/api/order-checkout/${view.configId}/buyer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buyerBody()) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErrors(d.fields ?? {});
      setFormError(d.error ?? "Check your details.");
      return;
    }
    setStep(2);
  }

  const compact = device !== "desktop";
  // The admin preview sits inside a page that already has its own h1.
  const Heading = preview ? "h2" : "h1";
  const twoStep = view.format === "two_step";
  const showBuyer = !twoStep || step === 1;
  const showOrder = !twoStep || step === 2;
  const termsText = recurringTermsText(totals);
  const submitLabel =
    view.display.submitLabel ||
    (totals.recurring && totals.recurring.trialDays > 0 && totals.dueTodayCents === 0 ? `Start my ${totals.recurring.trialDays}-day free trial` : totals.dueTodayCents > 0 ? `Pay ${formatMoney(totals.dueTodayCents, totals.currency)}` : "Complete my order");

  if (done) {
    return (
      <div className="tenant-card mx-auto w-full max-w-lg rounded-2xl p-8 text-center">
        <div className="tenant-mark mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <Check className="size-6" aria-hidden />
        </div>
        <h2 className="tenant-display text-title-lg">{done.title}</h2>
        <p className="text-muted-foreground mt-2 text-body-sm">{done.text}</p>
        {done.href && (
          <a href={done.href} className="tenant-button mt-6 inline-flex h-11 items-center justify-center rounded-lg px-6 text-body-sm font-semibold">
            Continue
          </a>
        )}
      </div>
    );
  }

  const summary = (
    <OrderSummary
      view={view}
      totals={totals}
      bumpIds={bumpIds}
      onToggleBump={toggleBump}
      quoting={quoting}
      couponsEnabled={view.couponsEnabled}
      couponInput={couponInput}
      setCouponInput={setCouponInput}
      couponCode={couponCode}
      couponMessage={couponMessage}
      onApplyCoupon={applyCoupon}
      onRemoveCoupon={removeCoupon}
      termsText={view.display.showRecurringTerms ? termsText : null}
      showDueToday={view.display.showDueToday}
      showTrial={view.display.showTrialTiming}
    />
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 text-center">
        {view.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.brand.logoUrl} alt={view.brand.name} className="mx-auto mb-3 h-10 w-auto" />
        ) : view.brand.name ? (
          <p className="text-muted-foreground mb-2 text-overline">{view.brand.name}</p>
        ) : null}
        <Heading className="tenant-display text-display-md">{view.display.headline || "Complete your order"}</Heading>
        {view.display.subheadline && <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-body">{view.display.subheadline}</p>}
        {twoStep && (
          <ol className="mt-5 flex items-center justify-center gap-3 text-caption" aria-label="Checkout steps">
            {["Your details", "Order & payment"].map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded-full border font-semibold", step === i + 1 ? "tenant-button border-transparent" : "text-muted-foreground")}>{i + 1}</span>
                <span className={step === i + 1 ? "font-semibold" : "text-muted-foreground"}>{label}</span>
              </li>
            ))}
          </ol>
        )}
      </header>

      <div className={cn("grid gap-6", !compact && "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]")}>
        <div className="flex min-w-0 flex-col gap-5">
          {showBuyer && (
            <section className="tenant-card rounded-2xl p-5" aria-labelledby="co-details">
              <h2 id="co-details" className="text-body mb-4 font-semibold">Your details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {view.nameFormat === "first_last" ? (
                  <>
                    <Field id="co-first" label="First name" error={errors.firstName}>
                      <Input id="co-first" autoComplete="given-name" value={buyer.firstName} onChange={(e) => setBuyer({ ...buyer, firstName: e.target.value })} aria-invalid={!!errors.firstName} />
                    </Field>
                    <Field id="co-last" label="Last name" error={errors.lastName}>
                      <Input id="co-last" autoComplete="family-name" value={buyer.lastName} onChange={(e) => setBuyer({ ...buyer, lastName: e.target.value })} aria-invalid={!!errors.lastName} />
                    </Field>
                  </>
                ) : (
                  <Field id="co-name" label="Full name" error={errors.name} wide>
                    <Input id="co-name" autoComplete="name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} aria-invalid={!!errors.name} />
                  </Field>
                )}
                <Field id="co-email" label="Email" error={errors.email} wide={view.phone === "hidden"}>
                  <Input id="co-email" type="email" autoComplete="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} aria-invalid={!!errors.email} />
                </Field>
                {view.phone !== "hidden" && (
                  <Field id="co-phone" label={view.phone === "optional" ? "Phone (optional)" : "Phone"} error={errors.phone}>
                    <Input id="co-phone" type="tel" autoComplete="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} aria-invalid={!!errors.phone} />
                  </Field>
                )}
              </div>
              {twoStep && (
                <button type="button" onClick={continueToPayment} className="tenant-button mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg text-body-sm font-semibold">
                  Continue to payment
                </button>
              )}
            </section>
          )}

          {showOrder && twoStep && (
            <button type="button" className="text-muted-foreground self-start text-caption underline" onClick={() => setStep(1)}>
              ← Edit your details ({buyer.email || "not entered"})
            </button>
          )}

          {showOrder && compact && summary}

          {showOrder && (
            <section className="tenant-card rounded-2xl p-5" aria-labelledby="co-pay">
              <h2 id="co-pay" className="text-body mb-4 font-semibold">Payment</h2>
              {preview || !view.payment.ready || !view.payment.publishableKey ? (
                <div className="tenant-soft text-muted-foreground rounded-xl p-4 text-body-sm">
                  {preview
                    ? "The secure Stripe payment form appears here. Preview never takes payments."
                    : view.payment.message ?? "Card payments aren't available right now."}
                </div>
              ) : (
                <Elements stripe={stripeFor(view.payment.publishableKey, view.payment.stripeAccount)} options={{ ...elementsModeFor(view.initialTotals), appearance: { theme: "stripe", variables: { colorPrimary: view.brand.primary ?? undefined, borderRadius: "10px" } } } as StripeElementsOptions}>
                  <PayForm
                    view={view}
                    totals={totals}
                    agree={agree}
                    setAgree={setAgree}
                    buildBody={() => ({ ...buyerBody(), bumpIds, couponCode, agreementAccepted: agree, attribution: attribution.current })}
                    submitLabel={submitLabel}
                    onFieldErrors={(f, msg) => {
                      setErrors(f);
                      setFormError(msg);
                      if (twoStep && (f.name || f.email || f.phone || f.firstName || f.lastName)) setStep(1);
                    }}
                    onDone={setDone}
                  />
                </Elements>
              )}
              {preview && <AgreementAndButton view={view} agree={agree} setAgree={setAgree} label={submitLabel} disabled busy={false} />}
              {formError && <p className="text-destructive mt-3 text-body-sm" role="alert">{formError}</p>}
              {view.display.showSecureBadge && (
                <p className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-caption">
                  <Lock className="size-3.5" aria-hidden /> Secure checkout, processed by Stripe.
                </p>
              )}
            </section>
          )}

          {view.display.guaranteeEnabled && (view.display.guaranteeTitle || view.display.guaranteeText) && (
            <section className="tenant-soft flex gap-3 rounded-2xl p-5">
              <ShieldCheck className="tenant-text mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                {view.display.guaranteeTitle && <p className="font-semibold text-body-sm">{view.display.guaranteeTitle}</p>}
                {view.display.guaranteeText && <p className="text-muted-foreground text-body-sm">{view.display.guaranteeText}</p>}
              </div>
            </section>
          )}
        </div>

        {!compact && <aside className="min-w-0">{summary}</aside>}
      </div>
    </div>
  );
}

function Field({ id, label, error, wide, children }: { id: string; label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-destructive text-caption">{error}</p>}
    </div>
  );
}

function OrderSummary(props: {
  view: CheckoutView;
  totals: OrderTotals;
  bumpIds: string[];
  onToggleBump: (id: string) => void;
  quoting: boolean;
  couponsEnabled: boolean;
  couponInput: string;
  setCouponInput: (v: string) => void;
  couponCode: string;
  couponMessage: { ok: boolean; text: string } | null;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  termsText: string | null;
  showDueToday: boolean;
  showTrial: boolean;
}) {
  const { view, totals } = props;
  const primaryLine = totals.lines[0];
  return (
    <section className="tenant-card flex flex-col gap-4 rounded-2xl p-5" aria-label="Order summary">
      <div className="flex gap-3">
        {view.primary.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.primary.thumbnailUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-body">{view.primary.title}</p>
            <p className="shrink-0 font-semibold text-body tabular-nums">{view.primary.priceLabel}</p>
          </div>
          {view.primary.billingNote && props.showTrial && <p className="text-muted-foreground text-caption">{view.primary.billingNote}</p>}
          {view.display.showEntitlements && view.primary.entitlements.length > 0 && (
            <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-caption">
              {view.primary.entitlements.map((e) => (
                <li key={e} className="flex gap-1.5"><Check className="tenant-text mt-0.5 size-3.5 shrink-0" aria-hidden />{e}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {view.bumps.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-overline text-muted-foreground">Add to your order (optional)</p>
          {view.bumps.map((b) => {
            const on = props.bumpIds.includes(b.bumpId);
            return (
              <label key={b.bumpId} className={cn("tenant-choice flex cursor-pointer gap-3 rounded-xl border-2 border-dashed p-3", on && "tenant-choice-picked")} aria-pressed={on}>
                <Checkbox checked={on} onCheckedChange={() => props.onToggleBump(b.bumpId)} aria-label={`${b.checkboxLabel}: ${b.headline}`} className="mt-1" />
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {b.badge && <span className="tenant-mark rounded-full px-2 py-0.5 text-caption font-semibold">{b.badge}</span>}
                    <span className="font-semibold text-body-sm">{b.checkboxLabel}</span>
                  </span>
                  <span className="mt-0.5 flex items-start justify-between gap-2">
                    <span className="text-body-sm">{b.headline}</span>
                    <span className="shrink-0 font-semibold text-body-sm tabular-nums">{b.priceLabel}</span>
                  </span>
                  {b.description && <span className="mt-1 block text-caption opacity-80">{b.description}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {props.couponsEnabled && (
        <div className="flex flex-col gap-1.5">
          {props.couponCode && props.couponMessage?.ok ? (
            <div className="tenant-soft flex items-center justify-between rounded-lg px-3 py-2 text-body-sm">
              <span className="flex items-center gap-2"><TagIcon className="size-4" aria-hidden />{props.couponMessage.text}</span>
              <button type="button" className="text-caption underline" onClick={props.onRemoveCoupon}>Remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="co-coupon"
                placeholder="Discount code"
                aria-label="Discount code"
                value={props.couponInput}
                onChange={(e) => props.setCouponInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    props.onApplyCoupon();
                  }
                }}
              />
              <button type="button" onClick={props.onApplyCoupon} className="tenant-choice shrink-0 rounded-lg border px-4 text-body-sm font-semibold">Apply</button>
            </div>
          )}
          {props.couponMessage && !props.couponMessage.ok && <p className="text-destructive text-caption" role="alert">{props.couponMessage.text}</p>}
        </div>
      )}

      <dl className={cn("flex flex-col gap-1.5 border-t pt-4 text-body-sm tabular-nums", props.quoting && "opacity-60")}>
        {totals.lines.map((l) => (
          <div key={`${l.offerId}-${l.bumpId ?? "p"}`} className="flex justify-between gap-3">
            <dt className="text-muted-foreground min-w-0 truncate">{l.title}{l.billing === "recurring" && l.trialDays > 0 ? ` (after ${l.trialDays}-day trial)` : ""}</dt>
            <dd>{formatMoney(l.unitAmountCents, totals.currency)}</dd>
          </div>
        ))}
        {totals.discountCents > 0 && (
          <div className="tenant-text flex justify-between gap-3">
            <dt>Discount</dt>
            <dd>−{formatMoney(totals.discountCents, totals.currency)}</dd>
          </div>
        )}
        {props.showDueToday && (
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <dt className="font-semibold text-body">Due today</dt>
            <dd className="font-semibold text-title-md">
              {props.quoting ? <Loader2 className="inline size-4 animate-spin" aria-label="Updating" /> : formatMoney(totals.dueTodayCents, totals.currency)}
            </dd>
          </div>
        )}
        {props.termsText && primaryLine?.billing === "recurring" && <p className="text-muted-foreground text-caption">{capitalize(props.termsText)}.</p>}
      </dl>
    </section>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function AgreementAndButton({ view, agree, setAgree, label, disabled, busy }: { view: CheckoutView; agree: boolean; setAgree: (v: boolean) => void; label: string; disabled: boolean; busy: boolean }) {
  const text = view.agreement.mode === "custom" ? view.agreement.customText : "I have read and agree to the terms and conditions of this page.";
  return (
    <div className="mt-4 flex flex-col gap-4">
      {view.agreement.mode !== "notRequired" && (
        <label className="flex items-start gap-2 text-body-sm">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" aria-label="Agree to the terms" />
          <span>
            {text}{" "}
            {view.agreement.linkUrl && (
              <a href={view.agreement.linkUrl} target="_blank" rel="noopener noreferrer" className="underline">View terms</a>
            )}
          </span>
        </label>
      )}
      <button type="submit" disabled={disabled || busy} className="tenant-button inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-body font-semibold disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        <Lock className="size-4" aria-hidden />
        {label}
      </button>
    </div>
  );
}

function PayForm({
  view,
  totals,
  agree,
  setAgree,
  buildBody,
  submitLabel,
  onFieldErrors,
  onDone,
}: {
  view: CheckoutView;
  totals: OrderTotals;
  agree: boolean;
  setAgree: (v: boolean) => void;
  buildBody: () => Record<string, unknown>;
  submitLabel: string;
  onFieldErrors: (fields: Record<string, string>, message: string | null) => void;
  onDone: (d: { title: string; text: string; href: string | null }) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const modeOptions = useMemo(() => elementsModeFor(totals), [totals]);

  useEffect(() => {
    elements?.update(modeOptions as never);
  }, [elements, modeOptions]);

  const finish = useCallback(
    async (orderId: string) => {
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`/api/order-checkout/${view.configId}/orders/${orderId}`);
        const d = await r.json().catch(() => ({}));
        if (d.status === "paid") {
          const needsSignIn = typeof d.redirectTo === "string" && d.redirectTo.startsWith("/my/login");
          if (d.redirectTo && !needsSignIn) {
            window.location.href = d.redirectTo;
            return;
          }
          onDone({
            title: "You're all set",
            text: needsSignIn
              ? `Your purchase is complete and saved to ${d.maskedEmail}. Sign in with that email to open it.`
              : "Your purchase is complete.",
            href: d.redirectTo || null,
          });
          return;
        }
        if (d.status === "failed") {
          onFieldErrors({}, "Your payment didn't go through. Try again or use another card.");
          return;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      onDone({ title: "Payment received", text: "We're finishing your order. You'll get access in a moment.", href: null });
    },
    [view.configId, onDone, onFieldErrors],
  );

  // Return from a redirect-based payment method (?order=…).
  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (orderId) void finish(orderId);
  }, [finish]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    onFieldErrors({}, null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onFieldErrors({}, submitError.message ?? "Check your payment details.");
        return;
      }
      const r = await fetch(`/api/order-checkout/${view.configId}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody()) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        onFieldErrors(d.fields ?? {}, d.error ?? "We couldn't start checkout.");
        return;
      }
      if (d.next === "redirect") {
        window.location.href = d.redirectTo;
        return;
      }
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set("order", d.orderId);
      const result =
        d.intentType === "setup"
          ? await stripe.confirmSetup({ elements, clientSecret: d.clientSecret, confirmParams: { return_url: returnUrl.toString() }, redirect: "if_required" })
          : await stripe.confirmPayment({ elements, clientSecret: d.clientSecret, confirmParams: { return_url: returnUrl.toString() }, redirect: "if_required" });
      if (result.error) {
        onFieldErrors({}, result.error.message ?? "Your payment didn't go through.");
        return;
      }
      await finish(d.orderId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <PaymentElement options={{ layout: "tabs" }} />
      {view.billingAddress === "full" && (
        <div className="mt-4">
          <AddressElement options={{ mode: "billing" }} />
        </div>
      )}
      <AgreementAndButton view={view} agree={agree} setAgree={setAgree} label={submitLabel} disabled={!stripe || (view.agreement.mode !== "notRequired" && !agree)} busy={busy} />
    </form>
  );
}
