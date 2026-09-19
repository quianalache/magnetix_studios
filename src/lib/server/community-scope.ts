import "server-only";

/**
 * Community Shared Architecture — Phase 1 (2026-09-19).
 *
 * The one runtime scope discriminator every shared Community domain
 * function below this point takes instead of a raw `subAccountId: string`.
 * Mirrors the existing PERSISTED discriminator `CommunityGroupOwnerScope`
 * ("subAccount" | "agency", see types/community.ts's own doc comment) —
 * same two-way vocabulary, just carrying the actual id alongside the kind
 * so a shared function can build the right Firestore path without a
 * second lookup.
 *
 * This does NOT change where data lives: a tenant group's docs stay under
 * `subAccounts/{subAccountId}/communityGroups/...`; an agency group's docs
 * stay under `agencies/{agencyId}/communityGroups/...`. Shared-first means
 * shared LOGIC over these two roots, never one merged collection — see
 * the Shared-First Architecture Audit's section 10 ("Data / Identity /
 * Billing Boundaries").
 *
 * NEVER construct a "subAccount" scope for an agency-owned group (that
 * would be exactly the "fake subAccountId" the architecture audit's
 * section 11 forbids) — every caller already knows its own real scope
 * from its own auth/session resolution (`requireSubAccountAdmin` /
 * `resolveAgencyCommunityCaller`), and only ever needs to wrap it once,
 * right before calling a shared function.
 */
export type CommunityOwnerScope =
  | { kind: "subAccount"; subAccountId: string }
  | { kind: "agency"; agencyId: string };

export function tenantScope(subAccountId: string): CommunityOwnerScope {
  return { kind: "subAccount", subAccountId };
}

export function agencyScope(agencyId: string): CommunityOwnerScope {
  return { kind: "agency", agencyId };
}

/** The one place a scope turns into the Firestore path segment it owns —
 *  every shared collection/doc builder in the channel/section/notification
 *  layer goes through this instead of re-deriving the root itself. */
export function communityGroupsRoot(scope: CommunityOwnerScope): string {
  return scope.kind === "subAccount"
    ? `subAccounts/${scope.subAccountId}/communityGroups`
    : `agencies/${scope.agencyId}/communityGroups`;
}

/** The scope's own identity field, exactly as each side's pre-existing
 *  documents already denormalized it (`{subAccountId}` for tenant docs,
 *  `{agencyId}` for Agency docs) — used where a shared write function
 *  needs to preserve that field on a newly-created doc rather than
 *  silently dropping it (a real, if never-queried-on, persisted-data
 *  shape neither scope's existing docs should start diverging from). */
export function scopeIdentityFields(
  scope: CommunityOwnerScope
): { subAccountId: string } | { agencyId: string } {
  return scope.kind === "subAccount"
    ? { subAccountId: scope.subAccountId }
    : { agencyId: scope.agencyId };
}
