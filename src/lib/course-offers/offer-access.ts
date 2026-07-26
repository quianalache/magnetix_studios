import "server-only";

import {
  getStandaloneCoursesGate,
  type StandaloneCoursesGate,
} from "@/lib/standalone-courses/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import type { Member } from "@/types/community";
import type { CourseOffer } from "@/types/course-offers";

/**
 * Resolve access to a Course Offer's public surfaces, mirroring
 * `src/lib/standalone-courses/course-access.ts`. An offer's own public page
 * is viewable without a session; a session is only required to purchase.
 */
export interface OfferPageAccessOk {
  kind: "ok";
  gate: StandaloneCoursesGate;
  offer: CourseOffer;
  member: Member | null;
}

export type OfferPageAccess = OfferPageAccessOk | { kind: "notFound" };

export async function requireOfferPageAccess(
  saId: string,
  offerId: string,
): Promise<OfferPageAccess> {
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) return { kind: "notFound" };

  const offer = await getCourseOffer(saId, offerId);
  if (!offer || offer.visibility !== "published") return { kind: "notFound" };

  const member = await getCurrentMember(saId);
  return { kind: "ok", gate, offer, member };
}

/** API-route variant — structured errors, requires an existing session. */
export type OfferApiAccess =
  | { kind: "ok"; gate: StandaloneCoursesGate; offer: CourseOffer; member: Member }
  | { kind: "error"; status: number; message: string };

export async function requireOfferApiAccess(
  saId: string,
  offerId: string,
): Promise<OfferApiAccess> {
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const offer = await getCourseOffer(saId, offerId);
  if (!offer || offer.visibility !== "published") {
    return { kind: "error", status: 404, message: "Offer not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  return { kind: "ok", gate, offer, member };
}
