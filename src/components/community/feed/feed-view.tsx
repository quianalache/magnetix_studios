"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, Mic, MessageCircle, Pin, ThumbsUp, X } from "lucide-react";
import type { AuthorView } from "@/types/community";
import type { ImageAttachment, MediaAttachment, VoiceNote } from "@/types/media-attachment";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostEditor } from "@/components/community/feed/community-post-editor";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { CommunityPostAttachments } from "@/components/community/feed/community-post-attachments";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import {
  deleteCommunityPostImage,
  uploadCommunityPostImage,
} from "@/lib/community/upload-community-image";
import { deleteVoiceNote } from "@/lib/community/upload-voice-note";
import { MAX_IMAGES_PER_POST } from "@/lib/community/community-image-mime";
import { communityPostHref } from "@/lib/community/routes";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { cn } from "@/lib/utils";

export interface ClientPost {
  id: string;
  authorMemberId: string;
  title: string;
  body: string;
  attachments?: MediaAttachment[];
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
                      <CommunityPostBody html={p.body} brand={brand} clamp className={cn(p.title ? "mt-0.5" : "mt-1")} />
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

  // Phase C: images upload immediately on selection (not deferred to
  // submit), so a member sees a real preview/error per file right away.
  // Voice notes reuse VoiceNoteRecorder's own record->preview->upload flow
  // unchanged — this component only decides what happens with the
  // resulting VoiceNote.
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function handleImageFiles(files: FileList) {
    const remaining = MAX_IMAGES_PER_POST - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES_PER_POST} images.`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    if (files.length > toUpload.length) {
      toast.error(`Only attaching the first ${toUpload.length} — max ${MAX_IMAGES_PER_POST} images per post.`);
    }
    setImageUploading(true);
    for (const file of toUpload) {
      try {
        const img = await uploadCommunityPostImage({ saId, file });
        setImages((prev) => [...prev, img]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image upload failed");
      }
    }
    setImageUploading(false);
  }

  // Removing an already-uploaded draft attachment cleans up its Storage
  // object right away — the whole point of uploading eagerly is that we
  // must not leave it orphaned if the member changes their mind before
  // ever submitting the post.
  function removeImage(img: ImageAttachment) {
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    void deleteCommunityPostImage(saId, img.storagePath).catch(() => {
      /* best-effort cleanup; already removed from the draft either way */
    });
  }

  function removeVoiceNote() {
    if (!voiceNote) return;
    void deleteVoiceNote(saId, voiceNote.storagePath).catch(() => {
      /* best-effort cleanup */
    });
    setVoiceNote(null);
  }

  function cleanupDraftAttachments() {
    images.forEach((img) => void deleteCommunityPostImage(saId, img.storagePath).catch(() => {}));
    if (voiceNote) void deleteVoiceNote(saId, voiceNote.storagePath).catch(() => {});
  }

  function resetComposer() {
    setTitle("");
    setBody("");
    setToolbarOpen(false);
    setImages([]);
    setVoiceNote(null);
    setShowRecorder(false);
    setOpen(false);
  }

  function handleCancel() {
    cleanupDraftAttachments();
    resetComposer();
  }

  async function submit() {
    const trimmedTitle = title.trim();
    const attachments: MediaAttachment[] = [
      ...images.map((image): MediaAttachment => ({ kind: "image", image })),
      ...(voiceNote ? [{ kind: "voice", voice: voiceNote } as MediaAttachment] : []),
    ];
    // A post is valid with visible text OR at least one attachment — an
    // image/voice-only post is real content, not an empty post. `body` is
    // HTML now, not plain text, so check VISIBLE content length, not
    // raw-string truthiness (an empty TipTap doc is still `<p></p>`).
    if (aboutPlainTextLength(body) === 0 && attachments.length === 0) {
      toast.error("Write something, or attach a photo or voice note");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, body, category, attachments }),
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
      // goes through the real server-side sanitizer regardless. Same for
      // attachments — they're already real, uploaded, server-validated
      // objects by this point, not user-typed content.
      onCreated({
        id: d.post.id,
        authorMemberId: viewer.memberId,
        title: trimmedTitle,
        body,
        attachments,
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
      resetComposer();
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

      {(images.length > 0 || imageUploading) && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => removeImage(img)}
                title="Remove image"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {imageUploading && (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-[#E4E4E4]">
              <Loader2 className="h-4 w-4 animate-spin text-[#909090]" />
            </div>
          )}
        </div>
      )}

      {showRecorder && !voiceNote && (
        <div className="mt-2">
          {/* "Attach" here, not "Send" — inside a post composer, a
              separate inner "Send" followed by an outer "Post" button
              read as two sends and confused whether the recording had
              actually made it into the draft (Phase C QA correction).
              This is a label/icon override on the SAME reusable
              recorder — a future DM integration keeps the component's
              own default "Send" wording, unchanged. */}
          <VoiceNoteRecorder
            saId={saId}
            brand={brand}
            confirmLabel="Attach"
            confirmIcon={Check}
            onUploaded={(vn) => {
              setVoiceNote(vn);
              setShowRecorder(false);
            }}
          />
        </div>
      )}
      {voiceNote && (
        <div className="mt-2 space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Voice note attached to this post
          </p>
          <div className="flex items-center gap-2">
            <VoiceNotePlayer url={voiceNote.url} durationMs={voiceNote.durationMs} brand={brand} />
            <button
              type="button"
              onClick={removeVoiceNote}
              title="Remove voice note"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#909090] hover:text-[#202124]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={images.length >= MAX_IMAGES_PER_POST || imageUploading}
            title="Add photo"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E4E4E4] text-[#909090] hover:text-[#202124] disabled:opacity-40"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleImageFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {!voiceNote && (
            <button
              type="button"
              onClick={() => setShowRecorder((o) => !o)}
              disabled={!!voiceNote}
              aria-pressed={showRecorder}
              title="Add voice note"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                showRecorder
                  ? "border-transparent text-white"
                  : "border-[#E4E4E4] text-[#909090] hover:text-[#202124]",
              )}
              style={showRecorder ? { backgroundColor: brand } : undefined}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
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
            onClick={handleCancel}
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
