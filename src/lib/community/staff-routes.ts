import type { CommunityLinkBase } from "@/lib/community/routes";

/**
 * Staff Community-in-CRM route builders (2026-08-24). Thin wrapper around
 * `CommunityLinkBase.staffGroupId` (see routes.ts) for the handful of
 * places that need to build a staff link WITHOUT already having a full
 * `CommunityLinkBase` in hand (e.g. the CRM's own group list, which only
 * knows `subAccountId` + the group's real id — no slug, no `pretty`).
 * Every Community page/component that already receives a `linkBase` prop
 * should keep using the shared builders in routes.ts directly (passing
 * `staffGroupId`) rather than these — this file exists for the few
 * genuinely CRM-side, non-Community callers.
 */
export function staffCommunityLinkBase(subAccountId: string, groupId: string): CommunityLinkBase {
  return { saId: subAccountId, pretty: false, staffGroupId: groupId };
}

export function staffCommunityFeedHref(subAccountId: string, groupId: string): string {
  return `/sa/${subAccountId}/community/${groupId}`;
}

/** The pre-existing "legacy admin fields" form (About copy, media gallery,
 *  join policy, price, tiers, reviews) — not yet folded into the native
 *  Settings tabs, so it stays reachable at its own sub-path rather than
 *  being deleted or silently duplicated. See the Staff Community
 *  Integration report. */
export function staffCommunityManageHref(subAccountId: string, groupId: string): string {
  return `/sa/${subAccountId}/community/${groupId}/manage`;
}

/** The pre-existing member roster (approve pending joins / ban) — kept at
 *  its own path, separate from the new real Members directory at
 *  `/members-directory`, since it has real, currently-used moderation
 *  actions the new directory doesn't (yet) replicate. See the report. */
export function staffCommunityRosterHref(subAccountId: string, groupId: string): string {
  return `/sa/${subAccountId}/community/${groupId}/members`;
}
