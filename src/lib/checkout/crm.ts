/**
 * Checkout CRM & Follow-Up — PURE rules (Checkout Foundation Phase 3).
 *
 * Settings live on the checkout CONFIG (Funnel Checkout Step or hosted Offer
 * checkout), never on a Page Builder block. Everything here is plain data:
 * defaults, input sanitising, tag maths and the abandonment clock. The
 * server service (lib/server/checkout/crm-service.ts) does the writes.
 */
import { tagKey } from "@/lib/contacts/tag-names";
import type { CheckoutCrmSettings, CheckoutSession } from "@/types/checkout";

/** Allowed abandonment delays, in minutes (scheduler-compatible). */
export const ABANDON_DELAY_OPTIONS = [30, 60, 240, 1440] as const;
export type AbandonDelayMinutes = (typeof ABANDON_DELAY_OPTIONS)[number];

export const ABANDON_DELAY_LABELS: Record<AbandonDelayMinutes, string> = {
  30: "30 minutes",
  60: "1 hour",
  240: "4 hours",
  1440: "24 hours",
};

export const DEFAULT_MARKETING_OPT_IN_LABEL = "Yes, send me emails with news, tips and offers. I can unsubscribe at any time.";

export const MAX_CHECKOUT_TAGS = 10;
const MAX_TAG_LENGTH = 60;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const DEFAULT_CHECKOUT_CRM: CheckoutCrmSettings = {
  captureContactOnStart: true,
  startedTags: [],
  marketingOptIn: { enabled: false, label: DEFAULT_MARKETING_OPT_IN_LABEL, tags: [] },
  abandoned: { enabled: false, delayMinutes: 60, workflowId: null, tags: [] },
  completed: { tags: [], removeAbandonedTags: true, workflowId: null },
  bumpPurchasedTags: [],
  couponUsedTags: [],
};

/** Trim, de-duplicate (case-insensitively) and cap a tag list. */
export function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tagKey(tag))) continue;
    seen.add(tagKey(tag));
    out.push(tag);
    if (out.length >= MAX_CHECKOUT_TAGS) break;
  }
  return out;
}

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const workflowRef = (v: unknown): string | null => (typeof v === "string" && ID_RE.test(v.trim()) ? v.trim() : null);

/** Read a stored (possibly legacy / partial) crm block with defaults. */
export function normalizeCrm(raw: unknown): CheckoutCrmSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const opt = (r.marketingOptIn && typeof r.marketingOptIn === "object" ? r.marketingOptIn : {}) as Record<string, unknown>;
  const ab = (r.abandoned && typeof r.abandoned === "object" ? r.abandoned : {}) as Record<string, unknown>;
  const done = (r.completed && typeof r.completed === "object" ? r.completed : {}) as Record<string, unknown>;
  const d = DEFAULT_CHECKOUT_CRM;
  const delay = ABANDON_DELAY_OPTIONS.includes(ab.delayMinutes as AbandonDelayMinutes) ? (ab.delayMinutes as AbandonDelayMinutes) : d.abandoned.delayMinutes;
  const abandonedEnabled = bool(ab.enabled, d.abandoned.enabled);
  const label = typeof opt.label === "string" ? opt.label.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return {
    // Abandonment and every tag/workflow action need a Contact, so turning
    // abandonment on always keeps capture on.
    captureContactOnStart: abandonedEnabled || bool(r.captureContactOnStart, d.captureContactOnStart),
    startedTags: cleanTags(r.startedTags),
    marketingOptIn: {
      enabled: bool(opt.enabled, d.marketingOptIn.enabled),
      label: label || d.marketingOptIn.label,
      tags: cleanTags(opt.tags),
    },
    abandoned: { enabled: abandonedEnabled, delayMinutes: delay, workflowId: workflowRef(ab.workflowId), tags: cleanTags(ab.tags) },
    completed: {
      tags: cleanTags(done.tags),
      removeAbandonedTags: bool(done.removeAbandonedTags, d.completed.removeAbandonedTags),
      workflowId: workflowRef(done.workflowId),
    },
    bumpPurchasedTags: cleanTags(r.bumpPurchasedTags),
    couponUsedTags: cleanTags(r.couponUsedTags),
  };
}

/** Merge tags onto an existing list (case-insensitive no-dup). Returns null when unchanged. */
export function addTags(existing: string[], add: string[]): string[] | null {
  const have = new Set(existing.map(tagKey));
  const extra = add.filter((t) => !have.has(tagKey(t)));
  return extra.length ? [...existing, ...extra] : null;
}

/** Remove tags (case-insensitive). Returns null when unchanged. */
export function removeTags(existing: string[], remove: string[]): string[] | null {
  const drop = new Set(remove.map(tagKey));
  const next = existing.filter((t) => !drop.has(tagKey(t)));
  return next.length === existing.length ? null : next;
}

/** When a started session becomes eligible to be called abandoned. */
export function abandonDueAt(lastActivityAt: number, delayMinutes: number): number {
  return lastActivityAt + delayMinutes * 60_000;
}

/**
 * The abandonment definition. A checkout is abandoned only when ALL hold:
 *  1. a started session exists (status "started"),
 *  2. buyer identity exists (an email),
 *  3. no purchase completed it,
 *  4. the configured delay elapsed since the buyer's LAST activity,
 *  5. it wasn't superseded (e.g. the buyer corrected their email).
 */
export function abandonmentDecision(
  session: Pick<CheckoutSession, "status" | "email" | "lastActivityAt" | "abandonment">,
  crm: Pick<CheckoutCrmSettings, "abandoned">,
  now: number,
): { action: "fire" } | { action: "wait"; dueAt: number } | { action: "skip"; reason: string } {
  if (!crm.abandoned.enabled) return { action: "skip", reason: "tracking_disabled" };
  if (session.status !== "started") return { action: "skip", reason: `status_${session.status}` };
  if (!session.email) return { action: "skip", reason: "no_identity" };
  if (session.abandonment?.firedAt) return { action: "skip", reason: "already_fired" };
  const due = abandonDueAt(session.lastActivityAt, crm.abandoned.delayMinutes);
  if (now < due) return { action: "wait", dueAt: due };
  return { action: "fire" };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
