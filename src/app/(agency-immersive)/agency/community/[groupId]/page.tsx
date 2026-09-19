"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { FeedView, type ClientPost } from "@/components/community/feed/feed-view";
import { CommunityBanner } from "@/components/community/community-banner";
import { CommunityLeftNav } from "@/components/community/community-left-nav";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { CommunityGroup, CommunityChannel, CommunitySection } from "@/types/community";

/**
 * Agency Community feed — the Agency-scope sibling of the tenant staff
 * immersive Community page. Client component (not server-rendered),
 * matching the established pattern for every other Agency page in this
 * codebase: `useAuth()` hides the UI client-side, and the REAL enforcement
 * is server-side in every /api/agency/community/* route this fetches from
 * (all gated by `requireAgencyOwnerAny`) — see the Agency Community task's
 * security section for why this isn't a weaker boundary than a
 * server-component page would be.
 *
 * No right rail (leaderboard/reviews/sidebar cards aren't built for
 * agency scope — see community-agency-service.ts's module comment) and no
 * `viewerIsModerator` gate on Settings — the agency owner is always fully
 * privileged in their own agency, same convention as everywhere else.
 */
export default function AgencyCommunityFeedPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { user, agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [sections, setSections] = useState<CommunitySection[]>([]);
  const [posts, setPosts] = useState<ClientPost[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group: CommunityGroup; brandName?: string }) => {
        setGroup(d.group);
        setBrandName(d.brandName ?? null);
      })
      .catch(() => setNotFound(true));
    void fetch(`/api/agency/community/${groupId}/channels`)
      .then((r) => r.json())
      .then((d: { channels?: CommunityChannel[]; sections?: CommunitySection[] }) => {
        setChannels(d.channels ?? []);
        setSections(d.sections ?? []);
      })
      .catch(() => undefined);
    void fetch(`/api/agency/community/${groupId}/posts`)
      .then((r) => r.json())
      .then((d: { posts?: ClientPost[] }) => setPosts(d.posts ?? []))
      .catch(() => setPosts([]));
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
  if (!group || posts === null) {
    return <div className="mx-auto max-w-7xl p-8" />;
  }

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  // The owner's own posts are attributed as the agency brand ("Magnetix
  // Studios"), never their personal Firebase identity — see
  // resolveAgencyAuthor in community-agency-service.ts. This local viewer
  // preview matches that so the composer never shows a name the saved
  // post won't actually have.
  const viewer = {
    memberId: user?.uid ?? "",
    displayName: brandName || "Agency owner",
    avatarUrl: user?.photoURL ?? null,
    level: 1,
  };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="community"
      viewer={viewer}
      viewerIsModerator
      embedded={false}
    >
      <div className="space-y-4">
        {(group.showBanner ?? true) && <CommunityBanner group={group} />}
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <div className="min-w-0">
            <CommunityLeftNav
              saId=""
              agencyGroupId={groupId}
              groupId={group.id}
              groupSlug={group.slug}
              brand={brand}
              primaryAction={resolvedTheme.primaryAction}
              viewer={{ memberId: viewer.memberId, role: "moderator" }}
              initialChannels={channels}
              initialSections={sections}
            />
          </div>
          <div className="min-w-0">
            <FeedView
              saId=""
              agencyGroupId={groupId}
              groupId={group.id}
              groupSlug={group.slug}
              brand={brand}
              communityName={group.name}
              categories={group.categories}
              viewer={{ ...viewer, role: "moderator" }}
              initialPosts={posts}
            />
          </div>
        </div>
      </div>
    </CommunityShell>
  );
}
