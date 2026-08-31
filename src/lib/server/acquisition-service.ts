import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type {
  AcquisitionBreakdownRow,
  AcquisitionSummary,
  PlatformSignupPurchaseDoc,
} from "@/types/billing";

/**
 * Agency Acquisition Foundation (2026-08-31) — read-side aggregation for
 * Agency → Acquisition (Sales & Affiliate Infrastructure audit, Part 12).
 * Deliberately separate from `billing-service.ts` (the WRITE path for
 * purchases/plans): this file only reads `purchases` + `attributionVisits`
 * and computes a summary — no side effects, safe to call from a GET route
 * on every page load.
 *
 * Dataset-size note: pre-launch, an agency's `purchases` and
 * `attributionVisits` collections are small, so this reads the full set and
 * aggregates in memory rather than building Firestore aggregation queries
 * or a pre-computed rollup doc. Documented as a known scaling limitation
 * (see the final report) — fine at today's volume, worth revisiting once
 * real traffic exists (the same P2 boundary the audit already drew for
 * "wait for real traffic" work).
 */

const ABANDONED_THRESHOLD_MS = 24 * 60 * 60_000; // 24h with no completion
const PURCHASE_DOC_CAP = 5000;
const VISIT_DOC_CAP = 5000;
const RECENT_SIGNUPS_LIMIT = 20;

function tsToMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as { toMillis?: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

function tsToIso(v: unknown): string | null {
  const ms = tsToMillis(v);
  return ms !== null ? new Date(ms).toISOString() : null;
}

/**
 * `purchases` docs for this agency with `status === "checkout_started"`
 * that are older than `olderThanMs` (default 24h) — i.e. the buyer opened
 * Stripe Checkout and never came back, and the webhook never fired. No
 * recovery automation reads this yet (out of scope) — it exists purely to
 * make abandonment QUERYABLE, per the audit's Part 11.
 */
export async function getAbandonedPlatformSignups(
  agencyId: string,
  olderThanMs: number = ABANDONED_THRESHOLD_MS,
): Promise<PlatformSignupPurchaseDoc[]> {
  const snap = await getAdminDb()
    .collection("purchases")
    .where("agencyId", "==", agencyId)
    .where("kind", "==", "platformSignup")
    .where("status", "==", "checkout_started")
    .limit(PURCHASE_DOC_CAP)
    .get();

  const cutoff = Date.now() - olderThanMs;
  return snap.docs
    .map((d) => d.data() as PlatformSignupPurchaseDoc)
    .filter((d) => {
      const startedMs = tsToMillis(d.checkoutStartedAt) ?? tsToMillis(d.createdAt);
      return startedMs !== null && startedMs < cutoff;
    });
}

function bumpBreakdown(
  map: Map<string, { visits: number; purchases: number }>,
  key: string | null | undefined,
  field: "visits" | "purchases",
  amount = 1,
) {
  const k = key && key.trim() ? key.trim() : "(direct / untagged)";
  const row = map.get(k) ?? { visits: 0, purchases: 0 };
  row[field] += amount;
  map.set(k, row);
}

function toRows(
  map: Map<string, { visits: number; purchases: number }>,
): AcquisitionBreakdownRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, visits: v.visits, purchases: v.purchases }))
    .sort((a, b) => b.visits + b.purchases - (a.visits + a.purchases));
}

/**
 * Full Agency → Acquisition summary for one agency. See
 * {@link AcquisitionSummary}'s own doc comment for what each field means
 * and which ones are browser-beacon estimates vs. authoritative
 * Stripe/webhook-sourced counts.
 */
export async function getAcquisitionSummary(
  agencyId: string,
  opts?: { salesPageConfigured?: boolean; abandonedThresholdMs?: number },
): Promise<AcquisitionSummary> {
  const db = getAdminDb();

  const [purchasesSnap, visitsSnap] = await Promise.all([
    db
      .collection("purchases")
      .where("agencyId", "==", agencyId)
      .where("kind", "==", "platformSignup")
      .limit(PURCHASE_DOC_CAP)
      .get(),
    db
      .collection("attributionVisits")
      .where("agencyId", "==", agencyId)
      .where("pageType", "==", "platformSignup")
      .limit(VISIT_DOC_CAP)
      .get(),
  ]);

  const purchaseDocs = purchasesSnap.docs.map(
    (d) => d.data() as PlatformSignupPurchaseDoc,
  );

  let visits = 0;
  let uniqueVisitors = 0;
  const bySourceVisits = new Map<string, { visits: number; purchases: number }>();
  const byCampaignVisits = new Map<string, { visits: number; purchases: number }>();
  const byReferrerVisits = new Map<string, { visits: number; purchases: number }>();

  for (const doc of visitsSnap.docs) {
    const d = doc.data() as {
      visits?: number;
      uniqueVisitors?: number;
      utmSource?: string | null;
      utmCampaign?: string | null;
      referrerSource?: string | null;
    };
    const v = d.visits ?? 0;
    visits += v;
    uniqueVisitors += d.uniqueVisitors ?? 0;
    bumpBreakdown(bySourceVisits, d.utmSource, "visits", v);
    bumpBreakdown(byCampaignVisits, d.utmCampaign, "visits", v);
    bumpBreakdown(byReferrerVisits, d.referrerSource, "visits", v);
  }

  const abandonedThreshold = opts?.abandonedThresholdMs ?? ABANDONED_THRESHOLD_MS;
  const cutoff = Date.now() - abandonedThreshold;

  let checkoutStarts = 0;
  let purchases = 0;
  let abandonedCheckouts = 0;
  const recentSignups: AcquisitionSummary["recentSignups"] = [];

  for (const d of purchaseDocs) {
    checkoutStarts += 1;
    const source = d.attribution?.utmSource ?? null;
    const campaign = d.attribution?.utmCampaign ?? null;
    const referrer = d.attribution?.referrerSource ?? null;

    if (d.status === "provisioned") {
      purchases += 1;
      bumpBreakdown(bySourceVisits, source, "purchases");
      bumpBreakdown(byCampaignVisits, campaign, "purchases");
      bumpBreakdown(byReferrerVisits, referrer, "purchases");
      recentSignups.push({
        sessionId: d.sessionId,
        businessName: d.businessName || "—",
        buyerEmail: d.buyerEmail,
        planId: d.planId,
        utmSource: source,
        provisionedAt: tsToIso(d.provisionedAt),
      });
    } else if (d.status === "checkout_started") {
      const startedMs = tsToMillis(d.checkoutStartedAt) ?? tsToMillis(d.createdAt);
      if (startedMs !== null && startedMs < cutoff) abandonedCheckouts += 1;
    }
  }

  recentSignups.sort((a, b) => {
    const am = a.provisionedAt ? Date.parse(a.provisionedAt) : 0;
    const bm = b.provisionedAt ? Date.parse(b.provisionedAt) : 0;
    return bm - am;
  });

  return {
    agencyId,
    salesPageConfigured: opts?.salesPageConfigured ?? false,
    visits,
    uniqueVisitors,
    checkoutStarts,
    purchases,
    abandonedCheckouts,
    salesPageConversionRate: visits > 0 ? purchases / visits : null,
    checkoutConversionRate: checkoutStarts > 0 ? purchases / checkoutStarts : null,
    bySource: toRows(bySourceVisits),
    byCampaign: toRows(byCampaignVisits),
    byReferrer: toRows(byReferrerVisits),
    recentSignups: recentSignups.slice(0, RECENT_SIGNUPS_LIMIT),
  };
}
