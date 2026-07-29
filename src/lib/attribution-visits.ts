import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ContactAttribution } from "@/types/contacts";

/**
 * Lightweight visit/conversion rollup for sub-account public pages
 * (booking, course-offer checkout) — how many landings vs. how many of
 * those actually converted, broken down by UTM/referrer-source.
 *
 * Deliberately a ROLLUP, not an append-only event log: one doc per
 * (page, day, attribution-dimensions) bucket, incremented atomically via
 * `FieldValue.increment`. Nothing in the reporting requirements needs to
 * inspect an individual visit — only aggregate counts — so this keeps
 * volume low and avoids read-then-write races entirely. Same philosophy as
 * `src/lib/landing/attribution-rollup.ts` (Magnetix Studios' own, unrelated
 * marketing-site funnel) — NOT shared code, a decoupled sibling for
 * sub-account pages.
 */

export type AttributionPageType = "booking" | "offer";

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
  subAccountId: string;
  agencyId: string;
  pageType: AttributionPageType;
  pageId: string;
  attribution: Partial<ContactAttribution> | null;
  field: "visits" | "conversions";
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
