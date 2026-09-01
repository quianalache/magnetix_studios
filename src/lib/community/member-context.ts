import "server-only";

import { getCommunityGate, type CommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityAboutHref, communityLoginHref } from "@/lib/community/routes";
import {
  getGroupById,
  getGroupBySlug,
  getMembership,
} from "@/lib/server/community-service";
import type {
  CommunityGroup,
  GroupMembership,
  Member,
} from "@/types/community";

/**
 * Staff Community-in-CRM entry point access check (2026-08-24) — used ONLY
 * by the `/sa/[subAccountId]/community/[groupId]/...` staff route tree,
 * never by member-facing pages. Group is resolved by its real id (staff
 * routes are id-keyed, matching every other CRM route's convention), then
 * delegates to the SAME `requireGroupPageAccess` a member page would use —
 * this is deliberately the one and only access-check function every
 * Community page/component reads `member`/`membership` from, staff or not.
 * The only real difference: an unauthenticated/not-yet-joined redirect
 * target is the staff same-origin session bridge (`ensure-session`, a
 * sibling of the existing Staff -> Member `/enter` route that never does
 * that route's cross-domain custom-domain handoff), never the member
 * login page — a staff visitor here is already a fully authenticated CRM
 * user who should never see a Community login screen. `currentPath` is
 * the calling page's own literal path (it already knows this — Next.js
 * Server Components have no ambient "current URL" API), used as the
 * bounce-back target once the bridge sets the session cookie.
 */
export async function requireStaffGroupPageAccess(
  subAccountId: string,
  groupId: string,
  currentPath: string
): Promise<GroupPageAccess> {
  const group = await getGroupById(subAccountId, groupId);
  if (!group) return { kind: "notFound" };
  const access = await requireGroupPageAccess(subAccountId, group.slug);
  if (access.kind === "redirect") {
    return {
      kind: "redirect",
      to: `/api/sub-accounts/${subAccountId}/community/${groupId}/ensure-session?next=${encodeURIComponent(currentPath)}`,
    };
  }
  return access;
}

export interface GroupAccessOk {
  kind: "ok";
  gate: CommunityGate;
  member: Member;
  group: CommunityGroup;
  membership: GroupMembership;
}

export type GroupPageAccess =
  | GroupAccessOk
  | { kind: "notFound" }
  | { kind: "redirect"; to: string };

type CommunityReturnPath = string | { opaque: string; pretty: string };

/**
 * Resolve member access to a group's gated surfaces (feed, classroom) by slug,
 * for server components. Returns:
 *  - `notFound` when the gate is off or the group isn't published
 *  - `redirect` to login (no session) or to the About page (signed in but not
 *    an active member — they need to join first)
 *  - `ok` with the full context when the viewer is an active member
 */
export async function requireGroupPageAccess(
  saId: string,
  groupSlug: string,
  returnTo?: CommunityReturnPath
): Promise<GroupPageAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) return { kind: "notFound" };

  const group = await getGroupBySlug(saId, groupSlug);
  if (!group || group.status !== "published") return { kind: "notFound" };

  // Self-detected from the CURRENT request's Host — a visitor who arrived
  // via the custom domain gets redirect targets on that same domain; one
  // who arrived via the shared platform domain (even if a custom domain is
  // ALSO configured) keeps today's opaque URLs. No caller of this function
  // needs to know or pass anything for this — see domain.ts.
  const pretty = await isCommunityPrettyRequest(saId);
  const linkBase = { saId, pretty };

  const member = await getCurrentMember(saId);
  if (!member) {
    const candidate =
      typeof returnTo === "string"
        ? returnTo
        : pretty
          ? returnTo?.pretty
          : returnTo?.opaque;
    const allowedPrefix = pretty ? "/communities/" : `/c/${saId}/`;
    const safeReturnTo =
      candidate && candidate.startsWith(allowedPrefix)
        ? candidate
        : communityAboutHref(linkBase, groupSlug);
    return {
      kind: "redirect",
      to: communityLoginHref(linkBase, { next: safeReturnTo }),
    };
  }

  const membership = await getMembership(saId, group.id, member.id);
  if (!membership || membership.status !== "active") {
    // Signed in but hasn't joined (or pending/removed) — send to the About
    // page where the Join CTA lives.
    return { kind: "redirect", to: communityAboutHref(linkBase, groupSlug) };
  }

  return { kind: "ok", gate, member, group, membership };
}

/** Sub-account-level member access (not group-scoped) — for DMs/profile. */
export type MemberApiAccess =
  | { kind: "ok"; gate: CommunityGate; member: Member }
  | { kind: "error"; status: number; message: string };

export async function requireMemberApi(saId: string): Promise<MemberApiAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  return { kind: "ok", gate, member };
}

export type GroupApiAccess =
  | GroupAccessOk
  | { kind: "error"; status: number; message: string };

/**
 * Same access check for member mutation routes, keyed by groupId (the client
 * already knows it). Returns a structured error instead of a redirect.
 */
export async function requireGroupApiAccess(
  saId: string,
  groupId: string
): Promise<GroupApiAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  const group = await getGroupById(saId, groupId);
  if (!group || group.status !== "published") {
    return { kind: "error", status: 404, message: "Group not found" };
  }
  const membership = await getMembership(saId, groupId, member.id);
  if (!membership || membership.status !== "active") {
    return { kind: "error", status: 403, message: "Join the group first" };
  }
  return { kind: "ok", gate, member, group, membership };
}
