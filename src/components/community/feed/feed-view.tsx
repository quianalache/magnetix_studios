"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, Pin, ThumbsUp } from "lucide-react";
import type { AuthorView } from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { CommunityPostAttachments } from "@/components/community/feed/community-post-attachments";
import { PostComposer } from "@/components/community/feed/post-composer";
import { communityPostHref } from "@/lib/community/routes";
import { cn } from "@/lib/utils";

export interface ClientPost {
  id: string;
  authorMemberId: string;
  title: string;
  body: string;
  attachments?: MediaAttachment[];
  category: string | null;
  /** Phase D — absent/false means comments are allowed (matches
   *  CommunityPost.commentsDisabled's convention). */
  commentsDisabled?: boolean;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAtMs: number | null;
  author: AuthorView;
  likedByViewer: boolean;
}

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ms).toLocaleDateString();
}

export function FeedView({
  saId,
  pretty = false,
  groupId,
  groupSlug,
  brand,
  categories,
  viewer,
  initialPosts,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. */
  pretty?: boolean;
  groupId: string;
  groupSlug: string;
  brand: string;
  categories: string[];
  viewer: Viewer;
  initialPosts: ClientPost[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [sort, setSort] = useState<"latest" | "top" | "unanswered">("latest");
  // Category filter is driven by the left nav's `?c=` link (Part 7) rather
  // than an in-feed pill row, so there's one control for it, not two.
  const searchParams = useSearchParams();
  const filter = searchParams.get("c") ?? "All";

  function prependPost(post: ClientPost) {
    setPosts((prev) => [post, ...prev]);
    setComposerOpen(false);
  }

  function applyEditedPost(post: ClientPost) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    setEditingPostId(null);
  }

  const base = `/api/community/${saId}/${groupId}`;
  const filtered = filter === "All" ? posts : posts.filter((p) => p.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "top") return b.likeCount - a.likeCount;
    if (sort === "unanswered") {
      if (a.commentCount === 0 && b.commentCount !== 0) return -1;
      if (a.commentCount !== 0 && b.commentCount === 0) return 1;
    }
    return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
  });
  const visible = sorted;

  async function toggleLike(postId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByViewer: !p.likedByViewer,
              likeCount: p.likeCount + (p.likedByViewer ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      const res = await fetch(`${base}/posts/${postId}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByViewer: !p.likedByViewer,
                likeCount: p.likeCount + (p.likedByViewer ? 1 : -1),
              }
            : p,
        ),
      );
      toast.error("Couldn't update like");
    }
  }

  async function togglePin(postId: string, pinned: boolean) {
    const res = await fetch(`${base}/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (res.ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, pinned: !pinned } : p)),
      );
    } else {
      toast.error("Couldn't update pin");
    }
  }

  async function deletePost(postId: string) {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`${base}/posts/${postId}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted");
    } else {
      toast.error("Couldn't delete");
    }
  }

  return (
    <div className="space-y-4">
      {composerOpen ? (
        <PostComposer
          saId={saId}
          groupId={groupId}
          brand={brand}
          categories={categories}
          viewer={viewer}
          mode="create"
          onCreated={prependPost}
          onCancel={() => setComposerOpen(false)}
        />
      ) : (
        <button
          id="community-composer-trigger"
          onClick={() => setComposerOpen(true)}
          className="w-full rounded-xl border border-[#E4E4E4] bg-white p-4 text-left text-sm text-[#909090] hover:border-[#d4d4d4]"
        >
          Write something…
        </button>
      )}

      <div className="flex items-center gap-4 border-b border-[#E4E4E4] px-1">
        {(["latest", "top", "unanswered"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={cn(
              "border-b-2 py-2 text-sm font-medium capitalize transition-colors",
              sort === s ? "text-[#202124]" : "border-transparent text-[#909090] hover:text-[#202124]",
            )}
            style={sort === s ? { borderColor: brand } : { borderColor: "transparent" }}
          >
            {s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          Nothing here yet. Be the first to post.
        </div>
      ) : (
        <div className="space-y-3">
          {[...visible]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .map((p) => {
              const canModerate = viewer.role === "moderator";
              const canDelete =
                canModerate || p.authorMemberId === viewer.memberId;
              // Same broad "moderator can act on any post" convention
              // `canDelete` already uses — see the Phase D report for why
              // this wasn't a new permission concept.
              const canEdit = canModerate || p.authorMemberId === viewer.memberId;
              const detail = communityPostHref({ saId, pretty }, groupSlug, p.id);

              if (editingPostId === p.id) {
                return (
                  <PostComposer
                    key={p.id}
                    saId={saId}
                    groupId={groupId}
                    brand={brand}
                    categories={categories}
                    viewer={viewer}
                    mode="edit"
                    editingPost={p}
                    onSaved={applyEditedPost}
                    onCancel={() => setEditingPostId(null)}
                  />
                );
              }

              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-[#E4E4E4] bg-white p-4"
                >
                  {p.pinned && (
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[#909090]">
                      <Pin className="h-3 w-3" /> Pinned
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <MemberAvatar author={p.author} size={40} brand={brand} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <AuthorLink
                          saId={saId}
                          pretty={pretty}
                          viewerMemberId={viewer.memberId}
                          author={p.author}
                          brand={brand}
                        />
                        {/* Timestamp doubles as a permalink to the post —
                            a small, explicit, well-understood affordance
                            (same pattern as Twitter/Reddit/HN) rather than
                            wrapping the whole card body in one giant <a>,
                            which made member-inserted links inside the
                            body invalid-nested and unclickable. */}
                        <Link
                          href={detail}
                          className="text-xs text-[#909090] hover:underline"
                        >
                          {timeAgo(p.createdAtMs)}
                        </Link>
                        {p.category && (
                          <span className="text-xs text-[#909090]">
                            · {p.category}
                          </span>
                        )}
                      </div>
                      {p.title && (
                        <Link href={detail} className="mt-1 block hover:underline">
                          <h3 className="font-semibold text-[#202124]">{p.title}</h3>
                        </Link>
                      )}
                      {/* NOT wrapped in a <Link> — the old "wrap the whole
                          title+body in one <a>" pattern made any link a
                          member inserted into their own post text an
                          invalid nested anchor (unpredictable clicks, and
                          Chrome's status bar always showed the post-detail
                          URL no matter what you hovered). The timestamp
                          above and the comment-count link below remain as
                          the card's "open post detail" affordances. */}
                      <CommunityPostBody
                        html={p.body}
                        brand={brand}
                        clamp
                        className={cn(p.title ? "mt-0.5" : "mt-1")}
                        saId={saId}
                        pretty={pretty}
                        groupSlug={groupSlug}
                      />
                      {p.attachments && p.attachments.length > 0 && (
                        <CommunityPostAttachments
                          attachments={p.attachments}
                          brand={brand}
                          className="mt-2"
                        />
                      )}
                      <div className="mt-3 flex items-center gap-4 text-xs text-[#909090]">
                        <button
                          onClick={() => toggleLike(p.id)}
                          className="flex items-center gap-1 hover:text-[#202124]"
                        >
                          <ThumbsUp
                            className={cn("h-4 w-4", p.likedByViewer && "fill-current")}
                            style={p.likedByViewer ? { color: brand } : undefined}
                          />
                          {p.likeCount}
                        </button>
                        <Link
                          href={detail}
                          className="flex items-center gap-1 hover:text-[#202124]"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {p.commentCount}
                        </Link>
                      </div>
                    </div>
                    {(canModerate || canDelete || canEdit) && (
                      <ActionsMenu
                        items={[
                          ...(canEdit
                            ? [{ label: "Edit post", onClick: () => setEditingPostId(p.id) }]
                            : []),
                          ...(canModerate
                            ? [
                                {
                                  label: p.pinned ? "Unpin post" : "Pin post",
                                  onClick: () => togglePin(p.id, p.pinned),
                                },
                              ]
                            : []),
                          ...(canDelete
                            ? [
                                {
                                  label: "Delete post",
                                  onClick: () => deletePost(p.id),
                                  destructive: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </div>
  );
}
