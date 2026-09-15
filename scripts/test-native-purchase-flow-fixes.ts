/**
 * Structural regression tests for the parts of this task not covered by
 * scripts/test-native-purchase-billing-sync.ts's functional Stripe-fixture
 * test: the new webhook event routing, the Offer modal scroll fix, the
 * post-checkout destination fix, and the checkout identity-form fix.
 * Reads the actual source files and asserts on real code, the same
 * technique already established in this codebase (see
 * scripts/test-purchases-billing-portal-origin.ts).
 *
 * Run: pnpm exec tsx scripts/test-native-purchase-flow-fixes.ts
 */
import { readFileSync } from "node:fs";

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

function main() {
  console.log("=== Stripe webhook route: new event types wired ===");
  const routeSrc = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
  check(
    "invoice.paid routed to syncExternalStripeInvoicePayment (succeeded)",
    /case "invoice\.paid":[\s\S]{0,200}syncExternalStripeInvoicePayment[\s\S]{0,250}outcome: "succeeded"/.test(
      routeSrc
    )
  );
  check(
    "invoice.payment_failed routed to syncExternalStripeInvoicePayment (failed)",
    /case "invoice\.payment_failed":[\s\S]{0,200}syncExternalStripeInvoicePayment[\s\S]{0,250}outcome: "failed"/.test(
      routeSrc
    )
  );
  check(
    "payment_intent.succeeded routed to syncExternalStripePaymentIntent (succeeded)",
    /case "payment_intent\.succeeded":[\s\S]{0,200}syncExternalStripePaymentIntent[\s\S]{0,250}outcome: "succeeded"/.test(
      routeSrc
    )
  );
  check(
    "payment_intent.payment_failed routed to syncExternalStripePaymentIntent (failed) — no longer a bare no-op",
    /case "payment_intent\.payment_failed":[\s\S]{0,200}syncExternalStripePaymentIntent[\s\S]{0,250}outcome: "failed"/.test(
      routeSrc
    )
  );
  check(
    "charge.refunded routed to syncExternalStripeChargeRefund",
    /case "charge\.refunded":[\s\S]{0,200}syncExternalStripeChargeRefund/.test(
      routeSrc
    )
  );
  check(
    "Every new case passes event.account through as eventAccountId (Connect-aware)",
    (routeSrc.match(/eventAccountId: event\.account \?\? null/g) ?? [])
      .length >= 5
  );

  console.log(
    "\n=== customer.subscription.updated: Course Offer branch wired ==="
  );
  const webhooksSrc = readFileSync("src/lib/stripe/webhooks.ts", "utf8");
  check(
    "handleSubscriptionUpdated now branches on OFFER_CHARGE_KIND before the legacy users/{uid} lookup",
    /OFFER_CHARGE_KIND[\s\S]{0,100}syncCourseOfferSubscriptionStatusServerSide/.test(
      webhooksSrc
    )
  );

  console.log(
    "\n=== grantCourseOfferAccessServerSide: ledger sync wired on both the primary and retry paths ==="
  );
  const offerServiceSrc = readFileSync(
    "src/lib/server/course-offer-purchase-service.ts",
    "utf8"
  );
  check(
    "syncCourseOfferPurchaseLedger is called at least twice (primary grant path + already-paid retry path)",
    (offerServiceSrc.match(/void syncCourseOfferPurchaseLedger\(/g) ?? [])
      .length === 2
  );
  check(
    "handleCourseOfferSubscriptionDeleted syncs the canceled status into the ledger too",
    /handleCourseOfferSubscriptionDeleted[\s\S]{0,2000}syncNativeSubscriptionStatusServerSide/.test(
      offerServiceSrc
    )
  );
  check(
    "Checkout now reuses/creates a real Stripe Customer (name+email) instead of customer_email alone",
    offerServiceSrc.includes("stripe.customers.list(") &&
      offerServiceSrc.includes("stripe.customers.create(") &&
      !offerServiceSrc.includes("customer_email: opts.memberEmail")
  );
  check(
    "Both checkout modes (subscription and payment) pass the real customer, not customer_creation",
    (offerServiceSrc.match(/customer: customerId,/g) ?? []).length === 2 &&
      !offerServiceSrc.includes('customer_creation: "always"')
  );

  console.log("\n=== signup route: real name/phone threaded to checkout ===");
  const signupSrc = readFileSync(
    "src/app/api/offer/[saId]/[offerId]/signup/route.ts",
    "utf8"
  );
  check(
    "memberName is passed from the real Member record",
    /memberName: member\.displayName \|\| name/.test(signupSrc)
  );

  console.log("\n=== Offer modal: viewport-safe scroll ===");
  const modalSrc = readFileSync(
    "src/components/course-offers/create-offer-modal.tsx",
    "utf8"
  );
  check(
    "DialogContent has a max-height + vertical scroll (the same convention every other long dialog in this codebase already uses)",
    /<DialogContent className="[^"]*max-h-\[90vh\][^"]*overflow-y-auto[^"]*"/.test(
      modalSrc
    )
  );

  console.log(
    "\n=== Post-checkout destination: bridges to the Space, no re-login, no router.push on a redirecting route ==="
  );
  const purchaseCompleteSrc = readFileSync(
    "src/app/offer/[saId]/[offerId]/purchase-complete/purchase-complete-status.tsx",
    "utf8"
  );
  check(
    "continueUrl routes through the existing Member->MyMagnetix bridge",
    purchaseCompleteSrc.includes("/api/my/bridge-from-member?next=")
  );
  check(
    "Destination is the Space (/portal/{saId}), not a bare classroom jump",
    /encodeURIComponent\(`\/portal\/\$\{saId\}`\)/.test(purchaseCompleteSrc)
  );
  check(
    "Navigation to continueUrl uses a real browser navigation (window.location.href), not router.push — this route sets a cookie and redirects, which client-side routing can't reliably do (all 3 call sites: poll success, upsell accept, upsell decline)",
    (purchaseCompleteSrc.match(/window\.location\.href = continueUrl/g) ?? [])
      .length === 3
  );
  check(
    "router.push is no longer used for continueUrl anywhere in this file",
    !/router\.push\(continueUrl\)/.test(purchaseCompleteSrc)
  );
  check(
    "The unrelated upsell-decline path (router.push to a different offer page) is untouched",
    purchaseCompleteSrc.includes(
      "router.push(`/offer/${saId}/${upsell.targetOfferId}`)"
    )
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
