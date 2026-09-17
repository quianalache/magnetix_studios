"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell } from "@/components/community/community-shell";
import {
  CommunityEventsView,
  type CommunityEventViewModel,
} from "@/components/community/community-events-view";
import type { CommunityGroup } from "@/types/community";

/** Agency Community Events — owner view. Same client-fetch pattern as
 *  every other Agency page (see feed page.tsx's own doc comment). */
export default function AgencyCommunityEventsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [events, setEvents] = useState<CommunityEventViewModel[] | null>(null);
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
    void fetch(`/api/agency/community/${groupId}/events`)
      .then((r) => r.json())
      .then((d: { events?: CommunityEventViewModel[] }) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
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
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community not found.
      </div>
    );
  }
  if (!group || events === null) return <div className="mx-auto max-w-7xl p-8" />;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="events"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <CommunityEventsView
        saId=""
        agencyGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        categories={group.categories}
        initialEvents={events}
        moderator
      />
    </CommunityShell>
  );
}
