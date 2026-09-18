"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { AgencyMembersDirectory, type AgencyDirectoryRow } from "@/components/community/agency-members-directory";
import type { CommunityGroup } from "@/types/community";

interface RosterEntry {
  id: string;
  email: string;
  displayName: string | null;
  status: "pending" | "active" | "removed";
  activatedAt?: { _seconds?: number; seconds?: number } | null;
  points?: number;
  level?: number;
}

function toMillis(v: RosterEntry["activatedAt"]): number | null {
  if (!v) return null;
  const seconds = v.seconds ?? v._seconds;
  return typeof seconds === "number" ? seconds * 1000 : null;
}

function toRow(m: RosterEntry): AgencyDirectoryRow {
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

/** Agency Community Members directory — owner view. The real member-
 *  facing directory (browse/search/DM/remove), a different page than the
 *  pre-existing invite-admin roster at /members (add/resend/revoke
 *  pending invites) — same "kept at its own path, not merged" convention
 *  as the tenant Staff Community Integration precedent. */
export default function AgencyCommunityMembersDirectoryPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [rows, setRows] = useState<AgencyDirectoryRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group: CommunityGroup }) => setGroup(d.group))
      .catch(() => setNotFound(true));
    void fetch(`/api/agency/community/${groupId}/members`)
      .then((r) => r.json())
      .then((d: { members?: RosterEntry[] }) =>
        setRows((d.members ?? []).filter((m) => m.status === "active").map(toRow)),
      )
      .catch(() => setRows([]));
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (notFound) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }
  if (!group || !rows) return <div className="mx-auto max-w-7xl p-8" />;

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="members"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <AgencyMembersDirectory
        groupId={groupId}
        brand={brand}
        viewerMemberId=""
        viewerIsOwner
        initialRows={rows}
      />
    </CommunityShell>
  );
}
