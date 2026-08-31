import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ContactAttribution } from "@/types/contacts";

/**
 * Durable FIRST-TOUCH marketing attribution, per anonymous visitor — Agency
 * Acquisition Foundation (2026-08-31), Sales & Affiliate Infrastructure
 * audit Part 5/9. Deliberately a SEPARATE, small collection from
 * `attributionVisits` (the visit/conversion ROLLUP counters): rollup buckets
 * are keyed by (page, day, dimensions) and have no notion of "the same
 * visitor came back" — first-touch needs exactly that, and needs it to be
 * genuinely un-overwritable by a later ordinary visit.
 *
 * "First touch" here means marketing insight ("where did this customer
 * ORIGINALLY come from"), kept deliberately separate from any future
 * affiliate-commission attribution (which the audit recommends as LAST
 * touch within a window — a different question with a different answer).
 * This module answers only the first question.
 *
 * ENFORCEMENT: `.create()` on a deterministic `visitorId`-keyed doc throws
 * ALREADY_EXISTS on every call after the first — so "never overwritten by
 * later ordinary visits" is a server-side Firestore guarantee, not a
 * client-trusted flag. The tracking snippet can call this on every single
 * page view; only the very first one for a given visitor ever actually
 * writes.
 */

export interface FirstTouchRecord {
  visitorId: string;
  agencyId: string;
  attribution: ContactAttribution | null;
  landingPage: string | null;
  /** Referral/affiliate code present on the FIRST visit, if any — stored
   *  for future affiliate analytics, not used for any commission
   *  calculation here (see `PlatformSignupPurchaseDoc.referralCode`, the
   *  field that actually matters for a completed purchase). */
  referralCode: string | null;
  capturedAt: FieldValue;
  createdAt: FieldValue;
}

function docId(agencyId: string, visitorId: string): string {
  // Composite id (not a subcollection) — keeps this a flat, single-read
  // collection, matching `attributionVisits`' own flat-collection shape.
  return `${agencyId}__${visitorId}`;
}

/**
 * Writes the first-touch record for this (agencyId, visitorId) pair IF one
 * doesn't already exist. Every subsequent call for the same visitor is a
 * harmless no-op (ALREADY_EXISTS is swallowed, not surfaced as an error) —
 * callers never need to check "is this the first visit" themselves.
 *
 * Fire-and-forget from the tracking route, same tolerance as
 * `bumpAttributionVisit` — a failure here must never break the beacon it's
 * riding along with.
 */
export async function recordFirstTouchIfAbsent(opts: {
  visitorId: string;
  agencyId: string;
  attribution: ContactAttribution | null;
  landingPage: string | null;
  referralCode?: string | null;
}): Promise<void> {
  const id = docId(opts.agencyId, opts.visitorId);
  const ref = getAdminDb().collection("attributionFirstTouch").doc(id);
  const record: FirstTouchRecord = {
    visitorId: opts.visitorId,
    agencyId: opts.agencyId,
    attribution: opts.attribution,
    landingPage: opts.landingPage,
    referralCode: opts.referralCode ?? null,
    capturedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
  try {
    await ref.create(record);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 6) throw err; // not ALREADY_EXISTS — a real write failure.
    // Already have this visitor's first touch — exactly the intended
    // no-op path, not an error.
  }
}
