import "server-only";

import type { MediaAsset } from "@/types/media-asset";

/**
 * Facts asserted by an upstream server-side authentication/access check.
 * This deliberately has no client-derived booleans or URL-based shortcut.
 */
export interface VerifiedMediaViewer {
  kind: "anonymous" | "person" | "system";
  agencyId?: string;
  subAccountId?: string;
  personId?: string;
  communityGroupIds?: readonly string[];
  courseIds?: readonly string[];
  webinarIds?: readonly string[];
  liveSessionIds?: readonly string[];
}

export type MediaAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "deleted" | "tenant_mismatch" | "not_authorized";
    };

/** Pure policy decision; routes must construct the viewer from verified sessions. */
export function resolveMediaAssetAccess(
  asset: MediaAsset,
  viewer: VerifiedMediaViewer
): MediaAccessDecision {
  if (asset.status === "deleted" || asset.deletedAt)
    return { allowed: false, reason: "deleted" };
  if (
    viewer.kind !== "system" &&
    (viewer.agencyId !== asset.agencyId ||
      viewer.subAccountId !== asset.subAccountId)
  ) {
    return { allowed: false, reason: "tenant_mismatch" };
  }
  if (viewer.kind === "system" || asset.access.type === "public")
    return { allowed: true };
  switch (asset.access.type) {
    case "tenant":
      return viewer.kind === "person"
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
    case "owner":
      return viewer.personId === asset.uploadedByPersonId
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
    case "community_group":
      return viewer.communityGroupIds?.includes(asset.access.groupId)
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
    case "course":
      return viewer.courseIds?.includes(asset.access.courseId)
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
    case "webinar":
      return viewer.webinarIds?.includes(asset.access.webinarId)
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
    case "live_session":
      return viewer.liveSessionIds?.includes(asset.access.liveSessionId)
        ? { allowed: true }
        : { allowed: false, reason: "not_authorized" };
  }
}
