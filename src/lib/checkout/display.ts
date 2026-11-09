/**
 * Buyer-facing checkout wording — PURE. Everything here is derived from the
 * server's priced totals, so the page can only say what Stripe will charge.
 * Shared by the public checkout and (later) the Page Builder Checkout block.
 */
import type { OrderTotals, PricedLine } from "@/types/checkout";
import { formatMoney, recurringTermsText } from "./pricing";

const INTERVAL: Record<string, string> = { day: "day", week: "week", month: "month", year: "year" };

/** Does this order need the payment form? (Card is needed for any charge today OR a subscription.) */
export function needsPayment(totals: OrderTotals): boolean {
  return totals.dueTodayCents > 0 || totals.recurring !== null;
}

/** The pay button. A configured label always wins. */
export function ctaLabel(configured: string, totals: OrderTotals): string {
  if (configured.trim()) return configured.trim();
  const r = totals.recurring;
  if (r && r.trialDays > 0) return `Start my ${r.trialDays}-day free trial`;
  if (r) return `Subscribe — ${formatMoney(totals.dueTodayCents, totals.currency)}`;
  if (totals.dueTodayCents > 0) return `Pay ${formatMoney(totals.dueTodayCents, totals.currency)}`;
  return "Get access";
}

/** Short billing description for one summary line. */
export function lineBillingLabel(line: PricedLine, currency: string): string {
  if (line.billing === "free") return "Free";
  if (line.billing === "one_time") return "One-time";
  const every = `${formatMoney(line.unitAmountCents, currency)}/${INTERVAL[line.interval ?? "month"] ?? line.interval}`;
  return line.trialDays > 0 ? `${line.trialDays}-day free trial, then ${every}` : `Billed ${every}`;
}

/** Price shown on the right of a summary line (recurring lines show their per-interval price). */
export function linePriceLabel(line: PricedLine, currency: string): string {
  if (line.billing === "free") return "Free";
  const amount = formatMoney(line.unitAmountCents, currency);
  return line.billing === "recurring" ? `${amount}/${INTERVAL[line.interval ?? "month"] ?? line.interval}` : amount;
}

/** The date a trial subscription's first charge happens, e.g. "Feb 3, 2027". */
export function subscriptionStartDate(trialDays: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + trialDays * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "What you pay and when" — one row per obligation, so today's charge is
 * never mixed up with a future subscription price.
 */
/**
 * The summary's money rows. When something isn't charged today (a trial), the
 * subtotal and discount cover ONLY today's lines so they add up to "Due today";
 * the later (discounted) plan payment is stated in the charge schedule instead.
 */
export function summaryRows(totals: OrderTotals): { subtotalCents: number; discountCents: number; todayOnly: boolean } {
  const deferred = totals.lines.some((l) => l.trialDays > 0 && l.unitAmountCents > 0);
  if (!deferred) return { subtotalCents: totals.subtotalCents, discountCents: totals.discountCents, todayOnly: false };
  const today = totals.lines.filter((l) => !(l.trialDays > 0));
  return {
    subtotalCents: today.reduce((n, l) => n + l.unitAmountCents, 0),
    discountCents: today.reduce((n, l) => n + l.discountCents, 0),
    todayOnly: true,
  };
}

export function chargeSchedule(totals: OrderTotals, now: Date = new Date()): string[] {
  const rows: string[] = [];
  const cur = totals.currency;
  for (const l of totals.lines) {
    if (l.billing === "free") continue;
    if (l.billing === "recurring") {
      if (l.trialDays > 0) rows.push(`${formatMoney(0, cur)} today for ${l.title} (free trial)`);
      else rows.push(`${formatMoney(l.dueTodayCents, cur)} today for ${l.title}`);
    } else {
      rows.push(`${formatMoney(l.dueTodayCents, cur)} today for ${l.title}`);
    }
  }
  const r = totals.recurring;
  if (r) {
    const terms = recurringTermsText(totals);
    if (r.trialDays > 0) rows.push(`From ${subscriptionStartDate(r.trialDays, now)}: ${terms?.replace(/^\d+-day free trial, then /, "")}`);
    else if (terms && r.discountedPayments !== 0) rows.push(`Subscription: ${terms}`);
    else rows.push(`Then ${formatMoney(r.amountCents, cur)}/${INTERVAL[r.interval] ?? r.interval} until you cancel`);
  }
  return rows;
}

/** "What happens next" — only facts the order actually implies. */
export function whatHappensNext(totals: OrderTotals, now: Date = new Date()): string[] {
  const out: string[] = [];
  const r = totals.recurring;
  const primary = totals.lines[0];
  if (r && r.trialDays > 0) out.push(`Your ${r.trialDays}-day free trial starts today`);
  out.push(`You get access to ${primary.title} right away`);
  for (const l of totals.lines.slice(1)) out.push(`${l.title} is added to your purchase`);
  if (r) {
    const amount = `${formatMoney(r.discountedPayments !== 0 ? r.discountedAmountCents : r.amountCents, totals.currency)}/${INTERVAL[r.interval] ?? r.interval}`;
    out.push(r.trialDays > 0 ? `Your subscription begins on ${subscriptionStartDate(r.trialDays, now)} (${amount})` : `Your subscription renews every ${INTERVAL[r.interval] ?? r.interval} (${amount})`);
  }
  return out;
}

/** Turn a Stripe.js error into words a buyer can act on. Never raw provider text for non-card errors. */
export function friendlyPaymentError(err: { type?: string; code?: string; decline_code?: string; message?: string } | null | undefined): string {
  if (!err) return "Something went wrong with your payment. You haven't been charged — please try again.";
  if (err.type === "card_error") {
    if (err.code === "card_declined" || err.decline_code) return err.message || "Your card was declined. Try another card.";
    return err.message || "There's a problem with this card. Check the details or try another card.";
  }
  if (err.type === "validation_error") return err.message || "Check your payment details.";
  if (err.code === "payment_intent_authentication_failure" || err.code === "setup_intent_authentication_failure")
    return "Your bank couldn't confirm the payment. Try again, or use another card.";
  return "We couldn't complete the payment. You haven't been charged — please try again.";
}
