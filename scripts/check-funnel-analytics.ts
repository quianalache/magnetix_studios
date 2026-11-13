/** Funnel Analytics Foundation — isolated Firestore emulator check. */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const project = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Refusing to run outside an isolated demo Firestore emulator.");
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= project;
initializeApp({ projectId: project });

async function main() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const analytics = await import("../src/lib/server/funnel-analytics-service");
  const db = getAdminDb();
  const funnelId = "analytics-funnel";
  const agencyId = "agency-analytics";
  const subAccountId = "sa-analytics";
  await db.doc(`funnels/${funnelId}`).set({ id: funnelId, agencyId, subAccountId, status: "published", name: "Analytics QA" });

  const base = { agencyId, subAccountId, funnelId, stepId: "step-checkout", verified: false, idempotencyKey: "qa-entry", paymentMode: "unknown" as const, anonymousUniqueKey: "visitor-a:entry" };
  assert.equal(await analytics.recordFunnelAnalyticsEvent({ ...base, type: "funnel_entry" }), true);
  assert.equal(await analytics.recordFunnelAnalyticsEvent({ ...base, type: "funnel_entry" }), false);
  await analytics.recordFunnelAnalyticsEvent({ ...base, type: "checkout_completed", idempotencyKey: "qa-live", paymentMode: "live", verified: true, orderId: "order-live", amountCents: 1200, currency: "usd", anonymousUniqueKey: null });
  await analytics.recordFunnelAnalyticsEvent({ ...base, type: "checkout_completed", idempotencyKey: "qa-test", paymentMode: "test", verified: true, orderId: "order-test", amountCents: 9900, currency: "usd", anonymousUniqueKey: null });

  const [day] = await analytics.getFunnelAnalyticsDaily({ subAccountId, funnelId, from: analytics.analyticsDay(), to: analytics.analyticsDay() });
  assert.equal(day.modes?.unknown?.events?.funnel_entry, 1);
  assert.equal(day.modes?.live?.revenue?.initialPurchaseCents, 1200);
  assert.equal(day.modes?.test?.revenue?.initialPurchaseCents, 9900);
  await assert.rejects(() => analytics.getFunnelAnalyticsDaily({ subAccountId: "other-tenant", funnelId, from: analytics.analyticsDay(), to: analytics.analyticsDay() }));
  console.log("Funnel analytics checks passed");
}

void main();
