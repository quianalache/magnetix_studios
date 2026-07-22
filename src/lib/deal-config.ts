/**
 * Shared shape + defaults for the live-editable deal campaign — the deal
 * name, the urgency mechanic (spots counter OR countdown timer), the
 * scarcity-counter noun ("spots"), the seat count, and the countdown's
 * deadline + offer label shown across every landing surface (hero, pricing
 * card, announcement bar, CTAs, FAQ).
 *
 * Persisted on the EXISTING `appConfig/foundersCohort` doc (fields `dealName`,
 * `memberNoun`, `slotsTotal`, `dealType`, `dealEndsAt`, `offerLabel`) — the
 * same publicly-readable doc the scarcity counter already reads live via
 * {@link useFoundersCohort}, so no new Firestore rules are needed.
 * Server-only writes via /api/agency/deal-config (Admin SDK). Code defaults
 * come from `src/config/deal.ts`; the doc overrides them the moment the
 * agency owner saves once. Mirrors the updates-modal config feature.
 *
 * The two urgency mechanics are mutually exclusive by construction —
 * `dealType` is a single enum, so exactly one renders at a time:
 *   - "spots":     today's "{sold} of {total} {noun} claimed" counter.
 *   - "countdown": a ticking deadline ("{offerLabel} until {date}").
 *     When the deadline passes, urgency UI hides but the page KEEPS
 *     SELLING at the same price (operator-chosen behavior) — relaunch by
 *     saving a new date.
 *
 * Deliberately NOT here: soldCount / currentWave (Stripe-webhook-owned — the
 * editor never writes them) and prices (kept inline in components by design;
 * see src/config/deal.ts).
 */

import { DEAL } from "@/config/deal";

export type DealType = "spots" | "countdown";

export interface DealConfig {
  /** Campaign name — headlines, badges, pricing-card title, FAQ. */
  dealName: string;
  /** Which urgency mechanic the landing renders. Missing field = "spots". */
  dealType: DealType;
  /** Plural noun in the scarcity counter: "{sold} of {total} {noun} claimed". */
  memberNoun: string;
  /** Cohort size — the live override of DEAL.seatsTotal. */
  slotsTotal: number;
  /**
   * Countdown deadline as an ISO-8601 string (UTC instant), or null when
   * unset. Ignored in "spots" mode. A past date = timer hidden, still selling.
   */
  dealEndsAt: string | null;
  /** Countdown offer line, e.g. "50% off" — display copy only, never pricing. */
  offerLabel: string;
  /**
   * When true and the deal has ENDED (countdown expired, or spots sold out),
   * CTAs switch to a full-price $1,782 Stripe checkout (coupon-code box
   * enabled) — enforced server-side in /api/checkout/founders. When false:
   * countdown keeps selling at the deal price after expiry; sold-out spots
   * shows the contact-us card (today's behavior).
   */
  fullPriceAfterEnd: boolean;
}

/** Hard caps so an untrusted payload can't bloat the doc or break layouts. */
export const DEAL_NAME_MAX = 60;
export const DEAL_MEMBER_NOUN_MAX = 24;
export const DEAL_SEATS_MIN = 1;
export const DEAL_SEATS_MAX = 10000;
export const DEAL_OFFER_LABEL_MAX = 40;

export const DEAL_TYPES: readonly DealType[] = ["spots", "countdown"];

/** Shown until the agency owner saves once (or the doc/fields are missing). */
export const DEAL_CONFIG_DEFAULTS: DealConfig = {
  dealName: DEAL.name,
  dealType: "spots",
  memberNoun: DEAL.memberNoun,
  slotsTotal: DEAL.seatsTotal,
  dealEndsAt: null,
  offerLabel: "50% off",
  fullPriceAfterEnd: false,
};

function coerceDealEndsAt(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Normalize an untrusted Firestore payload to a complete, valid config. */
export function coerceDealConfig(
  data: Record<string, unknown> | undefined | null,
): DealConfig {
  if (!data) return { ...DEAL_CONFIG_DEFAULTS };

  const dealName =
    typeof data.dealName === "string" && data.dealName.trim()
      ? data.dealName.trim().slice(0, DEAL_NAME_MAX)
      : DEAL_CONFIG_DEFAULTS.dealName;

  const dealType: DealType =
    data.dealType === "countdown" ? "countdown" : "spots";

  const memberNoun =
    typeof data.memberNoun === "string" && data.memberNoun.trim()
      ? data.memberNoun.trim().slice(0, DEAL_MEMBER_NOUN_MAX)
      : DEAL_CONFIG_DEFAULTS.memberNoun;

  const rawSlots = data.slotsTotal;
  const slotsTotal =
    typeof rawSlots === "number" &&
    Number.isInteger(rawSlots) &&
    rawSlots >= DEAL_SEATS_MIN &&
    rawSlots <= DEAL_SEATS_MAX
      ? rawSlots
      : DEAL_CONFIG_DEFAULTS.slotsTotal;

  const dealEndsAt = coerceDealEndsAt(data.dealEndsAt);

  const offerLabel =
    typeof data.offerLabel === "string" && data.offerLabel.trim()
      ? data.offerLabel.trim().slice(0, DEAL_OFFER_LABEL_MAX)
      : DEAL_CONFIG_DEFAULTS.offerLabel;

  return {
    dealName,
    dealType,
    memberNoun,
    slotsTotal,
    dealEndsAt,
    offerLabel,
    fullPriceAfterEnd: data.fullPriceAfterEnd === true,
  };
}

/**
 * Whether the campaign has ENDED for full-price purposes: countdown mode =
 * deadline passed; spots mode = sold out. `soldCount` should already include
 * any manual offset the caller applies (see useFoundersCohort /
 * NEXT_PUBLIC_FOUNDERS_MANUAL_SOLD).
 */
export function dealHasEnded(
  config: Pick<DealConfig, "dealType" | "dealEndsAt" | "slotsTotal">,
  soldCount: number,
  nowMs: number,
): boolean {
  if (config.dealType === "countdown") {
    if (!config.dealEndsAt) return false;
    const ms = Date.parse(config.dealEndsAt);
    return Number.isFinite(ms) && ms <= nowMs;
  }
  return soldCount >= config.slotsTotal;
}
