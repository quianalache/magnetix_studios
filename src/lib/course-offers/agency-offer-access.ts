import "server-only";

import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson, type CurrentPerson } from "@/lib/server/person-session";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import type { CourseOffer } from "@/types/course-offers";

/**
 * Resolve access to an Agency Course Offer's public surfaces — the agency
 * sibling of course-offers/offer-access.ts, using the global Person/
 * MyMagnetix identity instead of a tenant Member session (same reasoning
 * as agency-course-access.ts).
 */
export interface AgencyOfferPageAccessOk {
  kind: "ok";
  agencyId: string;
  offer: CourseOffer;
  person: CurrentPerson | null;
}
export type AgencyOfferPageAccess = AgencyOfferPageAccessOk | { kind: "notFound" };

export async function requireAgencyOfferPageAccess(offerId: string): Promise<AgencyOfferPageAccess> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { kind: "notFound" };
  const offer = await getAgencyCourseOffer(agencyId, offerId);
  if (!offer || offer.visibility !== "published") return { kind: "notFound" };
  const person = await getCurrentPerson();
  return { kind: "ok", agencyId, offer, person };
}

export type AgencyOfferApiAccess =
  | { kind: "ok"; agencyId: string; offer: CourseOffer; person: CurrentPerson }
  | { kind: "error"; status: number; message: string };

export async function requireAgencyOfferApiAccess(offerId: string): Promise<AgencyOfferApiAccess> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { kind: "error", status: 404, message: "Not found" };
  const offer = await getAgencyCourseOffer(agencyId, offerId);
  if (!offer || offer.visibility !== "published") {
    return { kind: "error", status: 404, message: "Offer not found" };
  }
  const person = await getCurrentPerson();
  if (!person) return { kind: "error", status: 401, message: "Sign in first" };
  return { kind: "ok", agencyId, offer, person };
}
