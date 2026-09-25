import type { StandaloneEnrollment } from "@/types/standalone-courses";

/**
 * True when an enrollment carries an ACTIVE complimentary grant (Contacts
 * redesign — staff granted the course from a Contact profile, no payment).
 * The one place the grant is interpreted, so every guard reads it the same
 * way.
 */
export function hasActiveComplimentaryAccess(
  enrollment: Pick<StandaloneEnrollment, "complimentaryAccess"> | null | undefined,
): boolean {
  return enrollment?.complimentaryAccess?.status === "active";
}
