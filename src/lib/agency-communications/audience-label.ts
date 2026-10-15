import type { AgencyAudienceSource } from "@/types/agency-communications";

/** The picker's option lists (GET /api/agency/communications/audience/options). */
export interface AgencyAudienceNames {
  plans: { id: string; name: string }[];
  communities: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  offers: { id: string; title: string }[];
}

/**
 * Human-readable summary of an Agency communication's audience sources —
 * the agency-scope sibling of the tenant `audienceLabel()` used by the
 * Broadcasts list + detail. Pure/client-safe. Names resolve from the
 * picker options when they're loaded; otherwise a generic label shows.
 */
export function agencyAudienceLabel(
  sources: AgencyAudienceSource[] | null | undefined,
  names?: AgencyAudienceNames | null,
): string {
  if (!sources || sources.length === 0) return "No audience";
  const find = <T extends { id: string }>(list: T[] | undefined, id?: string) =>
    id ? list?.find((x) => x.id === id) : undefined;
  return sources
    .map((s) => {
      switch (s.kind) {
        case "subAccountOwners":
          return "All sub-account owners";
        case "planCohort": {
          const ids = s.planIds ?? [];
          const plans = ids.map((id) => find(names?.plans, id)?.name).filter(Boolean);
          return plans.length === ids.length && plans.length > 0
            ? `Plan: ${plans.join(", ")}`
            : `${ids.length} plan${ids.length === 1 ? "" : "s"}`;
        }
        case "community":
          return `Community: ${find(names?.communities, s.groupId)?.name ?? "Agency Community"}`;
        case "course":
          return `Course: ${find(names?.courses, s.courseId)?.title ?? "Standalone Course"}`;
        case "courseOffer":
          return `Offer: ${find(names?.offers, s.offerId)?.title ?? "Course Offer"}`;
        default:
          return "Audience";
      }
    })
    .join(" · ");
}
