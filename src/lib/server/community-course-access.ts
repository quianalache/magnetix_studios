import "server-only";

import { allows } from "@/lib/community/membership-access";
import { resolveMemberAccessServerSide } from "@/lib/server/community-membership-service";
import { hasPaidCourse } from "@/lib/server/community-purchase-service";

/**
 * Membership-level gate for a NATIVE community course (2026-11-05). The
 * course's own rules (points level, paid purchase) still apply on top; this
 * only answers "is this course part of what the member's Membership Level(s)
 * include?". A paid purchase of the course itself also counts — a member is
 * allowed if ANY valid source grants it.
 */
export async function nativeCourseIncludedForMember(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  memberId: string;
  isModerator: boolean;
}): Promise<boolean> {
  const access = await resolveMemberAccessServerSide(opts);
  if (allows(access.courses, opts.courseId)) return true;
  return hasPaidCourse(opts.subAccountId, opts.groupId, opts.courseId, opts.memberId);
}
