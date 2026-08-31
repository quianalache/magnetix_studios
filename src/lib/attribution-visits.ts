import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ContactAttribution } from "@/types/contacts";

/**
 * Lightweight visit/conversion rollup for public pages — how many landings
 * vs. how many of those actually converted, broken down by UTM/referrer-
 * source. Originally sub-account pages (booking, course-offer checkout);
 * extended 2026-08-31 (Agency Acquisition Foundation) with `"platformSignup"`
 * — the agency's OWN externally-hosted sales page (GitPage today, anything
 * else tomorrow) selling Magnetix itself, tracked via
 * `src/app/api/track/acquisition/route.ts`. Same bucket, same fields; the
 * only new thing is which `pageType` a caller passes in, which is exactly
 * the point — see that route's doc comment on reusing this rollup instead
 * of building a second analytics vocabulary.
 *
 * Deliberately a ROLLUP, not an append-only event log: one doc per
 * (page, day, attribution-dimensions) bucket, incremented atomically via
 * `FieldValue.increment`. Nothing in the reporting requirements needs to
 * inspect an individual visit — only aggregate counts — so this keeps
 * volume low and avoids read-then-write races entirely. Same philosophy as
 * `src/lib/landing/attribution-rollup.ts` (Magnetix Studios' own, unrelated
 * marketing-site funnel) — NOT shared code, a decoupled sibling.
 */

export type AttributionPageType = "booking" | "offer" | "platformSignup";

const DIMENSION_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "referrerSource",
] as const satisfies readonly (keyof ContactAttribution)[];

type AttributionDimensions = Pick<ContactAttribution, (typeof DIMENSION_KEYS)[number]>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function bucketId(
  pageType: AttributionPageType,
  pageId: string,
  day: string,
  dims: AttributionDimensions,
): string {
  const parts = [
    pageType,
    pageId,
    day,
    ...DIMENSION_KEYS.map((k) => dims[k] ?? ""),
  ];
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

/**
 * Increments `visits` or `conversions` on the deterministic bucket doc for
 * this (page, day, attribution) combination — creating it on first write.
 * Fire-and-forget from every caller (`void bumpAttributionVisit(...).catch(...)`)
 * — a failure here must never break the booking/purchase/visit it's
 * measuring.
 */
export async function bumpAttributionVisit(opts: {
  /**
   * Null for an agency-level page with no owning sub-account (e.g.
   * `pageType: "platformSignup"` — the agency's own sales page, scoped by
   * `agencyId` alone).
   */
  subAccountId: string | null;
  agencyId: string;
  pageType: AttributionPageType;
  pageId: string;
  attribution: Partial<ContactAttribution> | null;
  /**
   * "uniqueVisitors" bumps once per distinct visitor per bucket (the
   * caller decides "distinct" — see `recordFirstTouchIfAbsent` for the
   * server-enforced, unspoofable version used by
   * `/api/track/acquisition`), kept as its own counter alongside `visits`
   * (every page load) so a UI can show both without conflating them.
   */
  field: "visits" | "conversions" | "uniqueVisitors";
}): Promise<void> {
  const day = todayUtc();
  const dims: AttributionDimensions = {
    utmSource: opts.attribution?.utmSource ?? null,
    utmMedium: opts.attribution?.utmMedium ?? null,
    utmCampaign: opts.attribution?.utmCampaign ?? null,
    utmContent: opts.attribution?.utmContent ?? null,
    utmTerm: opts.attribution?.utmTerm ?? null,
    referrerSource: opts.attribution?.referrerSource ?? null,
  };
  const id = bucketId(opts.pageType, opts.pageId, day, dims);
  const ref = getAdminDb().collection("attributionVisits").doc(id);
  await ref.set(
    {
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      pageType: opts.pageType,
      pageId: opts.pageId,
      day,
      ...dims,
      [opts.field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Privacy-conscious "unique-ish visitor" dedup for a (page, day) — NOT tied
 * to attribution dimensions, so a session that arrives via two different
 * UTM-tagged links on the same day still counts once. Uses the same
 * `.create()`-throws-on-duplicate idempotency idiom as
 * `purchases/{sessionId}` and `attributionFirstTouch` elsewhere in this
 * codebase: writes a tiny marker doc the FIRST time a given (page, day,
 * sessionId) is seen and returns `true`; every later call for the same
 * session that day returns `false` — the caller only bumps the
 * `uniqueVisitors` counter (via `bumpAttributionVisit`) when this returns
 * `true`.
 *
 * "sessionId" is caller-supplied and untrusted by design — see
 * `/api/track/acquisition`'s doc comment on what it actually measures (a
 * browser session, not a person) and its honest limitations.
 */
export async function claimUniqueVisitorSlot(opts: {
  pageType: AttributionPageType;
  pageId: string;
  sessionId: string;
}): Promise<boolean> {
  const day = todayUtc();
  const id = createHash("sha1")
    .update(`${opts.pageType}|${opts.pageId}|${day}|${opts.sessionId}`)
    .digest("hex");
  const ref = getAdminDb().collection("attributionSessionSeen").doc(id);
  try {
    await ref.create({
      pageType: opts.pageType,
      pageId: opts.pageId,
      day,
      sessionId: opts.sessionId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 6) throw err; // not ALREADY_EXISTS — a real write failure.
    return false;
  }
}
