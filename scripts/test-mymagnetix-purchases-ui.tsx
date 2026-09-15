/**
 * Populated-state + empty-state UI test for the refined Purchases page
 * (approved mockup, 2026-09-16). Renders the REAL, pure presentational
 * `PurchasesView` component directly with FIXTURE data via
 * `renderToStaticMarkup` — no Firestore, no session/auth of any kind, no
 * network — exactly the same technique already established in
 * scripts/test-mymagnetix-login-ux.tsx for this reason: the real owner QA
 * account currently has zero linked subscriptions/payments in production
 * (confirmed in a prior task), so the POPULATED layout can only be
 * verified this way without fabricating production records, which this
 * task explicitly forbids.
 *
 * Covers, structurally (a static HTML string can't measure real pixel
 * layout, so what's provable here is the CSS Grid CONTRACT that makes the
 * visual wrap behavior in the report true: exactly one flat grid
 * container, the required responsive column classes, and every fixture
 * card present as a direct child — no manual row-chunking markup, which
 * is the one implementation choice that would actually break natural
 * wrapping):
 *   - 3 subscriptions -> one grid container, lg:grid-cols-3, exactly 3 cards
 *   - 4 subscriptions -> the SAME grid container/classes, exactly 4 cards
 *     (proving nothing hides the 4th behind a carousel/"view more" — the
 *     4th simply flows into a natural second CSS row under 3-column grid)
 *   - Payment history: 24 rows -> exactly 10 rendered + "Showing 1-10 of
 *     24" + Previous/1/2/3/Next controls present
 *   - Payment history: 4 rows -> all 4 rendered, pagination controls
 *     entirely absent
 *   - Empty states: compact per-section wording, no single top-level
 *     "No purchases yet" panel
 *   - Error states unchanged
 *   - Manage subscription only rendered when canManage is true; View
 *     details always rendered
 *   - Receipt link only rendered when a real receipt/invoice URL exists
 *
 * Run: pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/test-mymagnetix-purchases-ui.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PurchasesView } from "../src/components/mymagnetix/purchases-view";
import type {
  PersonPaymentHistoryItem,
  PersonSubscriptionPurchase,
} from "../src/lib/server/mymagnetix-service";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

function fixtureSubscription(
  overrides: Partial<PersonSubscriptionPurchase> & { id: string }
): PersonSubscriptionPurchase {
  return {
    subAccountId: "sa-fixture",
    businessName: "Quiana's Coaching",
    provider: "stripe",
    productName: "Creator Pro",
    priceName: "Monthly",
    amountCents: 2900,
    currency: "usd",
    interval: "month",
    intervalCount: 1,
    status: "active",
    currentPeriodStart: new Date("2025-03-12"),
    currentPeriodEnd: new Date("2025-04-12"),
    cancelAtPeriodEnd: false,
    canManage: true,
    ...overrides,
  };
}

function fixturePayment(
  overrides: Partial<PersonPaymentHistoryItem> & { id: string }
): PersonPaymentHistoryItem {
  return {
    subAccountId: "sa-fixture",
    businessName: "Quiana's Coaching",
    productName: "Creator Pro (Monthly)",
    description: null,
    paymentType: "subscription",
    status: "succeeded",
    amountCents: 2900,
    amountRefundedCents: 0,
    netAmountCents: 2900,
    currency: "usd",
    occurredAt: new Date("2025-03-12"),
    paidAt: new Date("2025-03-12"),
    failedAt: null,
    refundedAt: null,
    receiptUrl: "https://pay.stripe.com/receipts/fixture",
    invoiceHostedUrl: null,
    invoicePdfUrl: null,
    failureMessage: null,
    ...overrides,
  };
}

function render(props: {
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
  subscriptionError?: boolean;
  paymentHistoryError?: boolean;
}) {
  return renderToStaticMarkup(
    createElement(PurchasesView, {
      subscriptions: props.subscriptions,
      paymentHistory: props.paymentHistory,
      subscriptionError: props.subscriptionError ?? false,
      paymentHistoryError: props.paymentHistoryError ?? false,
    })
  );
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function main() {
  console.log("=== Header ===");
  const empty = render({ subscriptions: [], paymentHistory: [] });
  check("Title 'Purchases' present", empty.includes(">Purchases<"));
  check(
    "Subtitle matches the approved copy",
    empty.includes(
      "View your active subscriptions and purchases across your Magnetix\n          businesses."
    ) ||
      empty.includes(
        "View your active subscriptions and purchases across your Magnetix"
      )
  );

  console.log(
    "\n=== 3 subscriptions -> one grid row (3-column desktop contract) ==="
  );
  const three = [1, 2, 3].map((n) =>
    fixtureSubscription({ id: `sub-${n}`, productName: `Plan ${n}` })
  );
  const threeHtml = render({ subscriptions: three, paymentHistory: [] });
  check(
    "Exactly one grid container (no manual row-chunking wrapper)",
    countOccurrences(threeHtml, "lg:grid-cols-3") === 1
  );
  check(
    "Grid has the required responsive column classes (1 / 2 / 3)",
    threeHtml.includes("grid-cols-1") &&
      threeHtml.includes("md:grid-cols-2") &&
      threeHtml.includes("lg:grid-cols-3")
  );
  check(
    "All 3 fixture cards present as direct children of that one grid",
    countOccurrences(threeHtml, "Plan 1") === 1 &&
      countOccurrences(threeHtml, "Plan 2") === 1 &&
      countOccurrences(threeHtml, "Plan 3") === 1
  );

  console.log(
    "\n=== 4 subscriptions -> SAME grid, no carousel/'view more' hiding the 4th ==="
  );
  const four = [1, 2, 3, 4].map((n) =>
    fixtureSubscription({ id: `sub-${n}`, productName: `Plan ${n}` })
  );
  const fourHtml = render({ subscriptions: four, paymentHistory: [] });
  check(
    "Still exactly one grid container (same contract as the 3-card case)",
    countOccurrences(fourHtml, "lg:grid-cols-3") === 1
  );
  check(
    "All 4 cards present, none hidden behind a 'View more' control",
    countOccurrences(fourHtml, "Plan 1") === 1 &&
      countOccurrences(fourHtml, "Plan 4") === 1 &&
      !fourHtml.includes("View more")
  );

  console.log("\n=== Subscription card fields + conditional actions ===");
  const manageable = fixtureSubscription({
    id: "sub-manage",
    status: "trialing",
    canManage: true,
  });
  const notManageable = fixtureSubscription({
    id: "sub-nomanage",
    status: "past_due",
    canManage: false,
  });
  const cardHtml = render({
    subscriptions: [manageable, notManageable],
    paymentHistory: [],
  });
  check(
    "Status badge shows 'Trialing' (not 'Trial')",
    cardHtml.includes("Trialing")
  );
  check(
    "Status badge shows 'Payment issue' for past_due",
    cardHtml.includes("Payment issue")
  );
  check(
    "'Next charge:' wording present for an active/trialing subscription",
    cardHtml.includes("Next charge:")
  );
  check(
    "'Manage subscription' renders only for the manageable one",
    countOccurrences(cardHtml, "Manage subscription") === 1
  );
  check(
    "'View details' renders for BOTH cards (always available)",
    countOccurrences(cardHtml, "View details") === 2
  );
  check(
    "No internal subAccountId/subscription id leaked into visible text",
    !cardHtml.includes("sa-fixture")
  );

  console.log(
    "\n=== Payment history: 24 rows -> paginates to 10 + real controls ==="
  );
  const many = Array.from({ length: 24 }, (_, i) =>
    fixturePayment({
      id: `pay-${i}`,
      occurredAt: new Date(2025, 2, 12 - i),
      paidAt: new Date(2025, 2, 12 - i),
    })
  );
  const manyHtml = render({ subscriptions: [], paymentHistory: many });
  check(
    // Bare `<tr>` (no attributes) only ever comes from a tbody row — the
    // header row always renders `<tr class="...">`, so this count can't
    // accidentally include it.
    "Exactly 10 payment rows rendered on the first page",
    countOccurrences(manyHtml, "<tr>") === 10
  );
  check(
    "'Showing 1' + '24' pagination summary present",
    manyHtml.includes("Showing") && manyHtml.includes("24")
  );
  check("Previous control present", manyHtml.includes(">Previous<"));
  check("Next control present", manyHtml.includes(">Next<"));
  check(
    "Exactly 3 page-number buttons (1, 2, 3) for 24 rows at 10/page",
    /<button[^>]*>1<\/button>/.test(manyHtml) &&
      /<button[^>]*>2<\/button>/.test(manyHtml) &&
      /<button[^>]*>3<\/button>/.test(manyHtml)
  );

  console.log(
    "\n=== Payment history: <= 10 rows -> pagination controls absent ==="
  );
  const few = Array.from({ length: 4 }, (_, i) =>
    fixturePayment({ id: `pay-few-${i}` })
  );
  const fewHtml = render({ subscriptions: [], paymentHistory: few });
  check(
    "All 4 rows rendered",
    countOccurrences(fewHtml, "Creator Pro (Monthly)") === 4
  );
  check(
    "'Showing' pagination summary is NOT rendered for <= 10 rows",
    !fewHtml.includes("Showing")
  );
  check(
    "Previous/Next controls NOT rendered for <= 10 rows",
    !fewHtml.includes(">Previous<") && !fewHtml.includes(">Next<")
  );

  console.log("\n=== Payment row: receipt link + View action ===");
  const withReceipt = fixturePayment({
    id: "pay-receipt",
    receiptUrl: "https://pay.stripe.com/r/abc",
  });
  const withoutReceipt = fixturePayment({
    id: "pay-noreceipt",
    receiptUrl: null,
    invoiceHostedUrl: null,
    invoicePdfUrl: null,
  });
  const receiptHtml = render({
    subscriptions: [],
    paymentHistory: [withReceipt, withoutReceipt],
  });
  check(
    "'Download receipt' link renders when a receipt URL exists",
    countOccurrences(receiptHtml, "Download receipt") === 1
  );
  check(
    "A subtle 'View' action renders beside each Purchase",
    countOccurrences(receiptHtml, ">View<") === 2
  );

  console.log("\n=== Empty states (compact, per-section, per this task) ===");
  const emptyHtml = render({ subscriptions: [], paymentHistory: [] });
  check(
    "'No active subscriptions.' shown under Current subscriptions",
    emptyHtml.includes("No active subscriptions.")
  );
  check(
    "'No payment history yet.' shown under Payment history",
    emptyHtml.includes("No payment history yet.")
  );
  check(
    "The old single blended 'No purchases yet' panel is gone",
    !emptyHtml.includes("No purchases yet")
  );

  console.log("\n=== Error states unchanged ===");
  const errorHtml = render({
    subscriptions: [],
    paymentHistory: [],
    subscriptionError: true,
    paymentHistoryError: true,
  });
  check(
    "Subscription error message shown",
    errorHtml.includes("Purchases are temporarily unavailable")
  );
  check(
    "Payment history error message shown",
    errorHtml.includes("Payment history is temporarily unavailable")
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
