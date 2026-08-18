import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { listFeed } from "@/lib/server/community-feed-service";
import {
  getLeaderboard,
  listMemberDirectory,
} from "@/lib/server/community-leaderboard-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { FeedView, type ClientPost } from "@/components/community/feed/feed-view";
import { renderCommunityPostHtml } from "@/lib/community/post-html";
import { CommunityBanner } from "@/components/community/community-banner";
import { CommunityLeftNav } from "@/components/community/community-left-nav";
import { AboutCommunityCard } from "@/components/community/about-community-card";
import { TopContributorsCard } from "@/components/community/top-contributors-card";
import { SidebarContentCard } from "@/components/community/sidebar-content-card";
import { GuidelinesCard } from "@/components/community/guidelines-card";
import type { AuthorView } from "@/types/community";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";

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

export default async function CommunityFeedPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);
  const { group, member, membership, gate } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const feed = await listFeed({
    subAccountId: saId,
    groupId: group.id,
    viewerMemberId: member.id,
  });

  const posts: ClientPost[] = feed.map((p) => ({
    id: p.id,
    authorMemberId: p.authorMemberId,
    title: p.title,
    // Sanitized here, server-side, before this ever reaches the client —
    // the required read-path boundary (see post-html.ts). Handles old
    // plain-text posts and new rich-HTML posts identically.
    body: renderCommunityPostHtml(p.body),
    category: p.category,
    pinned: p.pinned,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    createdAtMs: toMillis(p.createdAt),
    author: p.author,
    likedByViewer: p.likedByViewer,
  }));

  void gate;

  // Real, already-proven data sources — same calls the previous right rail
  // (GroupRailCard + an inline "Leaderboard" block) used. Nothing new is
  // fetched here beyond what Home already computed (see the 2026-08-17
  // investigation report + Part 14.C).
  const [topMembers, directory] = await Promise.all([
    getLeaderboard({
      subAccountId: saId,
      groupId: group.id,
      window: "all",
      limit: 5,
    }),
    listMemberDirectory({ subAccountId: saId, groupId: group.id }),
  ]);

  const now = Date.now();
  const activeMembers = directory.filter((r) => r.status === "active");
  const isOnline = (ms: number | null) => !!ms && now - ms < ONLINE_WINDOW_MS;
  const memberCount = activeMembers.length;
  const onlineCount = activeMembers.filter((r) => isOnline(r.lastSeenAtMs)).length;
  const adminCount = activeMembers.filter((r) => r.role === "moderator").length;

  const sidebarCards = (group.sidebarCards ?? []).slice().sort((a, b) => a.order - b.order);

  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={group}
      active="community"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      rightRail={
        <>
          <AboutCommunityCard
            group={group}
            brand={brand}
            memberCount={memberCount}
            onlineCount={onlineCount}
            adminCount={adminCount}
          />
          <TopContributorsCard
            saId={saId}
            pretty={pretty}
            groupSlug={group.slug}
            brand={brand}
            members={topMembers}
          />
          {sidebarCards.map((card) => (
            <SidebarContentCard key={card.id} card={card} brand={brand} />
          ))}
          <GuidelinesCard guidelinesHtml={group.guidelinesHtml ?? ""} />
        </>
      }
    >
      <div className="space-y-4">
        <CommunityBanner group={group} brand={brand} />
        <Suspense fallback={null}>
          <div className="grid gap-6 md:grid-cols-[200px_1fr]">
            <CommunityLeftNav
              saId={saId}
              pretty={pretty}
              groupSlug={group.slug}
              brand={brand}
              categories={group.categories}
            />
            <FeedView
              saId={saId}
              pretty={pretty}
              groupId={group.id}
              groupSlug={group.slug}
              brand={brand}
              categories={group.categories}
              viewer={{
                memberId: member.id,
                role: membership.role,
                displayName: viewer.displayName,
                avatarUrl: viewer.avatarUrl,
                level: viewer.level,
              }}
              initialPosts={posts}
            />
          </div>
        </Suspense>
      </div>
    </CommunityShell>
  );
}
