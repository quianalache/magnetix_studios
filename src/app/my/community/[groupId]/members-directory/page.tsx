import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
  listAgencyGroupMembers,
  type AgencyGroupMemberRoster,
} from "@/lib/server/community-agency-service";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { AgencyMembersDirectory, type AgencyDirectoryRow } from "@/components/community/agency-members-directory";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

function toRow(m: AgencyGroupMemberRoster): AgencyDirectoryRow {
  return {
    memberId: m.id,
    displayName: m.displayName?.trim() || m.email.split("@")[0] || "Member",
    email: m.email,
    avatarUrl: null,
    level: m.level ?? 1,
    points: m.points ?? 0,
    joinedAtMs: toMillis(m.activatedAt),
  };
}

/** Real Agency Community member access — Members directory (browse/
 *  search/DM other members of this community). Mirrors /c/[saId]/
 *  [groupSlug]/members/page.tsx. */
export default async function MyAgencyCommunityMembersDirectoryPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/members-directory`)}`);

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const roster = await listAgencyGroupMembers(agencyId, groupId);
  const rows = roster.filter((m) => m.status === "active").map(toRow);
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer = {
    memberId: membership.id,
    displayName: rows.find((r) => r.memberId === membership.id)?.displayName ?? "Member",
    avatarUrl: null,
    level: membership.level ?? 1,
  };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="members"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <AgencyMembersDirectory
        groupId={groupId}
        brand={brand}
        viewerMemberId={membership.id}
        viewerIsOwner={false}
        initialRows={rows}
      />
    </CommunityShell>
  );
}
