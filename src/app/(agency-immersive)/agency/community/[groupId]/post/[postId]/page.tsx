"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  PostDetailView,
  type ClientComment,
} from "@/components/community/feed/post-detail-view";
import type { ClientPost } from "@/components/community/feed/feed-view";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { CommunityGroup } from "@/types/community";

/** Agency Community — single post + comments. Same client-fetch pattern
 *  as the feed page (see that file's doc comment for why). */
export default function AgencyCommunityPostPage({
  params,
}: {
  params: Promise<{ groupId: string; postId: string }>;
}) {
  const { groupId, postId } = use(params);
  const { user, agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [post, setPost] = useState<ClientPost | null>(null);
  const [comments, setComments] = useState<ClientComment[]>([]);
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
    void fetch(`/api/agency/community/${groupId}/posts/${postId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { post: ClientPost; comments: ClientComment[] }) => {
        setPost(d.post);
        setComments(d.comments);
      })
      .catch(() => setNotFound(true));
  }, [isOwner, groupId, postId]);

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
        Post not found.
      </div>
    );
  }
  if (!group || !post) return <div className="mx-auto max-w-3xl p-8" />;

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer = {
    memberId: user?.uid ?? "",
    displayName: user?.displayName || user?.email || "Agency owner",
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
      <div className="mx-auto max-w-3xl">
        <PostDetailView
          saId=""
          agencyGroupId={groupId}
          groupId={group.id}
          groupSlug={group.slug}
          brand={brand}
          primaryAction={resolvedTheme.primaryAction}
          accent={resolvedTheme.accent}
          communityName={group.name}
          categories={group.categories}
          post={post}
          initialComments={comments}
          viewer={{ ...viewer, role: "moderator" }}
        />
      </div>
    </CommunityShell>
  );
}
