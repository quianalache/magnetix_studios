/**
 * Billing ledger — several charge attempts on ONE payment (2026-11-13).
 *
 * Found by the real Stripe test-mode run of the post-purchase funnel: a
 * declined card replaced by another card in the inline recovery form puts two
 * charges on the same PaymentIntent (failed, then succeeded). The ledger used
 * to refuse the second charge id ("Cannot reassign established external
 * payment externalChargeId"), so the payment_intent.succeeded webhook failed
 * (500), the collected payment stayed "failed" and Payment Succeeded never ran.
 *
 * Calls the REAL `upsertExternalPayment` against the Firestore EMULATOR only.
 * No Stripe call, no network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8086},"ui":{"enabled":false}}}' > /tmp/emu-ledger/firebase.json
 *   firebase emulators:exec --config /tmp/emu-ledger/firebase.json --only firestore --project demo-ledger-attempts \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-external-payment-attempts.ts"
 */
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
initializeApp({ projectId: PROJECT });

let pass = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail: unknown = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label} ${detail === "" ? "" : JSON.stringify(detail)}`);
  }
}

async function main() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { upsertExternalPayment } = await import("../src/lib/server/external-payment-service");
  const db = getAdminDb();
  const AG = "ag_ledger", SA = "sa_ledger", ACCT = "acct_ledger";
  await db.doc(`agencies/${AG}`).set({ name: "Ledger QA" });
  await db.doc(`subAccounts/${SA}`).set({ name: "Ledger QA", agencyId: AG });
  await db.doc("contacts/c_ledger").set({ subAccountId: SA, agencyId: AG, name: "Buyer" });

  const base = {
    agencyId: AG, subAccountId: SA, provider: "stripe" as const, providerAccountId: ACCT, contactId: "c_ledger", memberId: null, personId: null,
    externalCustomerId: null, externalSubscriptionId: null, externalInvoiceId: null, externalBillingCustomerId: null, externalSubscriptionRecordId: null,
    productName: "VIP", description: null, amountCents: 9700, amountRefundedCents: 0, currency: "usd", paymentType: "one_time" as const,
    paidAt: null, failedAt: null, refundedAt: null, receiptUrl: null, invoiceHostedUrl: null, invoicePdfUrl: null, failureCode: null, failureMessage: null,
    source: "webhook" as const, metadata: {},
  };
  const attempt = (pi: string, charge: string | null, status: "failed" | "succeeded", at: number, extra: Record<string, unknown> = {}) =>
    upsertExternalPayment({ ...base, externalPaymentId: pi, externalPaymentIntentId: pi, externalChargeId: charge, status, providerStatus: status === "succeeded" ? "succeeded" : "requires_payment_method", occurredAt: new Date(at * 1000), lastProviderEventCreatedAt: at, ...extra } as never);
  const read = async (pi: string) => (await db.collection("externalPayments").where("externalPaymentIntentId", "==", pi).get()).docs.map((d) => d.data());

  console.log("Declined attempt, then a successful attempt on the same PaymentIntent");
  await attempt("pi_a", "ch_failed", "failed", 1000);
  let threw: unknown = null;
  try { await attempt("pi_a", "ch_ok", "succeeded", 1010); } catch (err) { threw = err; }
  check("the successful charge is accepted (no 'Cannot reassign' error)", threw === null, threw instanceof Error ? threw.message : threw);
  let rows = await read("pi_a");
  check("one ledger record, succeeded, on the successful charge", rows.length === 1 && rows[0].status === "succeeded" && rows[0].externalChargeId === "ch_ok", rows.map((r) => [r.status, r.externalChargeId]));

  console.log("Stale failure delivered after the success");
  threw = null;
  try { await attempt("pi_a", "ch_failed", "failed", 1000); } catch (err) { threw = err; }
  rows = await read("pi_a");
  check("stale failure doesn't throw and changes nothing", threw === null && rows[0].status === "succeeded" && rows[0].externalChargeId === "ch_ok", [threw instanceof Error ? threw.message : threw, rows[0].status, rows[0].externalChargeId]);

  console.log("A succeeded charge is never replaced");
  await attempt("pi_b", "ch_b_ok", "succeeded", 2000);
  await attempt("pi_b", "ch_b_other", "succeeded", 2010).catch(() => undefined);
  rows = await read("pi_b");
  check("succeeded record keeps its charge", rows[0].externalChargeId === "ch_b_ok", rows[0].externalChargeId);
  await attempt("pi_b", null, "succeeded", 2020).catch(() => undefined);
  rows = await read("pi_b");
  check("an event without a charge id keeps the known charge", rows[0].externalChargeId === "ch_b_ok", rows[0].externalChargeId);

  console.log("Real relationships stay immutable");
  await attempt("pi_c", "ch_c", "succeeded", 3000, { externalCustomerId: "cus_c" });
  threw = null;
  try { await attempt("pi_c", "ch_c", "succeeded", 3010, { externalCustomerId: "cus_other" }); } catch (err) { threw = err; }
  check("changing the customer of a payment is still refused", threw instanceof Error && /Cannot reassign established external payment externalCustomerId/.test(threw.message), threw instanceof Error ? threw.message : threw);

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
