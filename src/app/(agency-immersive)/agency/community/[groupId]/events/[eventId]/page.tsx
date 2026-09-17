"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityEventDetailView } from "@/components/community/community-event-detail-view";
import type { CommunityEventViewModel } from "@/components/community/community-events-view";
import type { CommunityGroup } from "@/types/community";

/** Agency Community Event detail — owner view. */
export default function AgencyCommunityEventDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; eventId: string }>;
}) {
  const { groupId, eventId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [event, setEvent] = useState<CommunityEventViewModel | null>(null);
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
      .then((d: { events?: CommunityEventViewModel[] }) => {
        const found = (d.events ?? []).find((e) => e.id === eventId);
        if (!found) throw new Error();
        setEvent(found);
      })
      .catch(() => setNotFound(true));
  }, [isOwner, groupId, eventId]);

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
        Event not found.
      </div>
    );
  }
  if (!group || !event) return <div className="mx-auto max-w-4xl p-8" />;

  const base = `/agency/community/${groupId}/events`;
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
      <CommunityEventDetailView
        event={event}
        apiPath={`/api/agency/community/${groupId}/events`}
        eventsHref={base}
        liveHref={`${base}/${event.id}/live`}
        moderator
      />
    </CommunityShell>
  );
}
