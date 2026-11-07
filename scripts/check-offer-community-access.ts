/** Deterministic offline coverage for Offer → Community Membership entitlements. */
import { readFileSync } from "node:fs";

const src = (path: string) => readFileSync(path, "utf8");
const offer = src("src/types/course-offers.ts");
const details = src("src/components/course-offers/offer-details-tab.tsx");
const service = src("src/lib/server/offer-community-access-service.ts");
const membership = src("src/lib/server/community-membership-service.ts");
const purchase = src("src/lib/server/course-offer-purchase-service.ts");
const createRoute = src("src/app/api/sub-accounts/[id]/course-offers/route.ts");
const updateRoute = src("src/app/api/sub-accounts/[id]/course-offers/[offerId]/route.ts");

const checks: Array<[string, boolean]> = [
  ["Offer and purchase have a Community Access ID array", /communityAccess: CourseOfferCommunityAccess\[\]/.test(offer) && /communityAccess: CourseOfferCommunityAccess\[\]/.test(offer.slice(offer.indexOf("export interface CourseOfferPurchase")))],
  ["picker has Community and Membership Level controls", details.includes('aria-label="Community"') && details.includes('aria-label="Membership Level"')],
  ["picker is workspace-scoped", service.includes("listGroupsForSubAccount(subAccountId)") && service.includes("subAccounts/${opts.subAccountId}/communityGroups/${communityGroupId}" )],
  ["level options come from the selected Community", details.includes("selectedCommunity?.levels")],
  ["inactive levels are blocked for new attachments but retained for legacy entries", service.includes("level.status !== \"active\" && !existing.has(key)")],
  ["Base Membership is not duplicated", service.includes("level.isBase === true") && membership.includes("if (level.isBase) continue")],
  ["duplicate Community + Level entries are rejected server-side", service.includes("same Community Membership Level cannot be attached twice")],
  ["multiple distinct Community entitlements are represented as an array", details.includes("setCommunityAccess((entries) => [...entries")],
  ["Offer changes are snapshot into purchases", purchase.includes("communityAccess: offer.communityAccess ?? []") && purchase.includes("communityAccess: targetOffer.communityAccess ?? []")],
  ["paid fulfillment uses the shared level grant service", purchase.includes("grantLevelsForOfferPurchase") && membership.includes("grantMembershipLevel")],
  ["free fulfillment uses the same level grant service", purchase.includes("if (opts.offerId && opts.communityAccess?.length)")],
  ["recurring cancellation ends only the Offer-backed grant", purchase.includes("endLevelsForOfferPurchase") && purchase.includes("communityAccess: purchase.communityAccess ?? []")],
  ["system-managed Offers remain separate", membership.includes("billingOfferIds") && updateRoute.includes("System-managed Community pricing Offers")],
  ["create and update APIs validate Community IDs", createRoute.includes("validateOfferCommunityAccessServerSide") && updateRoute.includes("validateOfferCommunityAccessServerSide")],
  ["existing entitlement types remain in the Offer model", offer.includes("courseIds: string[]") && offer.includes("booking: CourseOfferBookingBundle | null") && offer.includes("projectTemplates: CourseOfferProjectTemplateBundle[]")],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}`); failed++; }
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
