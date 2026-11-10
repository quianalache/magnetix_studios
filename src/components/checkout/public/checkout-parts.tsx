"use client";

import { Check, CheckCircle2, Info, Loader2, Lock, ShieldCheck, Tag as TagIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/checkout/pricing";
import { chargeSchedule, lineBillingLabel, linePriceLabel, summaryRows, whatHappensNext } from "@/lib/checkout/display";
import type { CheckoutView, CheckoutViewBump } from "@/lib/checkout/view-types";
import type { OrderTotals } from "@/types/checkout";

/**
 * Presentational pieces of the public checkout (Checkout Foundation Phase 2).
 * Each takes plain props and owns no data fetching, so the future Page
 * Builder Checkout block can compose the same parts in its own layout.
 */

export type CouponState =
  | { status: "empty" }
  | { status: "applying"; code: string }
  | { status: "applied"; code: string; label: string; scope: string; recurringNote: string | null }
  | { status: "error"; code: string; message: string };

export type Buyer = { name: string; firstName: string; lastName: string; email: string; phone: string };

/* --------------------------------- Header --------------------------------- */

export function CheckoutHeader({ brand }: { brand: CheckoutView["brand"] }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b py-4">
      <div className="flex min-w-0 items-center gap-2">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.name || "Seller"} className="h-8 w-auto max-w-40 object-contain" />
        ) : (
          <span className="truncate font-semibold text-body">{brand.name}</span>
        )}
      </div>
      <p className="flex shrink-0 items-center gap-1.5 font-medium text-body-sm">
        <Lock className="size-4" aria-hidden /> Secure checkout
      </p>
    </header>
  );
}

/* ------------------------------ Progress steps ---------------------------- */

export function ProgressSteps({ step, labels }: { step: 1 | 2; labels?: [string, string] }) {
  const steps = labels ?? ["Your information", "Payment & review"];
  return (
    <ol className="flex items-center gap-3" aria-label="Checkout progress">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={current ? "step" : undefined}>
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-caption", current || done ? "tenant-button border-transparent" : "text-muted-foreground")}>
              {done ? <Check className="size-4" aria-hidden /> : n}
            </span>
            <span className={cn("truncate text-body-sm", current ? "font-semibold" : "text-muted-foreground")}>
              <span className="sr-only">Step {n} of 2{done ? ", completed" : current ? ", current" : ""}: </span>
              {label}
            </span>
            {i === 0 && <span aria-hidden className={cn("hidden h-0.5 flex-1 rounded sm:block", step > 1 ? "tenant-button" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Offer intro ------------------------------- */

/**
 * The Offer being bought. Title and price/trial line always show (they're
 * the buyer's disclosure); image, description and benefits are optional.
 */
export function OfferIntro({
  view,
  totals,
  compact,
  showImage = true,
  showDescription = true,
  showBenefits = true,
}: {
  view: CheckoutView;
  totals: OrderTotals;
  compact?: boolean;
  showImage?: boolean;
  showDescription?: boolean;
  showBenefits?: boolean;
}) {
  const p = view.primary;
  return (
    <section className="tenant-card flex flex-col gap-4 rounded-2xl p-5 sm:flex-row" aria-label="What you're getting">
      {showImage && p.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumbnailUrl} alt="" className={cn("shrink-0 rounded-xl object-cover", compact ? "size-20" : "h-32 w-full sm:h-28 sm:w-40")} />
      )}
      <div className="min-w-0 flex-1">
        <h2 className={cn("tenant-display", compact ? "text-title-md" : "text-title-lg")}>{p.title}</h2>
        {showDescription && p.description && <p className="text-muted-foreground mt-1 text-body-sm">{p.description}</p>}
        <p className="mt-2 font-semibold text-body-sm">
          {p.priceLabel}
          {totals.recurring && totals.recurring.trialDays > 0 && view.display.showTrialTiming ? (
            <span className="tenant-text ms-2 font-medium">· {totals.recurring.trialDays}-day free trial</span>
          ) : null}
        </p>
        {showBenefits && view.display.showEntitlements && p.entitlements.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-body-sm">
            {p.entitlements.map((e) => (
              <li key={e} className="flex items-center gap-1.5">
                <CheckCircle2 className="tenant-text size-4 shrink-0" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ Buyer fields ------------------------------ */

function Field({ id, label, required, error, wide, children }: { id: string; label: string; required?: boolean; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden> *</span> : <span className="text-muted-foreground font-normal"> (optional)</span>}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function BuyerFields({
  view,
  buyer,
  setBuyer,
  errors,
  onEmailBlur,
}: {
  view: CheckoutView;
  buyer: Buyer;
  setBuyer: (b: Buyer) => void;
  errors: Record<string, string>;
  /** One-step checkout start: fired when the buyer leaves the email field. */
  onEmailBlur?: () => void;
}) {
  const input = (id: string, key: keyof Buyer, auto: string, type = "text") => (
    <Input
      id={id}
      type={type}
      autoComplete={auto}
      value={buyer[key]}
      onBlur={key === "email" ? onEmailBlur : undefined}
      onChange={(e) => setBuyer({ ...buyer, [key]: e.target.value })}
      aria-invalid={!!errors[key]}
      aria-describedby={errors[key] ? `${id}-error` : undefined}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {view.nameFormat === "first_last" ? (
        <>
          <Field id="co-first" label="First name" required error={errors.firstName}>{input("co-first", "firstName", "given-name")}</Field>
          <Field id="co-last" label="Last name" required error={errors.lastName}>{input("co-last", "lastName", "family-name")}</Field>
        </>
      ) : (
        <Field id="co-name" label="Full name" required error={errors.name} wide>{input("co-name", "name", "name")}</Field>
      )}
      <Field id="co-email" label="Email" required error={errors.email} wide={view.phone === "hidden"}>{input("co-email", "email", "email", "email")}</Field>
      {view.phone !== "hidden" && (
        <Field id="co-phone" label="Phone" required={view.phone === "required"} error={errors.phone}>{input("co-phone", "phone", "tel", "tel")}</Field>
      )}
    </div>
  );
}

/* ------------------------------- Order Bumps ------------------------------ */

/**
 * One Order Bump. States: available (not selected), selected, discounted by a
 * coupon, or full price because the coupon doesn't cover add-ons. Selection
 * is conveyed by the checkbox, a text label and the border — never colour alone.
 */
export function OrderBumpCard({
  bump,
  selected,
  onToggle,
  line,
  couponExcludesBumps,
  currency,
  disabled,
  variant = "card",
  showImage = true,
  showDescription = true,
}: {
  bump: CheckoutViewBump;
  selected: boolean;
  onToggle: () => void;
  /** The server-priced line for this bump when it's in the order. */
  line: { unitAmountCents: number; discountCents: number } | null;
  couponExcludesBumps: boolean;
  currency: string;
  disabled?: boolean;
  /** Page Builder appearance: dashed card (default), solid outline, or highlighted. */
  variant?: "card" | "outlined" | "highlight";
  showImage?: boolean;
  showDescription?: boolean;
}) {
  const id = `bump-${bump.bumpId}`;
  return (
    <div
      className={cn(
        "tenant-choice flex gap-3 rounded-2xl border-2 p-4 transition-colors",
        selected ? "tenant-choice-picked" : variant === "card" ? "border-dashed" : variant === "highlight" ? "tenant-soft" : "",
        disabled && "opacity-60",
      )}
      data-bump-state={selected ? "selected" : "available"}
      data-bump-style={variant}
    >
      <Checkbox id={id} checked={selected} onCheckedChange={onToggle} disabled={disabled} className="mt-1 size-5" aria-describedby={`${id}-desc`} />
      {showImage && bump.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bump.imageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {bump.badge && <span className="tenant-mark rounded-full px-2 py-0.5 text-caption font-semibold">{bump.badge}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-caption font-medium", selected ? "tenant-soft" : "text-muted-foreground")}>
            {selected ? "Added to your order" : "Optional add-on"}
          </span>
        </div>
        <label htmlFor={id} className="mt-1 block cursor-pointer font-semibold text-body">
          {bump.checkboxLabel}: {bump.headline}
        </label>
        {showDescription && bump.description && (
          <p id={`${id}-desc`} className="mt-0.5 text-body-sm opacity-80">
            {bump.description}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {selected && line && line.discountCents > 0 ? (
          <>
            <p className="text-muted-foreground text-caption line-through">{formatMoney(line.unitAmountCents, currency)}</p>
            <p className="font-semibold text-body tabular-nums">{formatMoney(line.unitAmountCents - line.discountCents, currency)}</p>
          </>
        ) : (
          <p className="font-semibold text-body tabular-nums">{bump.priceLabel}</p>
        )}
        <p className="text-muted-foreground text-caption">One-time</p>
        {selected && couponExcludesBumps && <p className="text-muted-foreground mt-1 max-w-28 text-caption">Code doesn&apos;t apply to add-ons</p>}
      </div>
    </div>
  );
}

/* --------------------------------- Coupon --------------------------------- */

export function CouponField({ state, input, setInput, onApply, onRemove }: { state: CouponState; input: string; setInput: (v: string) => void; onApply: () => void; onRemove: () => void }) {
  if (state.status === "applied") {
    return (
      <div className="tenant-soft flex items-start justify-between gap-3 rounded-xl px-3 py-2.5" role="status">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-body-sm">
            <TagIcon className="size-4" aria-hidden /> {state.code} applied — {state.label}
          </p>
          {state.scope && <p className="text-caption opacity-80">Discounts {state.scope}.</p>}
          {state.recurringNote && <p className="text-caption opacity-80">{state.recurringNote}</p>}
        </div>
        <button type="button" onClick={onRemove} className="shrink-0 rounded p-1" aria-label={`Remove code ${state.code}`}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  const applying = state.status === "applying";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <TagIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            id="co-coupon"
            className="ps-9"
            placeholder="Discount code"
            aria-label="Discount code"
            value={input}
            disabled={applying}
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? "co-coupon-error" : undefined}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApply();
              }
            }}
          />
        </div>
        <button type="button" onClick={onApply} disabled={applying || !input.trim()} className="tenant-choice inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-4 font-semibold text-body-sm disabled:opacity-60">
          {applying && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {applying ? "Applying" : "Apply"}
        </button>
      </div>
      {state.status === "error" && (
        <p id="co-coupon-error" className="text-destructive text-caption" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ Order summary ----------------------------- */

export function OrderSummary({
  view,
  totals,
  quoting,
  coupon,
  children,
  showSchedule = true,
  title = "Order summary",
  concise = false,
  showSecure = true,
  thumbnails = { primary: true, bumps: true },
}: {
  view: CheckoutView;
  totals: OrderTotals;
  quoting: boolean;
  coupon: CouponState;
  children?: React.ReactNode;
  showSchedule?: boolean;
  title?: string;
  /**
   * Minimal presentation: no thumbnails, tighter spacing — but EVERY line
   * with its price, any discount, the amount due today and the recurring /
   * trial schedule stay. Those are required disclosures.
   */
  concise?: boolean;
  showSecure?: boolean;
  /** Follows the block's Offer-image / bump-image settings. */
  thumbnails?: { primary: boolean; bumps: boolean };
}) {
  const cur = totals.currency;
  const schedule = chargeSchedule(totals);
  const rows = summaryRows(totals);
  return (
    <section className={cn("tenant-card flex flex-col rounded-2xl", concise ? "gap-3 p-4" : "gap-4 p-5")} aria-labelledby="co-summary-title" data-summary-style={concise ? "concise" : "full"}>
      <h2 id="co-summary-title" className={cn("font-semibold", concise ? "text-body" : "text-title-md")}>{concise && title === "Order summary" ? "Your order" : title}</h2>
      <ul className="flex flex-col divide-y">
        {totals.lines.map((l) => {
          const thumb = concise
            ? null
            : l.role === "primary"
              ? thumbnails.primary
                ? view.primary.thumbnailUrl
                : null
              : thumbnails.bumps
                ? (view.bumps.find((b) => b.bumpId === l.bumpId)?.imageUrl ?? null)
                : null;
          return (
            <li key={`${l.offerId}-${l.bumpId ?? "p"}`} className={cn("flex gap-3 first:pt-0", concise ? "py-2" : "py-3")}>
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-body-sm">{l.title}</p>
                <p className="text-muted-foreground text-caption">{lineBillingLabel(l, cur)}</p>
              </div>
              <p className="shrink-0 font-semibold text-body-sm tabular-nums">{linePriceLabel(l, cur)}</p>
            </li>
          );
        })}
      </ul>
      {children}
      <dl className={cn("flex flex-col gap-1.5 border-t pt-4 text-body-sm tabular-nums", quoting && "opacity-60")} aria-live="polite" aria-busy={quoting}>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{rows.todayOnly ? "Subtotal today" : "Subtotal"}</dt>
          <dd>{formatMoney(rows.subtotalCents, cur)}</dd>
        </div>
        {rows.discountCents > 0 && (
          <div className="tenant-text flex justify-between gap-3">
            <dt>
              {rows.todayOnly ? "Discount today" : "Discount"}
              {coupon.status === "applied" ? ` (${coupon.code})` : ""}
            </dt>
            <dd>−{formatMoney(rows.discountCents, cur)}</dd>
          </div>
        )}
        {view.display.showDueToday && (
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <dt className="font-semibold text-body">Due today</dt>
            <dd className="font-semibold text-title-lg">
              {quoting ? <Loader2 className="inline size-5 animate-spin" aria-label="Updating total" /> : formatMoney(totals.dueTodayCents, cur)}
            </dd>
          </div>
        )}
      </dl>
      {showSchedule && totals.recurring && view.display.showRecurringTerms && (
        <div className="tenant-soft rounded-xl p-3">
          <p className="flex items-center gap-2 font-semibold text-body-sm">
            <Info className="size-4" aria-hidden />
            {totals.recurring.trialDays > 0 ? `Includes a ${totals.recurring.trialDays}-day free trial` : "This is a subscription"}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {schedule.map((row) => (
              <li key={row} className="flex gap-2">
                <Check className="tenant-text mt-0.5 size-4 shrink-0" aria-hidden />
                {row}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showSecure && view.display.showSecureBadge && (
        <p className="text-muted-foreground flex items-center gap-2 border-t pt-3 text-caption">
          <Lock className="size-4 shrink-0" aria-hidden /> Secure, encrypted payment processed by Stripe.
        </p>
      )}
    </section>
  );
}

export function WhatHappensNext({ totals }: { totals: OrderTotals }) {
  return (
    <section className="tenant-card rounded-2xl p-5" aria-labelledby="co-next-title">
      <h2 id="co-next-title" className="font-semibold text-body">What happens next</h2>
      <ul className="mt-3 flex flex-col gap-2 text-body-sm">
        {whatHappensNext(totals).map((row) => (
          <li key={row} className="flex gap-2">
            <CheckCircle2 className="tenant-text mt-0.5 size-4 shrink-0" aria-hidden />
            {row}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------- Trust row -------------------------------- */

/** Only reassurance the seller configured — nothing invented. */
export function TrustRow({ view }: { view: CheckoutView }) {
  const d = view.display;
  if (!d.guaranteeEnabled || !(d.guaranteeTitle || d.guaranteeText)) return null;
  return (
    <section className="tenant-soft flex gap-3 rounded-2xl p-4">
      <ShieldCheck className="tenant-text mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        {d.guaranteeTitle && <p className="font-semibold text-body-sm">{d.guaranteeTitle}</p>}
        {d.guaranteeText && <p className="text-body-sm opacity-80">{d.guaranteeText}</p>}
      </div>
    </section>
  );
}

/* ------------------------------- Agreement -------------------------------- */

export function AgreementCheckbox({ view, checked, onChange, error }: { view: CheckoutView; checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  if (view.agreement.mode === "notRequired") return null;
  const text = view.agreement.mode === "custom" ? view.agreement.customText : "I have read and agree to the terms and conditions of this page.";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2 text-body-sm">
        <Checkbox id="co-agree" checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-invalid={!!error} aria-describedby={error ? "co-agree-error" : undefined} />
        <label htmlFor="co-agree">
          {text}{" "}
          {view.agreement.linkUrl && (
            <a href={view.agreement.linkUrl} target="_blank" rel="noopener noreferrer" className="tenant-text underline">
              Read the terms
            </a>
          )}
        </label>
      </div>
      {error && (
        <p id="co-agree-error" className="text-destructive text-caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Marketing opt-in ---------------------------- */

/**
 * Optional marketing consent (Phase 3). Always starts UNCHECKED, sits apart
 * from the purchase agreement, and only a tick is recorded as consent —
 * buying alone never is. The label is the seller's exact disclosure text.
 */
export function MarketingOptIn({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2 text-body-sm" data-checkout-optin="">
      <Checkbox id="co-marketing" checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <label htmlFor="co-marketing" className="text-muted-foreground">
        {label}
      </label>
    </div>
  );
}
