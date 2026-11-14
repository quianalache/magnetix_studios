import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { decodeStoredPuckData } from "@/lib/pages-funnels/puck-storage";
import { collectPuckFormIds } from "@/lib/pages-funnels/puck/resolve";
import { collectCheckoutKeys } from "@/lib/pages-funnels/checkout-block";
import { AUTO_CHECKOUT_KEY } from "@/lib/pages-funnels/checkout-block";
import { analyticsKey, pageGoalFor, utcDay, type PageGoalInfo, type RawPageDaily } from "@/lib/analytics/page-funnel-metrics";
import type { CheckoutOrder } from "@/types/checkout";

/**
 * Real page analytics for Pages & Funnels pages (2026-11). Replaces nothing:
 * Reports → Attribution keeps its own visit records untouched.
 *
 *   pages/{pageId}/analyticsDaily/{YYYY-MM-DD}  bounded daily rollup
 *     views, uniqueVisitors, goals.form_submission,
 *     modes.{live|test}.purchases / revenueCents / revenueByCurrency.{CUR}
 *   pages/{pageId}/analyticsUnique/{hash}        dedupe markers (visitor/day,
 *                                                 goal idempotency)
 *
 * Both are server-only (no Firestore rule → default deny). Days are UTC.
 * A page that is also a funnel step counts ONE page view per visit here; the
 * funnel's own step_viewed is a separate metric in the funnel report.
 * Tracking is prospective — nothing is backfilled or estimated.
 */
const pagesCol = () => getAdminDb().collection("pages");
const dailyCol = (pageId: string) => getAdminDb().collection(`pages/${pageId}/analyticsDaily`);
const markerCol = (pageId: string) => getAdminDb().collection(`pages/${pageId}/analyticsUnique`);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

interface PageLite {
  id: string;
  subAccountId: string;
  agencyId: string;
  status: string;
  name: string;
  goal: string | null;
  pageType: string | null;
  funnelId: string | null;
  updatedAt: number;
  formIds: string[];
  checkoutKeys: string[];
}

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number } | null;
  return typeof t?.toMillis === "function" ? t.toMillis() : 0;
}

function pageLite(id: string, data: FirebaseFirestore.DocumentData | undefined): PageLite | null {
  if (!data) return null;
  const decoded = decodeStoredPuckData(data.puckPublishedData);
  return {
    id,
    subAccountId: typeof data.subAccountId === "string" ? data.subAccountId : "",
    agencyId: typeof data.agencyId === "string" ? data.agencyId : "",
    status: typeof data.status === "string" ? data.status : "draft",
    name: typeof data.name === "string" ? data.name : "Untitled page",
    goal: typeof data.goal === "string" ? data.goal : null,
    pageType: typeof data.pageType === "string" ? data.pageType : null,
    funnelId: typeof data.funnelId === "string" ? data.funnelId : null,
    updatedAt: toMillis(data.updatedAt),
    formIds: decoded.ok ? collectPuckFormIds(decoded.data) : [],
    checkoutKeys: decoded.ok ? collectCheckoutKeys(decoded.data) : [],
  };
}

async function publishedPage(pageId: string): Promise<PageLite | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(pageId)) return null;
  const snap = await pagesCol().doc(pageId).get();
  const page = pageLite(snap.id, snap.data());
  return page && page.status === "published" && page.subAccountId ? page : null;
}

export function goalForPage(page: Pick<PageLite, "goal" | "formIds" | "checkoutKeys">): PageGoalInfo {
  return pageGoalFor({ goal: page.goal, hasForm: page.formIds.length > 0, hasCheckout: page.checkoutKeys.length > 0 });
}

/** One page view of a published page. `visitorId` is the browser's anonymous, workspace-scoped session id. */
export async function recordPageView(input: { pageId: string; visitorId: string }): Promise<boolean> {
  const page = await publishedPage(input.pageId);
  if (!page) return false;
  const now = Date.now();
  const day = utcDay(now);
  const dailyRef = dailyCol(page.id).doc(day);
  const visitorRef = markerCol(page.id).doc(`v_${hash(`${day}:${input.visitorId}`)}`);
  await getAdminDb().runTransaction(async (tx) => {
    const unique = !(await tx.get(visitorRef)).exists;
    tx.set(dailyRef, { pageId: page.id, subAccountId: page.subAccountId, agencyId: page.agencyId, day, updatedAt: now }, { merge: true });
    tx.update(dailyRef, { views: FieldValue.increment(1), ...(unique ? { uniqueVisitors: FieldValue.increment(1) } : {}) });
    if (unique) tx.create(visitorRef, { kind: "visitor", day, createdAt: now });
  });
  return true;
}

/** Writes one goal completion exactly once per idempotency key. */
async function recordGoal(page: PageLite, idempotencyKey: string, updates: Record<string, unknown>): Promise<boolean> {
  const now = Date.now();
  const day = utcDay(now);
  const dailyRef = dailyCol(page.id).doc(day);
  const markerRef = markerCol(page.id).doc(`g_${hash(idempotencyKey)}`);
  return getAdminDb().runTransaction(async (tx) => {
    if ((await tx.get(markerRef)).exists) return false;
    tx.create(markerRef, { kind: "goal", day, createdAt: now });
    tx.set(dailyRef, { pageId: page.id, subAccountId: page.subAccountId, agencyId: page.agencyId, day, updatedAt: now }, { merge: true });
    tx.update(dailyRef, { updatedAt: now, ...updates });
    return true;
  });
}

/**
 * A successful form submission made ON a page. Counted only when the page
 * is published, belongs to the form's workspace and really contains that
 * form — a forged page id can't inflate another page's conversions.
 */
export async function recordPageFormSubmission(input: { pageId: string; formId: string; subAccountId: string; submissionId: string }): Promise<boolean> {
  const page = await publishedPage(input.pageId);
  if (!page || page.subAccountId !== input.subAccountId || !page.formIds.includes(input.formId)) return false;
  return recordGoal(page, `form:${input.submissionId}`, { "goals.form_submission": FieldValue.increment(1) });
}

/**
 * A verified paid funnel checkout → the conversion of the page that hosts
 * the checkout step, when that page is published in the same workspace and
 * contains a Checkout block for this checkout (or the automatic one).
 */
export async function recordCheckoutPagePurchase(input: { order: CheckoutOrder; funnelId: string; stepId: string }): Promise<boolean> {
  const { order } = input;
  const step = await getAdminDb().doc(`funnels/${input.funnelId}/steps/${input.stepId}`).get();
  const pageId = step.get("pageId");
  if (typeof pageId !== "string" || !pageId) return false;
  const page = await publishedPage(pageId);
  if (!page || page.subAccountId !== order.subAccountId) return false;
  if (!page.checkoutKeys.some((k) => k === order.configId || k === AUTO_CHECKOUT_KEY)) return false;
  const mode = order.paymentMode === "live" || order.paymentMode === "test" ? order.paymentMode : "unknown";
  const cents = order.totals.dueTodayCents;
  const currency = analyticsKey((order.currency ?? "").toUpperCase());
  return recordGoal(page, `purchase:${order.id}`, {
    [`modes.${mode}.purchases`]: FieldValue.increment(1),
    [`modes.${mode}.revenueCents`]: FieldValue.increment(cents),
    ...(currency ? { [`modes.${mode}.revenueByCurrency.${currency}`]: FieldValue.increment(cents) } : {}),
  });
}

/* --------------------------------- Reading -------------------------------- */

/** Bounded: at most this many pages per workspace report (most recently updated first). */
export const PAGE_ANALYTICS_PAGE_LIMIT = 250;

export async function listAnalyticsPages(subAccountId: string): Promise<{ pages: PageLite[]; truncated: boolean }> {
  const snap = await pagesCol().where("subAccountId", "==", subAccountId).get();
  const pages = snap.docs
    .map((d) => pageLite(d.id, d.data()))
    .filter((p): p is PageLite => !!p && p.subAccountId === subAccountId && p.pageType !== "reading_result")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { pages: pages.slice(0, PAGE_ANALYTICS_PAGE_LIMIT), truncated: pages.length > PAGE_ANALYTICS_PAGE_LIMIT };
}

/** Daily rollups for the given days (missing days simply absent). Workspace-checked. */
export async function pageDailyDocs(page: Pick<PageLite, "id" | "subAccountId">, days: string[]): Promise<RawPageDaily[]> {
  if (!days.length) return [];
  const snaps = await getAdminDb().getAll(...days.map((d) => dailyCol(page.id).doc(d)));
  return snaps.filter((s) => s.exists && s.get("subAccountId") === page.subAccountId).map((s) => ({ ...(s.data() as RawPageDaily), day: s.id }));
}

/** First UTC day this page has any tracked data (null = nothing yet). */
export async function pageTrackingSince(pageId: string, subAccountId: string): Promise<string | null> {
  const snap = await dailyCol(pageId).orderBy("day", "asc").limit(10).get();
  return (snap.docs.find((d) => d.get("subAccountId") === subAccountId)?.get("day") as string | undefined) ?? null;
}

export type { PageLite };
