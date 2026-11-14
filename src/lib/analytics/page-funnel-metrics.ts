/**
 * Page & Funnel analytics — the ONE set of metric definitions shared by the
 * light analytics in Pages & Funnels and the detailed report in
 * Reports → Page & Funnel Analytics. Pure (no Firebase, no React): the
 * server builds every number with these functions and both screens render
 * the same API response, so the two views always reconcile.
 *
 * Definitions (owner-approved direction, 2026-11):
 *  - Days are UTC calendar days (`YYYY-MM-DD`), the same boundary the daily
 *    rollups are written with.
 *  - Traffic (views, entries, visitors) is real visitor activity and is
 *    recorded without a payment mode ("unknown"); anything recorded as TEST
 *    is excluded.
 *  - Money and transactions (checkout starts, purchases, trials, accepted /
 *    declined offers, revenue) count LIVE only — sandbox (TEST) activity is
 *    never part of business results.
 *  - Purchases = verified paid checkout completions (> $0 collected). Free
 *    trials ($0 today) and free orders are counted separately, never as
 *    purchases or revenue. Subscription renewals are never funnel events.
 *  - Revenue = verified LIVE amounts collected at checkout + accepted
 *    post-purchase offers (initial collection only; no renewals).
 *  - Funnel conversion rate = purchases ÷ entries, and only for funnels that
 *    contain a Checkout step (a funnel that sells nothing has no purchase
 *    conversion — shown as "Not applicable", never 0%).
 *  - Page conversion rate = goal completions ÷ visitors, only when the page
 *    has a measurable goal (see PageGoalInfo).
 */

export type AnalyticsRangeKey = "7d" | "30d" | "90d";

export const ANALYTICS_RANGES: { id: AnalyticsRangeKey; label: string; days: number }[] = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

export function isAnalyticsRangeKey(value: unknown): value is AnalyticsRangeKey {
  return value === "7d" || value === "30d" || value === "90d";
}

export interface AnalyticsRange {
  from: string;
  to: string;
  /** The equally long period immediately before `from` (for comparisons). */
  prevFrom: string;
  prevTo: string;
  days: number;
}

const DAY_MS = 86_400_000;
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string): number => Date.parse(`${day}T00:00:00.000Z`);

export function rangeFor(key: AnalyticsRangeKey, now = Date.now()): AnalyticsRange {
  const days = ANALYTICS_RANGES.find((r) => r.id === key)?.days ?? 30;
  const to = utcDay(now);
  const fromMs = dayMs(to) - (days - 1) * DAY_MS;
  return { from: utcDay(fromMs), to, prevFrom: utcDay(fromMs - days * DAY_MS), prevTo: utcDay(fromMs - DAY_MS), days };
}

/** Every UTC day from `from` to `to`, inclusive. */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayMs(from), end = dayMs(to); t <= end && out.length < 400; t += DAY_MS) out.push(utcDay(t));
  return out;
}

/** "Oct 1 – Oct 30, 2026" for a range (UTC dates). */
export function formatRangeLabel(from: string, to: string): string {
  const f = new Date(dayMs(from));
  const t = new Date(dayMs(to));
  const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${md(f)} – ${md(t)}, ${t.getUTCFullYear()}`;
}

/* --------------------------------- Funnels -------------------------------- */

/** Raw daily rollup shape written by funnel-analytics-service (read-only here). */
export interface RawFunnelDaily {
  day: string;
  modes?: Record<string, RawFunnelModeBucket | undefined>;
}
interface RawCounts { events?: Record<string, number>; uniqueVisitors?: number; revenue?: { initialPurchaseCents?: number; offerPurchaseCents?: number }; revenueByCurrency?: Record<string, number>; outcomes?: Record<string, Record<string, number>> }
interface RawFunnelModeBucket extends RawCounts {
  uniqueSessions?: number;
  byStep?: Record<string, RawCounts | undefined>;
}

export interface FunnelMetrics {
  /** Every funnel page view (a refresh is a new view). */
  views: number;
  /** Visitor sessions that reached the funnel's first step (one per session). */
  entries: number;
  checkoutStarts: number;
  /** Verified terminal checkout declines (LIVE). */
  checkoutFailures: number;
  purchases: number;
  trials: number;
  freeOrders: number;
  offersAccepted: number;
  offersDeclined: number;
  /** Verified LIVE cents collected (initial checkout + accepted offers). */
  revenueCents: number;
  initialRevenueCents: number;
  offerRevenueCents: number;
  /** Revenue split by ISO currency ("" = recorded before currencies were kept). */
  revenueByCurrency: Record<string, number>;
}

export const EMPTY_FUNNEL_METRICS: FunnelMetrics = {
  views: 0, entries: 0, checkoutStarts: 0, checkoutFailures: 0, purchases: 0, trials: 0, freeOrders: 0,
  offersAccepted: 0, offersDeclined: 0, revenueCents: 0, initialRevenueCents: 0, offerRevenueCents: 0,
  revenueByCurrency: {},
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** Traffic is recorded without a payment mode; LIVE is included, TEST never is. */
const TRAFFIC_MODES = ["unknown", "live"] as const;

function countsMetrics(buckets: { traffic: RawCounts[]; live: RawCounts | undefined }): FunnelMetrics {
  const ev = (c: RawCounts | undefined, key: string) => n(c?.events?.[key]);
  const live = buckets.live;
  const completed = ev(live, "checkout_completed");
  const outcomes = live?.outcomes?.checkout_completed;
  // Rollups written before outcome counters existed (Phase 9, 2026-11-13)
  // only know "completed"; there was no LIVE funnel checkout before then.
  const purchases = outcomes ? n(outcomes.payment) : completed;
  const initial = n(live?.revenue?.initialPurchaseCents);
  const offer = n(live?.revenue?.offerPurchaseCents);
  return {
    views: buckets.traffic.reduce((s, c) => s + ev(c, "step_viewed"), 0),
    entries: buckets.traffic.reduce((s, c) => s + ev(c, "funnel_entry"), 0),
    checkoutStarts: ev(live, "checkout_started"),
    checkoutFailures: ev(live, "checkout_failed"),
    purchases,
    trials: outcomes ? n(outcomes.trial_activation) : 0,
    freeOrders: outcomes ? n(outcomes.free) : 0,
    offersAccepted: ev(live, "offer_accepted"),
    offersDeclined: ev(live, "offer_declined"),
    revenueCents: initial + offer,
    initialRevenueCents: initial,
    offerRevenueCents: offer,
    revenueByCurrency: currencySplit(live?.revenueByCurrency, initial + offer),
  };
}

function currencySplit(byCurrency: Record<string, number> | undefined, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  let known = 0;
  for (const [cur, cents] of Object.entries(byCurrency ?? {})) {
    if (n(cents) > 0) { out[cur.toUpperCase()] = n(cents); known += n(cents); }
  }
  if (total - known > 0) out[""] = total - known;
  return out;
}

export function mergeCurrency(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function funnelDayMetrics(doc: RawFunnelDaily): FunnelMetrics {
  const modes = doc.modes ?? {};
  return countsMetrics({ traffic: TRAFFIC_MODES.map((m) => modes[m] ?? {}), live: modes.live });
}

export function funnelStepDayMetrics(doc: RawFunnelDaily, stepKey: string): FunnelMetrics & { visitors: number } {
  const modes = doc.modes ?? {};
  const traffic = TRAFFIC_MODES.map((m) => modes[m]?.byStep?.[stepKey] ?? {});
  return {
    ...countsMetrics({ traffic, live: modes.live?.byStep?.[stepKey] }),
    visitors: traffic.reduce((s, c) => s + n(c.uniqueVisitors), 0),
  };
}

const FUNNEL_COUNT_KEYS = ["views", "entries", "checkoutStarts", "checkoutFailures", "purchases", "trials", "freeOrders", "offersAccepted", "offersDeclined", "revenueCents", "initialRevenueCents", "offerRevenueCents"] as const;
export function addFunnelMetrics(a: FunnelMetrics, b: FunnelMetrics): FunnelMetrics {
  const out = { ...a, revenueByCurrency: mergeCurrency(a.revenueByCurrency, b.revenueByCurrency) };
  for (const k of FUNNEL_COUNT_KEYS) out[k] = a[k] + b[k];
  return out;
}
export const sumFunnelMetrics = (list: FunnelMetrics[]): FunnelMetrics => list.reduce(addFunnelMetrics, { ...EMPTY_FUNNEL_METRICS, revenueByCurrency: {} });

/** Purchases ÷ entries, or null when the funnel can't sell / has no entries. */
export function funnelConversionRate(m: Pick<FunnelMetrics, "purchases" | "entries">, sells: boolean): number | null {
  if (!sells || m.entries <= 0) return null;
  return m.purchases / m.entries;
}

/** Same day key as funnel-analytics-service's field-path sanitizing. */
export const analyticsKey = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);

/* ---------------------------------- Pages --------------------------------- */

export interface RawPageDaily {
  day: string;
  views?: number;
  uniqueVisitors?: number;
  goals?: { form_submission?: number };
  modes?: Record<string, { purchases?: number; revenueCents?: number; revenueByCurrency?: Record<string, number> } | undefined>;
}

export interface PageMetrics {
  views: number;
  /** Distinct visitor sessions per day, summed across the period. */
  visitors: number;
  formSubmissions: number;
  /** Verified LIVE paid purchases through this page's checkout. */
  purchases: number;
  revenueCents: number;
  revenueByCurrency: Record<string, number>;
}

export const EMPTY_PAGE_METRICS: PageMetrics = { views: 0, visitors: 0, formSubmissions: 0, purchases: 0, revenueCents: 0, revenueByCurrency: {} };

export function pageDayMetrics(doc: RawPageDaily): PageMetrics {
  const live = doc.modes?.live;
  return {
    views: n(doc.views),
    visitors: n(doc.uniqueVisitors),
    formSubmissions: n(doc.goals?.form_submission),
    purchases: n(live?.purchases),
    revenueCents: n(live?.revenueCents),
    revenueByCurrency: currencySplit(live?.revenueByCurrency, n(live?.revenueCents)),
  };
}
export function addPageMetrics(a: PageMetrics, b: PageMetrics): PageMetrics {
  return {
    views: a.views + b.views, visitors: a.visitors + b.visitors, formSubmissions: a.formSubmissions + b.formSubmissions,
    purchases: a.purchases + b.purchases, revenueCents: a.revenueCents + b.revenueCents, revenueByCurrency: mergeCurrency(a.revenueByCurrency, b.revenueByCurrency),
  };
}
export const sumPageMetrics = (list: PageMetrics[]): PageMetrics => list.reduce(addPageMetrics, { ...EMPTY_PAGE_METRICS, revenueByCurrency: {} });

export type PageGoalKind = "purchase" | "form_submission";

/**
 * What counts as a conversion for a page. Comes from the page's own Goal
 * (set when it was created) AND what the published page can actually do —
 * never a button click, never invented:
 *   Sales / Conversion          → a verified LIVE purchase through its checkout
 *   Lead Generation / Registration → a successful submission of a form on it
 *   Confirmation / Other / none → no conversion goal
 */
export interface PageGoalInfo {
  kind: PageGoalKind | null;
  /** Short label, e.g. "Purchases" / "Form submissions" / "No conversion goal". */
  label: string;
  /** Why there's no measurable goal (shown instead of a fake 0%). */
  reason: string | null;
}

export function pageGoalFor(input: { goal: string | null | undefined; hasForm: boolean; hasCheckout: boolean }): PageGoalInfo {
  const { goal, hasForm, hasCheckout } = input;
  if (goal === "sales") {
    return hasCheckout
      ? { kind: "purchase", label: "Purchases", reason: null }
      : { kind: null, label: "Not measurable", reason: "This page's goal is Sales, but it has no checkout to measure." };
  }
  if (goal === "lead_generation" || goal === "registration") {
    return hasForm
      ? { kind: "form_submission", label: "Form submissions", reason: null }
      : { kind: null, label: "Not measurable", reason: "This page's goal needs a form, but the published page has none." };
  }
  return { kind: null, label: "No conversion goal", reason: "Informational page — views only." };
}

export function pageConversions(m: PageMetrics, goal: PageGoalInfo): number | null {
  if (goal.kind === "purchase") return m.purchases;
  if (goal.kind === "form_submission") return m.formSubmissions;
  return null;
}
export function pageConversionRate(m: PageMetrics, goal: PageGoalInfo): number | null {
  const c = pageConversions(m, goal);
  if (c === null || m.visitors <= 0) return null;
  return c / m.visitors;
}

/* -------------------------------- Comparison ------------------------------- */

/**
 * % change vs the previous period — only when tracking covered that whole
 * previous period (never a comparison against days before tracking began).
 */
export function percentChange(current: number, previous: number | null, comparable: boolean): number | null {
  if (!comparable || previous === null || previous <= 0) return null;
  return (current - previous) / previous;
}
export const comparable = (trackingSince: string | null, range: AnalyticsRange): boolean => !!trackingSince && trackingSince <= range.prevFrom;

/* --------------------------------- Formatting ------------------------------ */

export const formatPercent = (v: number | null): string => (v === null ? "—" : `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : 1)}%`);
export function formatCents(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
export const formatCount = (v: number): string => new Intl.NumberFormat("en-US").format(v);

/** One currency → its total; several → "Multiple currencies" (money is never summed across currencies). */
export function formatRevenue(byCurrency: Record<string, number>): { text: string; detail: string | null } {
  const entries = Object.entries(byCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return { text: formatCents(0), detail: null };
  if (entries.length === 1) return { text: formatCents(entries[0][1], entries[0][0] || "USD"), detail: null };
  return { text: "Multiple currencies", detail: entries.map(([c, v]) => formatCents(v, c || "USD")).join(" · ") };
}
