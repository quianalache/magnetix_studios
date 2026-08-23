"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, Pin, ThumbsUp } from "lucide-react";
import type { AuthorView, FeedPoll } from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { CommunityPostAttachments } from "@/components/community/feed/community-post-attachments";
import { CommunityPollCard } from "@/components/community/feed/community-poll-card";
import { PostComposer } from "@/components/community/feed/post-composer";
import { GifResolverProvider, collectGifProviderIds } from "@/components/community/feed/gif-resolver-context";
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
  /** Pinned to All Posts — the community-wide Featured Posts section. */
  pinned: boolean;
  pinnedAtMs: number | null;
  /** Pinned within its own channel (this post's `category`). */
  pinnedToChannel: boolean;
  channelPinnedAtMs: number | null;
  likeCount: number;
  commentCount: number;
  createdAtMs: number | null;
  author: AuthorView;
  likedByViewer: boolean;
  /** Polls (2026-08-20) — the viewer-safe server view; absent = no poll. */
  poll?: FeedPoll;
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
  staffGroupId,
  groupId,
  groupSlug,
  brand,
  communityName,
  categories,
  viewer,
  initialPosts,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. */
  pretty?: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  brand: string;
  /** Part 3's "for [Community Name]" composer header line. */
  communityName: string;
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
  const isAllPostsView = filter === "All";
  const filtered = isAllPostsView ? posts : posts.filter((p) => p.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "top") return b.likeCount - a.likeCount;
    if (sort === "unanswered") {
      if (a.commentCount === 0 && b.commentCount !== 0) return -1;
      if (a.commentCount !== 0 && b.commentCount === 0) return 1;
    }
    return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
  });
  // Featured Posts (All Posts view only) and "Pinned in [Channel]" (a
  // specific channel view only) are each their own section, never both at
  // once — a post pinned both ways shows once, in whichever section
  // matches the CURRENT view's context, never duplicated within one view
  // (explicit product instruction). `posts` (not `filtered`) is the source
  // for Featured Posts since it's community-wide, independent of any
  // channel filter.
  const featuredPosts = isAllPostsView
    ? [...posts].filter((p) => p.pinned).sort((a, b) => (b.pinnedAtMs ?? 0) - (a.pinnedAtMs ?? 0))
    : [];
  const channelPinnedPosts = !isAllPostsView
    ? [...filtered].filter((p) => p.pinnedToChannel).sort((a, b) => (b.channelPinnedAtMs ?? 0) - (a.channelPinnedAtMs ?? 0))
    : [];
  const sectionedIds = new Set([...featuredPosts, ...channelPinnedPosts].map((p) => p.id));
  const visible = sorted.filter((p) => !sectionedIds.has(p.id));
  // Editing is ONE modal instance driven by which post's id is currently
  // being edited, not a composer mounted inline in place of every post's
  // card (Phase D: the composer is a modal now, so the card underneath
  // stays exactly as it always looked while the modal is open above it).
  const editingPost = editingPostId ? (posts.find((p) => p.id === editingPostId) ?? null) : null;
  // Every GIF currently visible ANYWHERE on this page — Featured/pinned
  // sections included, not just the regular list below them — resolved in
  // ONE batched request rather than one per post — see gif-resolver-context.tsx.
  const gifProviderIds = collectGifProviderIds([...featuredPosts, ...channelPinnedPosts, ...visible]);

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

  /** Shared by both pin targets — All Posts (community-wide Featured
   *  Posts, capped at 3, enforced server-side) and Channel (the post's own
   *  category, no cap). The server is the source of truth for the new
   *  pinnedAt/channelPinnedAt timestamps that drive each section's
   *  ordering, so a successful response always replaces the WHOLE post
   *  from the server rather than guessing the new timestamp locally. */
  async function togglePin(post: ClientPost, target: "allPosts" | "channel") {
    const currentlyPinned = target === "allPosts" ? post.pinned : post.pinnedToChannel;
    const res = await fetch(`${base}/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !currentlyPinned, pinTarget: target }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't update pin");
      return;
    }
    const nowMs = Date.now();
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        return target === "allPosts"
          ? { ...p, pinned: !currentlyPinned, pinnedAtMs: !currentlyPinned ? nowMs : null }
          : { ...p, pinnedToChannel: !currentlyPinned, channelPinnedAtMs: !currentlyPinned ? nowMs : null };
      }),
    );
  }

  async function submitVote(postId: string, optionIds: string[]) {
    const res = await fetch(`${base}/posts/${postId}/poll/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionIds }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; poll?: unknown };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't record your vote");
      throw new Error(d.error ?? "vote failed");
    }
    // Replace with the server's own recomputed FeedPoll — never trust a
    // locally-guessed count, since other members may have voted between
    // this request and the response.
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, poll: d.poll as ClientPost["poll"] } : p)));
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

  /**
   * ONE shared post-card renderer for all three contexts (the regular
   * list, the Featured Posts section, a channel's "Pinned in [Channel]"
   * section) — everything below the pin-state badge/border is identical to
   * before this feature existed, so a normal post's rendering, comments,
   * GIFs, and channel display are all untouched. `variant` controls only
   * the themed accent border/tint + which badge shows — never a second,
   * divergent post-card implementation.
   */
  function renderPostCard(p: ClientPost, variant: "regular" | "featured" | "channelPinned") {
    const canModerate = viewer.role === "moderator";
    const canDelete = canModerate || p.authorMemberId === viewer.memberId;
    // Same broad "moderator can act on any post" convention `canDelete`
    // already uses — see the Phase D report for why this wasn't a new
    // permission concept.
    const canEdit = canModerate || p.authorMemberId === viewer.memberId;
    const detail = communityPostHref({ saId, pretty, staffGroupId }, groupSlug, p.id);
    // Themed highlight (Part 4): the community's OWN brand color, never a
    // hardcoded color — "0d"/"33" are hex alpha suffixes for a subtle
    // tint/border, not a second color needing its own theme plumbing.
    const highlighted = variant === "featured" || variant === "channelPinned";

    return (
      <article
        key={p.id}
        className={cn("rounded-xl border bg-white p-4", highlighted ? "border-2" : "border-[#E4E4E4]")}
        style={highlighted ? { borderColor: `${brand}66`, backgroundColor: `${brand}0d` } : undefined}
      >
        {variant === "featured" && (
          <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: brand }}>
            <Pin className="h-3 w-3 fill-current" /> Featured
          </div>
        )}
        {variant === "channelPinned" && (
          <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: brand }}>
            <Pin className="h-3 w-3 fill-current" /> Pinned in {p.category}
          </div>
        )}
        {variant === "regular" && (p.pinned || p.pinnedToChannel) && (
          // A post pinned somewhere but not currently shown in ITS OWN
          // dedicated section (e.g. globally featured while browsing a
          // DIFFERENT channel's own pinned section, or vice-versa) still
          // gets a plain, unhighlighted badge here — informative without
          // implying "this is the featured/pinned copy" (never duplicated;
          // see the featuredPosts/channelPinnedPosts exclusion above).
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-wide text-[#909090]">
            {p.pinned && (
              <span className="inline-flex items-center gap-1">
                <Pin className="h-3 w-3" /> Featured
              </span>
            )}
            {p.pinnedToChannel && (
              <span className="inline-flex items-center gap-1">
                <Pin className="h-3 w-3" /> Pinned in {p.category}
              </span>
            )}
          </div>
        )}
        <div className="flex items-start gap-3">
          <MemberAvatar author={p.author} size={40} brand={brand} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <AuthorLink saId={saId} viewerMemberId={viewer.memberId} author={p.author} brand={brand} />
              {/* Timestamp doubles as a permalink to the post — a small,
                  explicit, well-understood affordance (same pattern as
                  Twitter/Reddit/HN) rather than wrapping the whole card
                  body in one giant <a>, which made member-inserted links
                  inside the body invalid-nested and unclickable. */}
              <Link href={detail} className="text-xs text-[#909090] hover:underline">
                {timeAgo(p.createdAtMs)}
              </Link>
              {p.category && <span className="text-xs text-[#909090]">· {p.category}</span>}
            </div>
            {p.title && (
              <Link href={detail} className="mt-1 block hover:underline">
                <h3 className="font-semibold text-[#202124]">{p.title}</h3>
              </Link>
            )}
            {/* NOT wrapped in a <Link> — the old "wrap the whole title+body
                in one <a>" pattern made any link a member inserted into
                their own post text an invalid nested anchor (unpredictable
                clicks, and Chrome's status bar always showed the
                post-detail URL no matter what you hovered). The timestamp
                above and the comment-count link below remain as the
                card's "open post detail" affordances. */}
            <CommunityPostBody
              html={p.body}
              brand={brand}
              clamp
              className={cn(p.title ? "mt-0.5" : "mt-1")}
              saId={saId}
              pretty={pretty}
              staffGroupId={staffGroupId}
              groupSlug={groupSlug}
            />
            {p.attachments && p.attachments.length > 0 && (
              <CommunityPostAttachments attachments={p.attachments} brand={brand} className="mt-2" />
            )}
            {p.poll && <CommunityPollCard poll={p.poll} brand={brand} onVote={(optionIds) => submitVote(p.id, optionIds)} />}
            <div className="mt-3 flex items-center gap-4 text-xs text-[#909090]">
              <button onClick={() => toggleLike(p.id)} className="flex items-center gap-1 hover:text-[#202124]">
                <ThumbsUp
                  className={cn("h-4 w-4", p.likedByViewer && "fill-current")}
                  style={p.likedByViewer ? { color: brand } : undefined}
                />
                {p.likeCount}
              </button>
              <Link href={detail} className="flex items-center gap-1 hover:text-[#202124]">
                <MessageCircle className="h-4 w-4" />
                {p.commentCount}
              </Link>
            </div>
          </div>
          {(canModerate || canDelete || canEdit) && (
            <ActionsMenu
              items={[
                ...(canEdit ? [{ label: "Edit post", onClick: () => setEditingPostId(p.id) }] : []),
                ...(canModerate
                  ? [
                      {
                        label: p.pinned ? "Unpin from All Posts" : "Pin to All Posts",
                        onClick: () => togglePin(p, "allPosts"),
                      },
                      // A post with no channel/category can't be pinned to
                      // one — hidden entirely rather than shown disabled.
                      ...(p.category
                        ? [
                            {
                              label: p.pinnedToChannel ? "Unpin from Channel" : "Pin to Channel",
                              onClick: () => togglePin(p, "channel"),
                            },
                          ]
                        : []),
                    ]
                  : []),
                ...(canDelete ? [{ label: "Delete post", onClick: () => deletePost(p.id), destructive: true }] : []),
              ]}
            />
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      {/* Modal composer launcher (Phase D, Part 2) — a lightweight
          affordance, not the composer itself. Clicking opens the full
          `PostComposer` modal; this button never turns into a composer
          inline the way it used to. Permission/channel-awareness is
          unchanged — anything that could post before can still open this
          (server-side enforcement is what actually gates posting, same as
          always), this is purely the entry point. */}
      <button
        type="button"
        id="community-composer-trigger"
        onClick={() => setComposerOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-[#E4E4E4] bg-white p-4 text-left hover:border-[#d4d4d4]"
      >
        <MemberAvatar author={viewer} size={36} brand={brand} />
        <span className="text-sm text-[#909090]">What do you want to share today?</span>
      </button>
      {composerOpen && (
        <PostComposer
          saId={saId}
          groupId={groupId}
          brand={brand}
          communityName={communityName}
          categories={categories}
          viewer={viewer}
          mode="create"
          initialCategory={filter !== "All" ? filter : undefined}
          open={composerOpen}
          onCreated={prependPost}
          onCancel={() => setComposerOpen(false)}
        />
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

      <GifResolverProvider providerIds={gifProviderIds}>
      {/* Featured Posts — community-wide, All Posts view only (Part 1). A
          vertical stack, deliberately never a carousel, matching Skool's
          own spirit more than GoCollab's here per explicit instruction. */}
      {featuredPosts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: brand }}>
            <Pin className="h-3.5 w-3.5 fill-current" /> Featured Posts
          </div>
          {featuredPosts.map((p) => renderPostCard(p, "featured"))}
        </div>
      )}

      {/* Channel pinned posts — only while viewing that one channel (Part
          2), a completely separate section from Featured Posts above. */}
      {channelPinnedPosts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: brand }}>
            <Pin className="h-3.5 w-3.5 fill-current" /> Pinned in {filter}
          </div>
          {channelPinnedPosts.map((p) => renderPostCard(p, "channelPinned"))}
        </div>
      )}

      {visible.length === 0 && featuredPosts.length === 0 && channelPinnedPosts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          Nothing here yet. Be the first to post.
        </div>
      ) : (
        visible.length > 0 && <div className="space-y-3">{visible.map((p) => renderPostCard(p, "regular"))}</div>
      )}
      </GifResolverProvider>

      {editingPost && (
        <PostComposer
          key={editingPost.id}
          saId={saId}
          groupId={groupId}
          brand={brand}
          communityName={communityName}
          categories={categories}
          viewer={viewer}
          mode="edit"
          editingPost={editingPost}
          open
          onSaved={applyEditedPost}
          onCancel={() => setEditingPostId(null)}
        />
      )}
    </div>
  );
}
