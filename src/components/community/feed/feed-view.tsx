"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, Pin, ThumbsUp, Video } from "lucide-react";
import type { AuthorView, FeedPoll } from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { CommunityPostAttachments } from "@/components/community/feed/community-post-attachments";
import { CommunityPollCard } from "@/components/community/feed/community-poll-card";
import { PostComposer } from "@/components/community/feed/post-composer";
import {
  GifResolverProvider,
  collectGifProviderIds,
} from "@/components/community/feed/gif-resolver-context";
import { communityPostHref } from "@/lib/community/routes";
import { cn } from "@/lib/utils";
import { QuickGoLiveSetup } from "@/components/community/quick-go-live-setup";
import { FocusedPostOverlay } from "@/components/community/feed/focused-post-overlay";
import { InlineCommentThread } from "@/components/community/feed/inline-comment-thread";
import { CommunityLiveStage } from "@/components/community/community-live-stage";
import { CommunityReplayPlayer } from "@/components/community/community-replay-player";

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
  postType?: "live";
  liveSessionId?: string | null;
  liveRoomId?: string | null;
  liveMode?: "meeting" | "broadcast";
  liveStatus?: "live" | "ended";
  replayStatus?: "processing" | "ready" | "failed" | "unavailable";
  replayAssetId?: string | null;
  thumbnailUrl?: string | null;
}

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

// Retained temporarily as source history while the replacement setup mounts
// through the unchanged composer action below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyGoLiveDialog({
  saId,
  groupId,
  categories,
  filter,
  onClose,
  onCreated,
}: {
  saId: string;
  groupId: string;
  categories: string[];
  filter: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState(
    filter !== "All" ? filter : (categories[0] ?? "General")
  );
  const [mode, setMode] = useState<"meeting" | "broadcast">("meeting");
  const [keepAsPost, setKeepAsPost] = useState(true);
  const [notifyMembers, setNotifyMembers] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const response = await fetch(
      `/api/community/${saId}/${groupId}/live-rooms`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title,
          description,
          channel: channel || null,
          mode,
          keepAsPost,
          notifyMembers,
        }),
      }
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to start live room.");
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="go-live-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
        <div>
          <h2 id="go-live-title" className="text-lg font-semibold">
            Go live
          </h2>
          <p className="text-muted-foreground text-sm">
            Start a native live room in this Community.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Title
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Channel
            <select
              className="mt-1 w-full rounded-md border bg-white px-3 py-2"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Live mode
            <select
              className="mt-1 w-full rounded-md border bg-white px-3 py-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="meeting">Meeting Room</option>
              <option value="broadcast">Broadcast</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepAsPost}
            onChange={(e) => setKeepAsPost(e.target.checked)}
          />{" "}
          Keep live as a post
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifyMembers}
            onChange={(e) => setNotifyMembers(e.target.checked)}
          />{" "}
          Notify members{" "}
          <span className="text-muted-foreground text-xs">
            (delivery deferred)
          </span>
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={!title.trim()}
            className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => void submit()}
          >
            Start live room
          </button>
        </div>
      </div>
    </div>
  );
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
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [focusedPost, setFocusedPost] = useState<ClientPost | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
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
  const filtered = isAllPostsView
    ? posts
    : posts.filter((p) => p.category === filter);
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
    ? [...posts]
        .filter((p) => p.pinned)
        .sort((a, b) => (b.pinnedAtMs ?? 0) - (a.pinnedAtMs ?? 0))
    : [];
  const channelPinnedPosts = !isAllPostsView
    ? [...filtered]
        .filter((p) => p.pinnedToChannel)
        .sort((a, b) => (b.channelPinnedAtMs ?? 0) - (a.channelPinnedAtMs ?? 0))
    : [];
  const sectionedIds = new Set(
    [...featuredPosts, ...channelPinnedPosts].map((p) => p.id)
  );
  const visible = sorted.filter((p) => !sectionedIds.has(p.id));
  // Editing is ONE modal instance driven by which post's id is currently
  // being edited, not a composer mounted inline in place of every post's
  // card (Phase D: the composer is a modal now, so the card underneath
  // stays exactly as it always looked while the modal is open above it).
  const editingPost = editingPostId
    ? (posts.find((p) => p.id === editingPostId) ?? null)
    : null;
  // Every GIF currently visible ANYWHERE on this page — Featured/pinned
  // sections included, not just the regular list below them — resolved in
  // ONE batched request rather than one per post — see gif-resolver-context.tsx.
  const gifProviderIds = collectGifProviderIds([
    ...featuredPosts,
    ...channelPinnedPosts,
    ...visible,
  ]);

  async function toggleLike(postId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByViewer: !p.likedByViewer,
              likeCount: p.likeCount + (p.likedByViewer ? -1 : 1),
            }
          : p
      )
    );
    try {
      const res = await fetch(`${base}/posts/${postId}/like`, {
        method: "POST",
      });
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
            : p
        )
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
    const currentlyPinned =
      target === "allPosts" ? post.pinned : post.pinnedToChannel;
    const res = await fetch(`${base}/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !currentlyPinned, pinTarget: target }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't update pin");
      return;
    }
    const nowMs = Date.now();
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        return target === "allPosts"
          ? {
              ...p,
              pinned: !currentlyPinned,
              pinnedAtMs: !currentlyPinned ? nowMs : null,
            }
          : {
              ...p,
              pinnedToChannel: !currentlyPinned,
              channelPinnedAtMs: !currentlyPinned ? nowMs : null,
            };
      })
    );
  }

  async function submitVote(postId: string, optionIds: string[]) {
    const res = await fetch(`${base}/posts/${postId}/poll/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionIds }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      poll?: unknown;
    };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't record your vote");
      throw new Error(d.error ?? "vote failed");
    }
    // Replace with the server's own recomputed FeedPoll — never trust a
    // locally-guessed count, since other members may have voted between
    // this request and the response.
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, poll: d.poll as ClientPost["poll"] } : p
      )
    );
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
  function renderPostCard(
    p: ClientPost,
    variant: "regular" | "featured" | "channelPinned"
  ) {
    const canModerate = viewer.role === "moderator";
    const canDelete = canModerate || p.authorMemberId === viewer.memberId;
    // Same broad "moderator can act on any post" convention `canDelete`
    // already uses — see the Phase D report for why this wasn't a new
    // permission concept.
    const canEdit = canModerate || p.authorMemberId === viewer.memberId;
    const detail = communityPostHref(
      { saId, pretty, staffGroupId },
      groupSlug,
      p.id
    );
    // Themed highlight (Part 4): the community's OWN brand color, never a
    // hardcoded color — "0d"/"33" are hex alpha suffixes for a subtle
    // tint/border, not a second color needing its own theme plumbing.
    const highlighted = variant === "featured" || variant === "channelPinned";

    return (
      <article
        key={p.id}
        className={cn(
          "rounded-xl border bg-white p-4",
          highlighted ? "border-2" : "border-[#E4E4E4]"
        )}
        style={
          highlighted
            ? { borderColor: `${brand}66`, backgroundColor: `${brand}0d` }
            : undefined
        }
      >
        {p.postType === "live" && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
            <span className="font-semibold text-red-700">
              {p.liveStatus === "live" ? "LIVE" : "Live ended"} ·{" "}
              {p.liveMode === "broadcast" ? "Broadcast" : "Meeting Room"}
            </span>
            {p.liveStatus === "live" && p.liveRoomId && (
              <Link
                className="font-medium text-red-700 underline"
                href={`/c/${saId}/${groupSlug}/live/${p.liveRoomId}`}
              >
                Join Live
              </Link>
            )}
          </div>
        )}
        {p.postType === "live" && p.liveStatus === "live" && p.liveRoomId && (
          <CommunityLiveStage
            saId={saId}
            groupId={groupId}
            postId={p.id}
            mode={p.liveMode === "broadcast" ? "broadcast" : "meeting"}
          />
        )}
        {p.postType === "live" &&
          p.liveStatus === "ended" &&
          p.replayStatus === "processing" && (
            <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-slate-950 px-5 text-center text-sm text-white/80">
              Replay processing…
            </div>
          )}
        {p.postType === "live" &&
          p.liveStatus === "ended" &&
          p.replayStatus === "ready" &&
          p.replayAssetId && (
            <CommunityReplayPlayer
              saId={saId}
              groupId={groupId}
              postId={p.id}
            />
          )}
        {p.postType === "live" && p.thumbnailUrl && (
          <img
            src={p.thumbnailUrl}
            alt=""
            className="mb-3 aspect-video w-full rounded-lg object-cover"
          />
        )}
        {variant === "featured" && (
          <div
            className="mb-2 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase"
            style={{ color: brand }}
          >
            <Pin className="h-3 w-3 fill-current" /> Featured
          </div>
        )}
        {variant === "channelPinned" && (
          <div
            className="mb-2 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase"
            style={{ color: brand }}
          >
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
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-wide text-[#909090] uppercase">
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
              <AuthorLink
                saId={saId}
                viewerMemberId={viewer.memberId}
                author={p.author}
                brand={brand}
              />
              {/* Timestamp doubles as a permalink to the post — a small,
                  explicit, well-understood affordance (same pattern as
                  Twitter/Reddit/HN) rather than wrapping the whole card
                  body in one giant <a>, which made member-inserted links
                  inside the body invalid-nested and unclickable. */}
              <button
                onClick={() => setFocusedPost(p)}
                className="text-xs text-[#909090] hover:underline"
              >
                {timeAgo(p.createdAtMs)}
              </button>
              {p.category && (
                <span className="text-xs text-[#909090]">· {p.category}</span>
              )}
            </div>
            {p.title && (
              <button
                onClick={() => setFocusedPost(p)}
                className="mt-1 block text-left hover:underline"
              >
                <h3 className="font-semibold text-[#202124]">{p.title}</h3>
              </button>
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
              <CommunityPostAttachments
                attachments={p.attachments}
                brand={brand}
                className="mt-2"
              />
            )}
            {p.poll && (
              <CommunityPollCard
                poll={p.poll}
                brand={brand}
                onVote={(optionIds) => submitVote(p.id, optionIds)}
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
              <button
                onClick={() =>
                  setExpandedComments(expandedComments === p.id ? null : p.id)
                }
                className="flex items-center gap-1 hover:text-[#202124]"
                aria-expanded={expandedComments === p.id}
              >
                <MessageCircle className="h-4 w-4" />
                {expandedComments === p.id
                  ? "Hide comments"
                  : `${p.commentCount} comments`}
              </button>
            </div>
            {expandedComments === p.id && (
              <InlineCommentThread
                saId={saId}
                groupId={groupId}
                groupSlug={groupSlug}
                brand={brand}
                communityName={communityName}
                categories={categories}
                pretty={pretty}
                staffGroupId={staffGroupId}
                post={p}
                viewer={viewer}
              />
            )}
          </div>
          {(canModerate || canDelete || canEdit) && (
            <ActionsMenu
              items={[
                { label: "Open post", onClick: () => setFocusedPost(p) },
                {
                  label: "Copy link",
                  onClick: async () => {
                    await navigator.clipboard.writeText(
                      new URL(detail, window.location.origin).toString()
                    );
                    toast.success("Link copied");
                  },
                },
                ...(canEdit
                  ? [
                      {
                        label: "Edit post",
                        onClick: () => setEditingPostId(p.id),
                      },
                    ]
                  : []),
                ...(canModerate
                  ? [
                      {
                        label: p.pinned
                          ? "Unpin from All Posts"
                          : "Pin to All Posts",
                        onClick: () => togglePin(p, "allPosts"),
                      },
                      // A post with no channel/category can't be pinned to
                      // one — hidden entirely rather than shown disabled.
                      ...(p.category
                        ? [
                            {
                              label: p.pinnedToChannel
                                ? "Unpin from Channel"
                                : "Pin to Channel",
                              onClick: () => togglePin(p, "channel"),
                            },
                          ]
                        : []),
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
  }

  return (
    <div className="space-y-4">
      {focusedPost && (
        <FocusedPostOverlay
          saId={saId}
          groupId={groupId}
          groupSlug={groupSlug}
          brand={brand}
          communityName={communityName}
          categories={categories}
          pretty={pretty}
          staffGroupId={staffGroupId}
          post={focusedPost}
          viewer={viewer}
          onClose={() => setFocusedPost(null)}
        />
      )}
      {/* Modal composer launcher (Phase D, Part 2) — a lightweight
          affordance, not the composer itself. Clicking opens the full
          `PostComposer` modal; this button never turns into a composer
          inline the way it used to. Permission/channel-awareness is
          unchanged — anything that could post before can still open this
          (server-side enforcement is what actually gates posting, same as
          always), this is purely the entry point. */}
      <div className="flex w-full items-center gap-3 rounded-xl border border-[#E4E4E4] bg-white p-4 hover:border-[#d4d4d4]">
        <button
          type="button"
          id="community-composer-trigger"
          onClick={() => setComposerOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <MemberAvatar author={viewer} size={36} brand={brand} />
          <span className="text-sm text-[#909090]">
            What do you want to share today?
          </span>
        </button>
        {viewer.role === "moderator" && (
          <button
            type="button"
            onClick={() => setGoLiveOpen(true)}
            className="hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
          >
            <Video className="h-4 w-4" /> Go Live
          </button>
        )}
      </div>
      {goLiveOpen && viewer.role === "moderator" && (
        <QuickGoLiveSetup
          saId={saId}
          groupId={groupId}
          categories={categories}
          filter={filter}
          onClose={() => setGoLiveOpen(false)}
          onCreated={(roomId) => {
            setGoLiveOpen(false);
            const href = staffGroupId
              ? `/sa/${saId}/community/${staffGroupId}/live/${roomId}`
              : pretty
                ? `/communities/${groupSlug}/live/${roomId}`
                : `/c/${saId}/${groupSlug}/live/${roomId}`;
            window.location.assign(href);
          }}
        />
      )}
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
              sort === s
                ? "text-[#202124]"
                : "border-transparent text-[#909090] hover:text-[#202124]"
            )}
            style={
              sort === s
                ? { borderColor: brand }
                : { borderColor: "transparent" }
            }
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
            <div
              className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
              style={{ color: brand }}
            >
              <Pin className="h-3.5 w-3.5 fill-current" /> Featured Posts
            </div>
            {featuredPosts.map((p) => renderPostCard(p, "featured"))}
          </div>
        )}

        {/* Channel pinned posts — only while viewing that one channel (Part
          2), a completely separate section from Featured Posts above. */}
        {channelPinnedPosts.length > 0 && (
          <div className="space-y-3">
            <div
              className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
              style={{ color: brand }}
            >
              <Pin className="h-3.5 w-3.5 fill-current" /> Pinned in {filter}
            </div>
            {channelPinnedPosts.map((p) => renderPostCard(p, "channelPinned"))}
          </div>
        )}

        {visible.length === 0 &&
        featuredPosts.length === 0 &&
        channelPinnedPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
            Nothing here yet. Be the first to post.
          </div>
        ) : (
          visible.length > 0 && (
            <div className="space-y-3">
              {visible.map((p) => renderPostCard(p, "regular"))}
            </div>
          )
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
