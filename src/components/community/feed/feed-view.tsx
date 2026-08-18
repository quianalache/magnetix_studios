"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageCircle, Pin, ThumbsUp } from "lucide-react";
import type { AuthorView } from "@/types/community";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostEditor } from "@/components/community/feed/community-post-editor";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { communityPostHref } from "@/lib/community/routes";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { cn } from "@/lib/utils";

export interface ClientPost {
  id: string;
  authorMemberId: string;
  title: string;
  body: string;
  category: string | null;
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
  const [sort, setSort] = useState<"latest" | "top" | "unanswered">("latest");
  // Category filter is driven by the left nav's `?c=` link (Part 7) rather
  // than an in-feed pill row, so there's one control for it, not two.
  const searchParams = useSearchParams();
  const filter = searchParams.get("c") ?? "All";

  function prependPost(post: ClientPost) {
    setPosts((prev) => [post, ...prev]);
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
      <Composer
        saId={saId}
        groupId={groupId}
        brand={brand}
        categories={categories}
        viewer={viewer}
        onCreated={prependPost}
      />

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
              const detail = communityPostHref({ saId, pretty }, groupSlug, p.id);
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
                        <span className="text-xs text-[#909090]">
                          {timeAgo(p.createdAtMs)}
                        </span>
                        {p.category && (
                          <span className="text-xs text-[#909090]">
                            · {p.category}
                          </span>
                        )}
                      </div>
                      <Link href={detail} className="mt-1 block">
                        {p.title && (
                          <h3 className="font-semibold text-[#202124]">
                            {p.title}
                          </h3>
                        )}
                        <CommunityPostBody html={p.body} brand={brand} clamp className="mt-0.5" />
                      </Link>
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
                    {(canModerate || canDelete) && (
                      <ActionsMenu
                        items={[
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

function Composer({
  saId,
  groupId,
  brand,
  categories,
  viewer,
  onCreated,
}: {
  saId: string;
  groupId: string;
  brand: string;
  categories: string[];
  viewer: Viewer;
  onCreated: (post: ClientPost) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(""); // rich HTML from CommunityPostEditor
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [category, setCategory] = useState(categories[0] ?? "General");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmedTitle = title.trim();
    // `body` is HTML now, not plain text — check VISIBLE content length,
    // not raw-string truthiness (an empty TipTap doc is still `<p></p>`,
    // which is a truthy string with zero visible characters).
    if (aboutPlainTextLength(body) === 0) {
      toast.error("Write something first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, body, category }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !d.ok || !d.post?.id) {
        throw new Error(d.error ?? "Couldn't post");
      }
      // Optimistic: drop the real created post (we have its id) into the feed
      // immediately — no server round-trip / re-render to wait on. Safe to
      // render this HTML directly (CommunityPostBody doesn't re-sanitize):
      // it came straight from TipTap's own schema-constrained output, not
      // arbitrary input — every subsequent fetch (refresh, other viewers)
      // goes through the real server-side sanitizer regardless.
      onCreated({
        id: d.post.id,
        authorMemberId: viewer.memberId,
        title: trimmedTitle,
        body,
        category: categories.includes(category) ? category : null,
        pinned: false,
        likeCount: 0,
        commentCount: 0,
        createdAtMs: Date.now(),
        author: {
          memberId: viewer.memberId,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        },
        likedByViewer: false,
      });
      setTitle("");
      setBody("");
      setToolbarOpen(false);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        id="community-composer-trigger"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-[#E4E4E4] bg-white p-4 text-left text-sm text-[#909090] hover:border-[#d4d4d4]"
      >
        Write something…
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full border-0 p-0 text-base font-semibold text-[#202124] outline-none placeholder:text-[#b4b4b4]"
        autoFocus
      />
      <div className="mt-2">
        <CommunityPostEditor value={body} onChange={setBody} toolbarOpen={toolbarOpen} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0f0f0] pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setToolbarOpen((o) => !o)}
            aria-pressed={toolbarOpen}
            title="Formatting"
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
              toolbarOpen
                ? "border-transparent text-white"
                : "border-[#E4E4E4] text-[#909090] hover:text-[#202124]",
            )}
            style={toolbarOpen ? { backgroundColor: brand } : undefined}
          >
            Aa
          </button>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-[#E4E4E4] bg-white px-2 py-1 text-xs text-[#3a3a44]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(false)}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[#909090] hover:text-[#202124]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
