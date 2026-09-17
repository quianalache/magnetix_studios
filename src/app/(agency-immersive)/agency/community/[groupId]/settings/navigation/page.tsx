"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { NavigationWorkspace } from "@/components/community/settings/navigation-workspace";
import type { CommunityGroup } from "@/types/community";

/** Agency Community Settings → Navigation — owner view. Reuses the exact
 *  tenant NavigationWorkspace (drag-reorder + visibility toggle) with
 *  agencyGroupId set — Classroom is excluded from the toggleable rows
 *  entirely (genuinely blocked on Agency Courses, see that component's
 *  own doc comment) so there's no way to turn on a tab with nothing
 *  behind it. */
export default function AgencyCommunityNavigationSettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
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
  if (!group) return <div className="mx-auto max-w-7xl p-8" />;

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="settings"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <NavigationWorkspace
        saId=""
        agencyGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        navigation={group.navigation}
        brand={brand}
      />
    </CommunityShell>
  );
}
