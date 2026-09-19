import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { communityGroupsRoot, tenantScope, type CommunityOwnerScope } from "@/lib/server/community-scope";
import { listActiveParticipantsByScope } from "@/lib/server/community-participants-service";
import type { GroupMembership, Member } from "@/types/community";

/**
 * Leaderboard + members directory reads (Admin SDK, server-rendered for
 * members). All-time ranking uses the denormalized participant `points`;
 * the 7-day / 30-day windows aggregate the `pointEvents` time-series on
 * read (a QStash rollup is the escalation if a group ever gets big enough
 * to need it).
 *
 * Community Shared Architecture Phase 2 (2026-09-19): `getLeaderboardByScope`
 * is now the ONE ranking/scoring implementation for both tenant and
 * Agency — `getLeaderboard` (tenant, below) and `getAgencyLeaderboard`
 * (Agency, agency-community-points-service.ts) are both thin wrappers over
 * it. The only thing that differs per scope is participant lookup
 * (`listActiveParticipantsByScope`, community-participants-service.ts) —
 * scoring/ordering is identical. `listMemberDirectory` (tenant-only,
 * richer member-management read: handle/bio/last-seen/banned rows) is
 * untouched by this phase — Agency's member-management UI already has its
 * own equivalent (`listAgencyGroupMembers`, community-agency-service.ts).
 */

export type LeaderboardWindow = "7d" | "30d" | "all";

export interface LeaderboardRow {
  rank: number;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  points: number;
}

function displayNameFor(m: Pick<Member, "displayName" | "email">): string {
  if (m.displayName && m.displayName.trim()) return m.displayName.trim();
  return m.email.split("@")[0] || "Member";
}

export async function getLeaderboardByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  window: LeaderboardWindow;
  limit?: number;
}): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 50;
  // Active participants (id/displayName/avatarUrl/level/all-time points) —
  // needed regardless of window, either as the score source (all-time) or
  // just for display metadata (7d/30d, whose score comes from pointEvents).
  const participants = await listActiveParticipantsByScope(opts.scope, opts.groupId);
  const byId = new Map(participants.map((p) => [p.id, p]));

  let scored: { memberId: string; points: number }[];
  if (opts.window === "all") {
    scored = participants
      .map((p) => ({ memberId: p.id, points: p.points }))
      .filter((s) => s.points > 0);
  } else {
    const days = opts.window === "7d" ? 7 : 30;
    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const snap = await getAdminDb()
      .collection(`${communityGroupsRoot(opts.scope)}/${opts.groupId}/pointEvents`)
      .where("createdAt", ">=", cutoff)
      .get();
    const tally = new Map<string, number>();
    snap.docs.forEach((d) => {
      const { memberId, delta } = d.data() as { memberId: string; delta: number };
      tally.set(memberId, (tally.get(memberId) ?? 0) + (delta ?? 0));
    });
    scored = Array.from(tally.entries())
      .map(([memberId, points]) => ({ memberId, points }))
      .filter((s) => s.points > 0);
  }

  scored.sort((a, b) => b.points - a.points);
  return scored.slice(0, limit).map((s, i) => {
    const p = byId.get(s.memberId);
    return {
      rank: i + 1,
      memberId: s.memberId,
      displayName: p?.displayName ?? "Member",
      avatarUrl: p?.avatarUrl ?? null,
      level: p?.level ?? 1,
      points: s.points,
    };
  });
}

export async function getLeaderboard(opts: {
  subAccountId: string;
  groupId: string;
  window: LeaderboardWindow;
  limit?: number;
}): Promise<LeaderboardRow[]> {
  return getLeaderboardByScope({ ...opts, scope: tenantScope(opts.subAccountId) });
}

export interface MemberDirectoryRow {
  memberId: string;
  displayName: string;
  /** @handle derived from the name + a short id suffix. */
  handle: string;
  bio: string;
  avatarUrl: string | null;
  level: number;
  points: number;
  role: GroupMembership["role"];
  status: "active" | "banned";
  joinedAtMs: number | null;
  lastSeenAtMs: number | null;
}

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

function handleFor(displayName: string, memberId: string): string {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "member";
  return `@${slug}-${memberId.slice(-4)}`;
}

/**
 * The member directory: active + banned memberships, hydrated with name,
 * avatar, level, join date, and last-seen (for the online indicator). Banned
 * rows are returned too so a moderator can see + un-ban them; the page only
 * shows the Banned tab to moderators.
 *
 * Tenant-only (richer read than the shared `CommunityParticipant` model
 * needs — handle/bio/last-seen/banned rows have no Agency member-
 * management equivalent yet, see `listAgencyGroupMembers` instead) —
 * unchanged by Phase 2, kept exactly as it was.
 */
export async function listMemberDirectory(opts: {
  subAccountId: string;
  groupId: string;
}): Promise<MemberDirectoryRow[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(
      `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships`,
    )
    .get();
  const memberships = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<GroupMembership, "id">) }))
    .filter((m) => m.status === "active" || m.status === "banned");

  const ids = memberships.map((m) => m.memberId);
  const unique = Array.from(new Set(ids));
  const memberSnaps =
    unique.length > 0
      ? await db.getAll(
          ...unique.map((id) =>
            db.doc(`subAccounts/${opts.subAccountId}/members/${id}`),
          ),
        )
      : [];
  const memberById = new Map<string, Member | undefined>();
  unique.forEach((id, i) =>
    memberById.set(id, memberSnaps[i].data() as Member | undefined),
  );

  return memberships
    .map((m) => {
      const member = memberById.get(m.memberId);
      const displayName = member ? displayNameFor(member) : "Former member";
      return {
        memberId: m.memberId,
        displayName,
        handle: handleFor(displayName, m.memberId),
        bio: member?.bio ?? "",
        avatarUrl: member?.avatarUrl ?? null,
        level: m.level ?? 1,
        points: m.points ?? 0,
        role: m.role,
        status: m.status as "active" | "banned",
        joinedAtMs: toMillis(m.joinedAt),
        lastSeenAtMs: toMillis(member?.lastSeenAt),
      };
    })
    .sort((a, b) => b.points - a.points);
}
