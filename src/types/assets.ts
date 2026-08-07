import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Assets / Offer Bundles / Affiliate Links — the third Projects sub-tab.
 * Field-for-field from the real "New Asset" and "New Affiliate Link"
 * popups (screenshotted 2026-08-07), not the frozen claude.ai artifact —
 * that artifact turned out to predate this whole section. Dropdown OPTION
 * LISTS (type, access level, commission type/structure) are provisional
 * best-guesses from what's visible on the cards/filters until she sends
 * the real lists; the FIELD STRUCTURE itself is exact.
 *
 * The one CRM-specific addition, same pattern as Projects: a `linkedOfferId`
 * relation (alongside her real Project/Content/Goal links) so Revenue can
 * be computed from real Course Offer purchases instead of typed in — the
 * real popup's own Revenue tab is just an empty state ("becomes available
 * once income is logged"), confirming revenue was never meant to be a
 * manual field even in the original.
 */

export type AssetStatus = "idea" | "draft" | "active" | "needs update" | "archived";
export type AssetIncludedIn = "standard_membership" | "premium_membership" | "sold_standalone" | null;

export interface Asset {
  id: string;
  agencyId: string;
  subAccountId: string;
  // Basic
  name: string;
  type: string;
  description: string;
  status: AssetStatus;
  tags: string[];
  // Access
  accessLevel: string;
  includedIn: AssetIncludedIn;
  // Links
  directLink: string;
  communitySafeLink: string;
  landingPageLink: string;
  checkoutLink: string;
  // Relations
  linkedProjectId: string | null;
  linkedContentId: string | null;
  linkedGoalId: string | null;
  /** CRM-specific addition — not in the original popup. */
  linkedOfferId: string | null;
  internalNotes: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type AffiliateLinkStatus = "active" | "inactive" | "archived";

export interface AffiliateLink {
  id: string;
  agencyId: string;
  subAccountId: string;
  // Basic
  programName: string;
  companyName: string;
  description: string;
  category: string;
  status: AffiliateLinkStatus;
  // Links
  affiliateLink: string;
  publicLandingLink: string;
  loginDashboardLink: string;
  notes: string;
  // Commission
  commissionType: string;
  commissionAmount: number | null;
  payoutStructure: string;
  payoutPlatform: string;
  payoutThreshold: number | null;
  payoutFrequency: string;
  cookieWindow: string;
  paymentNotes: string;
  // Usage
  wherePromoted: string;
  bestFitAudience: string;
  promoNotes: string;
  contentIdeas: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * Groups Assets into what a customer actually receives — matches the real
 * empty-state copy ("Group your assets into offer bundles to see exactly
 * what customers receive"). The creation popup for this one hasn't been
 * screenshotted yet, so only the shape implied by that copy + her own
 * "auto-populate from real offers" idea is built so far — list/empty state
 * only, no creation dialog until that's confirmed.
 */
export interface OfferBundle {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  description: string;
  assetIds: string[];
  linkedOfferId: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

// Real dropdown option lists — confirmed against her actual "New Asset" /
// "New Affiliate Link" popups (screenshotted 2026-08-07). Access Level is
// still provisional (not screenshotted yet).
export const ASSET_TYPES = [
  "Tool",
  "Course",
  "Membership",
  "Lead Magnet",
  "Template",
  "Workflow",
  "Guide",
  "Sales Funnel",
  "Offer",
  "Content Asset",
  "Automation",
  "Resource",
  "Other",
] as const;
export const ASSET_STATUSES = ["idea", "draft", "active", "needs update", "archived"] as const;
export const ASSET_ACCESS_LEVELS = ["Public", "Premium Membership", "Standard Membership", "Private"] as const;
export const AFFILIATE_CATEGORIES = [
  "Software",
  "Course",
  "Service",
  "Tool",
  "Product",
  "Membership",
  "Other",
] as const;
export const AFFILIATE_COMMISSION_TYPES = ["Percentage", "Flat Fee", "Recurring", "Other"] as const;
export const AFFILIATE_PAYOUT_STRUCTURES = ["One-Time", "Recurring", "Ongoing", "Limited Months", "Custom"] as const;
