import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { listGroupsForSubAccount } from "@/lib/server/community-service";
import { listMembershipLevels } from "@/lib/server/community-membership-service";
import type { CommunityGroup } from "@/types/community";
import type { MembershipLevel } from "@/types/community-membership";
import type { CourseOfferCommunityAccess } from "@/types/course-offers";

export interface OfferCommunityOption {
  id: string;
  name: string;
  status: string;
  ownerScope?: string;
  levels: Array<Pick<MembershipLevel, "id" | "name" | "status" | "publicVisibility" | "isBase">>;
}

export async function listOfferCommunityOptionsServerSide(
  subAccountId: string,
): Promise<OfferCommunityOption[]> {
  const groups = (await listGroupsForSubAccount(subAccountId)).filter(
    (group) => group.ownerScope !== "agency",
  );
  return Promise.all(
    groups.map(async (group: CommunityGroup) => {
      const levels = await listMembershipLevels(subAccountId, group.id);
      return {
        id: group.id,
        name: group.name,
        status: group.status,
        ownerScope: group.ownerScope,
        levels: levels.map((level) => ({
          id: level.id,
          name: level.name,
          status: level.status,
          publicVisibility: level.publicVisibility,
          isBase: level.isBase,
        })),
      };
    }),
  );
}

/** Validate IDs at the staff API boundary; never trust names or client-provided snapshots. */
export async function validateOfferCommunityAccessServerSide(opts: {
  subAccountId: string;
  entries: unknown;
  existing?: CourseOfferCommunityAccess[];
}): Promise<CourseOfferCommunityAccess[]> {
  if (opts.entries === undefined) return opts.existing ?? [];
  if (!Array.isArray(opts.entries)) throw new Error("Community Access must be an array.");

  const existing = new Set(
    (opts.existing ?? []).map((entry) => `${entry.communityGroupId}:${entry.membershipLevelId}`),
  );
  const seen = new Set<string>();
  const result: CourseOfferCommunityAccess[] = [];
  const db = getAdminDb();

  for (const raw of opts.entries) {
    const communityGroupId = typeof raw?.communityGroupId === "string" ? raw.communityGroupId.trim() : "";
    const membershipLevelId = typeof raw?.membershipLevelId === "string" ? raw.membershipLevelId.trim() : "";
    if (!communityGroupId || !membershipLevelId) throw new Error("Each Community Access entry needs a Community and Membership Level.");
    const key = `${communityGroupId}:${membershipLevelId}`;
    if (seen.has(key)) throw new Error("The same Community Membership Level cannot be attached twice.");
    seen.add(key);

    const groupRef = db.doc(`subAccounts/${opts.subAccountId}/communityGroups/${communityGroupId}`);
    const levelRef = db.doc(`${groupRef.path}/membershipLevels/${membershipLevelId}`);
    const [groupSnap, levelSnap] = await Promise.all([groupRef.get(), levelRef.get()]);
    if (!groupSnap.exists || groupSnap.data()?.ownerScope === "agency") throw new Error("That Community is not available in this workspace.");
    if (!levelSnap.exists) throw new Error("That Membership Level was not found in the selected Community.");
    const level = levelSnap.data()!;
    if (level.isBase === true) throw new Error("Base Membership is automatic and cannot be added as a duplicate Offer entitlement.");
    if (level.status !== "active" && !existing.has(key)) throw new Error("Inactive Membership Levels cannot be newly attached to an Offer.");
    result.push({ communityGroupId, membershipLevelId });
  }
  return result;
}
