import type { MembershipLevel } from "@/types/community-membership";

export type EffectiveMembershipRecord = {
  memberId: string;
  status: string;
  levelIds: string[];
};

export type MembershipRosterIdentity = {
  memberId: string;
  name: string;
  email: string;
};

export type BaseRosterMember = MembershipRosterIdentity & {
  source: "base";
  grantId: null;
  grantedAtMs: null;
};

/**
 * Base Membership is the effective fallback, not an explicit grant.
 * Members with an active non-base level stay out of this roster.
 */
export function resolveEffectiveBaseRoster(
  memberships: readonly EffectiveMembershipRecord[],
  levels: readonly MembershipLevel[],
  identities: ReadonlyMap<string, MembershipRosterIdentity>,
): BaseRosterMember[] {
  const activeNonBaseIds = new Set(
    levels.filter((level) => level.status === "active" && !level.isBase).map((level) => level.id),
  );

  return memberships
    .filter((membership) => membership.status === "active")
    .filter((membership) => !membership.levelIds.some((levelId) => activeNonBaseIds.has(levelId)))
    .map((membership) => {
      const identity = identities.get(membership.memberId);
      return {
        memberId: membership.memberId,
        name: identity?.name ?? "",
        email: identity?.email ?? "",
        source: "base" as const,
        grantId: null,
        grantedAtMs: null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
