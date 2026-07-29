import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAttribution } from "@/lib/attribution";
import { bumpAttributionVisit, type AttributionPageType } from "@/lib/attribution-visits";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import type { BookingPage } from "@/types/booking";
import type { SubAccountDoc } from "@/types/tenancy";
import type { ContactAttribution } from "@/types/contacts";

export const dynamic = "force-dynamic";

/**
 * Records a "visit" (landing, whether or not it converts) on a sub-account's
 * public booking page or course-offer checkout page — the counterpart to
 * the "conversions" side already bumped from `book/route.ts` and
 * `course-offer-purchase-service.ts`. One shared endpoint for both page
 * types so the capture logic (validation, bot-guard, rate-limit,
 * normalization) isn't duplicated per page type — see
 * `src/components/attribution/visit-logger.tsx` for the client caller.
 *
 * Always returns 200/204 even when nothing was recorded (unknown page, bot,
 * rate-limited) — this is a fire-and-forget beacon, never something a real
 * visitor's page load should error on.
 */

interface TrackBody {
  subAccountId?: string;
  pageType?: AttributionPageType;
  pageId?: string;
  attribution?: Partial<ContactAttribution> | null;
}

// ── Soft rate limits — visits are far more frequent than bookings, so caps
// are much higher than book/route.ts's, same in-memory-per-instance pattern.
const IP_HOURLY_CAP = 120;
const SUB_HOURLY_CAP = 5000;
const WINDOW_MS = 60 * 60_000;
const ipHits = new Map<string, number[]>();
const subHits = new Map<string, number[]>();

function pushAndCheck(
  bucket: Map<string, number[]>,
  key: string,
  cap: number,
): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (bucket.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= cap) {
    bucket.set(key, arr);
    return true;
  }
  arr.push(now);
  bucket.set(key, arr);
  if (bucket.size > 5000) {
    const oldest = bucket.keys().next().value;
    if (oldest !== undefined) bucket.delete(oldest);
  }
  return false;
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Known non-human agents. `facebookexternalhit` matters concretely — it
// fires when someone shares a booking/offer link in Messenger, which would
// otherwise inflate real "Facebook" visit counts with zero actual visitors.
const BOT_UA_RE =
  /bot|spider|crawl|slurp|facebookexternalhit|pingdom|uptimerobot|headlesschrome|phantomjs/i;

const noop = () => NextResponse.json({ ok: true });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (pushAndCheck(ipHits, ip, IP_HOURLY_CAP)) return noop();

  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_UA_RE.test(ua)) return noop();

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return noop();
  }

  const subAccountId = body.subAccountId?.trim();
  const pageId = body.pageId?.trim();
  const pageType = body.pageType;
  if (
    !subAccountId ||
    !pageId ||
    (pageType !== "booking" && pageType !== "offer")
  ) {
    return noop();
  }

  if (pushAndCheck(subHits, subAccountId, SUB_HOURLY_CAP)) return noop();

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) return noop();
  const sub = subSnap.data() as SubAccountDoc;

  // Only real, published pages accrue visits — bounds how much an
  // attacker could inflate counts to actual existing pages.
  if (pageType === "booking") {
    const pageSnap = await db
      .doc(`subAccounts/${subAccountId}/bookingPages/${pageId}`)
      .get();
    if (!pageSnap.exists) return noop();
    const page = pageSnap.data() as BookingPage;
    if (page.status !== "published") return noop();
  } else {
    const offer = await getCourseOffer(subAccountId, pageId);
    if (!offer || offer.visibility !== "published") return noop();
  }

  const attribution = normalizeAttribution(body.attribution ?? undefined);

  try {
    await bumpAttributionVisit({
      subAccountId,
      agencyId: sub.agencyId,
      pageType,
      pageId,
      attribution,
      field: "visits",
    });
  } catch (err) {
    console.warn("[track/visit] bump failed", err);
  }

  return noop();
}
