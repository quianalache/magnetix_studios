"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import type { IGif } from "@giphy/js-types";
import { Gif } from "@giphy/react-components";
import {
  AtSign,
  Check,
  FileUp,
  Hash,
  ImagePlus,
  ListChecks,
  Loader2,
  Mic,
  Video,
  X,
} from "lucide-react";
import type {
  FileAttachment,
  ImageAttachment,
  MediaAttachment,
  VideoLinkAttachment,
  VoiceNote,
} from "@/types/media-attachment";
import type { FeedPoll } from "@/types/community";
import { CommunityPostEditor, COMMUNITY_POST_TOOLBAR } from "@/components/community/feed/community-post-editor";
import { RichTextToolbar } from "@/components/editor/rich-text-toolbar-items";
import { MemberAvatar } from "@/components/community/member-avatar";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { AddVideoPopover } from "@/components/community/feed/add-video-popover";
import { EmojiPickerButton } from "@/components/community/feed/emoji-picker-button";
import { ComposerActionIconButton } from "@/components/community/feed/composer-action-icon-button";
import { GiphyPickerButton } from "@/components/community/feed/giphy-picker-button";
import {
  CreatePollSheet,
  emptyPollDraft,
  type PollDraftState,
} from "@/components/community/feed/create-poll-sheet";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { getGiphyFetch } from "@/lib/community/giphy-client";
import {
  deleteCommunityPostImage,
  uploadCommunityPostImage,
} from "@/lib/community/upload-community-image";
import { deleteVoiceNote } from "@/lib/community/upload-voice-note";
import { deleteCommunityPostFile, uploadCommunityPostFile } from "@/lib/community/upload-community-file";
import { MAX_IMAGES_PER_POST } from "@/lib/community/community-image-mime";
import { MAX_FILES_PER_POST, formatFileSize } from "@/lib/community/community-file-mime";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import type { MentionSuggestionItem } from "@/components/editor/mention-suggestion";
import type { ClientPost } from "./feed-view";

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

type SessionUpload = { storagePath: string; kind: "image" | "voice" | "file" };

/** `FeedPoll` (server's viewer-safe read shape) -> `PollDraftState` (this
 *  sheet's edit shape) — used only when opening the Poll sheet on a post
 *  that already has one. `showResults`/`endsAtMs` are always populated
 *  here because only a moderator (who always has `resultsVisible: true`)
 *  can reach poll-editing in the first place. */
function feedPollToDraft(poll: FeedPoll): PollDraftState {
  return {
    options: poll.options.map((o) => ({ id: o.id, text: o.text })),
    allowMultiple: poll.allowMultiple,
    showResults: poll.showResults,
    endsAt: poll.endsAtMs ? msToDatetimeLocal(poll.endsAtMs) : "",
  };
}

function msToDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `PollDraftState` -> the raw shape `normalizePollDraft` (server) expects.
 *
 * `draft.endsAt` is a `<input type="datetime-local">` value — a
 * timezone-NAIVE string ("2026-08-18T23:37", no offset). Found live during
 * QA: sending that string as-is let the SERVER'S `new Date(...)` decide
 * what timezone it means, and a serverless function's runtime timezone
 * (typically UTC) is essentially never the same as the browser's — a
 * moderator in EDT picking "1 hour from now" was silently sending a
 * timestamp the server read as 1 hour from now IN UTC, ~4 hours off,
 * sometimes landing in the past outright ("must be in the future" on an
 * end date the moderator had just picked as clearly future). The fix has
 * to happen HERE, client-side, where `new Date(localString)` still
 * correctly resolves against the BROWSER's own local timezone (the one
 * the moderator actually picked in) — converting to `.toISOString()`
 * before it ever leaves the browser makes the instant unambiguous, so the
 * server's own `new Date(...)` parses the exact same moment regardless of
 * what timezone it happens to run in. */
function draftToApiPayload(draft: PollDraftState) {
  return {
    options: draft.options.map((o) => ({ text: o.text })),
    allowMultiple: draft.allowMultiple,
    showResults: draft.showResults,
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
  };
}

/** Extracts this post's/comment's persisted GIF attachment, if any — used
 *  once here (to seed the resolve-on-open effect below) rather than
 *  inline at every call site. */
function existingGifAttachment(attachments: MediaAttachment[]) {
  return attachments.find((a): a is Extract<MediaAttachment, { kind: "gif" }> => a.kind === "gif")?.gif ?? null;
}

/**
 * ONE shared post composer/editor — mounted by `feed-view.tsx`'s launcher
 * flow (`mode="create"`) AND by the post-detail page's Edit Post flow
 * (`mode="edit"`, `editingPost` supplied). Not a second EditPost editor.
 *
 * Modal composer (Phase D) — rebuilt from an inline feed card into a real
 * modal: a `Sheet` using the same proven `side="bottom"` + desktop-
 * centering override pattern `CreatePollSheet` already established (full-
 * bleed bottom sheet on mobile, a centered wide panel on desktop — see the
 * className comment below for exactly why the `sm:data-[side=bottom]:*`
 * qualifiers are required, not optional). The caller controls mounting the
 * same way it always did (only rendered while `open`), which is what
 * still gives every field below a clean, freshly-initialized starting
 * state on every open — no separate "reset on reopen" effect needed.
 *
 * Also folds in the GIPHY GIF integration and the Part 4/5 action-system
 * rebuild:
 *  - Formatting is now a PERMANENTLY VISIBLE `RichTextToolbar` rendered
 *    directly above the editor (Part 4) — no more "Aa" popover toggle.
 *  - Photo/video/voice/file/GIF/mention/channel-ref/poll are each their
 *    own always-visible, tooltipped icon button (Part 5) — no more
 *    consolidated `+` popover menu. (Comments keep their own `+` menu —
 *    this change is scoped to the full post composer only.)
 *  - GIF uses the shared, PostComposer-independent `GiphyPickerButton` /
 *    `GiphyPicker` — see giphy-client.ts for the compliance rationale.
 *
 * Edit-mode attachment lifecycle (the "safe edit transaction") is
 * UNCHANGED by any of this — see the inline comments below, still exactly
 * as before. GIF is the one attachment kind that was never part of that
 * lifecycle to begin with (Part 13): there's no Storage object behind a
 * GIF at all, so removing/replacing one is just a state update, never a
 * cleanup call.
 */
export function PostComposer({
  saId,
  groupId,
  brand,
  communityName,
  categories,
  viewer,
  mode,
  editingPost,
  initialCategory,
  open,
  onCreated,
  onSaved,
  onCancel,
}: {
  saId: string;
  groupId: string;
  brand: string;
  /** Part 3's "for [Community Name]" header line. */
  communityName: string;
  categories: string[];
  viewer: Viewer;
  mode: "create" | "edit";
  editingPost?: ClientPost;
  /** Create mode only — defaults the channel selector to whatever channel
   *  the member was viewing when they opened the composer (Part 3), e.g.
   *  the feed's `?c=` filter. Ignored in edit mode (the post's own
   *  existing category always wins there). */
  initialCategory?: string;
  /** Purely drives the Sheet's own open/enter-animation state — this
   *  component is only ever mounted while it should be visible, so this is
   *  always `true` in practice, but the Sheet primitive still wants it. */
  open: boolean;
  onCreated?: (post: ClientPost) => void;
  onSaved?: (post: ClientPost) => void;
  onCancel: () => void;
}) {
  const initialAttachments = editingPost?.attachments ?? [];
  const [title, setTitle] = useState(editingPost?.title ?? "");
  const [body, setBody] = useState(editingPost?.body ?? "");
  const [category, setCategory] = useState(
    editingPost?.category ?? initialCategory ?? categories[0] ?? "General",
  );
  const [commentsDisabled, setCommentsDisabled] = useState(editingPost?.commentsDisabled === true);
  const [saving, setSaving] = useState(false);

  const [images, setImages] = useState<ImageAttachment[]>(
    initialAttachments.filter((a): a is Extract<MediaAttachment, { kind: "image" }> => a.kind === "image").map((a) => a.image),
  );
  const [imageUploading, setImageUploading] = useState(false);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(
    initialAttachments.find((a): a is Extract<MediaAttachment, { kind: "voice" }> => a.kind === "voice")?.voice ?? null,
  );
  const [showRecorder, setShowRecorder] = useState(false);
  const [files, setFiles] = useState<FileAttachment[]>(
    initialAttachments.filter((a): a is Extract<MediaAttachment, { kind: "file" }> => a.kind === "file").map((a) => a.file),
  );
  const [fileUploading, setFileUploading] = useState(false);
  const [videoLinks, setVideoLinks] = useState<VideoLinkAttachment[]>(
    initialAttachments.filter((a): a is Extract<MediaAttachment, { kind: "video-link" }> => a.kind === "video-link").map((a) => a.videoLink),
  );

  // GIF (Phase D) — holds the FULL GIPHY object the picker returned, not
  // just an id, so the preview below can render it immediately via the
  // official `Gif` component without a round-trip. On edit mode with an
  // already-attached GIF, only `providerId`/`title` exist in
  // `editingPost` (that's all that's ever persisted — see
  // media-attachment.ts) — resolve it back to the full object once, on
  // mount, exactly like the render-side resolver does, just not batched
  // (a composer only ever has at most one GIF).
  const existingGif = existingGifAttachment(initialAttachments);
  const [gif, setGif] = useState<IGif | null>(null);
  const [gifResolving, setGifResolving] = useState(!!existingGif);
  useEffect(() => {
    if (!existingGif) return;
    const gf = getGiphyFetch();
    if (!gf) {
      setGifResolving(false);
      return;
    }
    let cancelled = false;
    gf.gif(existingGif.providerId)
      .then(({ data }) => {
        if (!cancelled) setGif(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setGifResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only — this composer instance never gets handed a different
    // `editingPost` mid-life (see the module comment on remount-per-open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeGif() {
    // No Storage object behind a GIF (Part 13) — this is just a draft
    // state update, unlike every other attachment kind's remove handler.
    setGif(null);
  }

  // Polls — held as local draft state, same "not persisted until Post/
  // Save Changes" convention as every other attachment kind above. `null`
  // = no poll attached. The moderator gate is enforced both here (icon
  // hidden) and server-side (the route independently checks
  // `access.membership.role`).
  const [poll, setPoll] = useState<PollDraftState | null>(
    editingPost?.poll ? feedPollToDraft(editingPost.poll) : null,
  );
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const pollLocked = (editingPost?.poll?.voterCount ?? 0) > 0;
  const canManagePoll = viewer.role === "moderator";

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  // Edit-mode-only bookkeeping — see the module comment for why this is a
  // ref (must survive add/remove without re-render churn) rather than
  // derived from `images`/`voiceNote`/`files` state.
  const sessionUploadsRef = useRef<SessionUpload[]>([]);

  async function mentionFetchItems(query: string): Promise<MentionSuggestionItem[]> {
    const res = await fetch(
      `/api/community/${saId}/${groupId}/mention-members?q=${encodeURIComponent(query)}`,
    );
    const d = (await res.json().catch(() => ({}))) as {
      members?: { id: string; label: string; avatarUrl: string | null }[];
    };
    return d.members ?? [];
  }

  // Channel refs suggest from THIS group's own categories — already known
  // client-side (the `categories` prop), so no round-trip needed, unlike
  // mentions.
  async function channelRefFetchItems(query: string): Promise<MentionSuggestionItem[]> {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => !q || c.toLowerCase().includes(q))
      .map((c) => ({ id: c, label: c }));
  }

  // Part 5's "programmatically insert @/# and trigger the existing
  // suggestion dropdown" — TipTap's suggestion plugin watches document
  // transactions for its trigger char, not raw keystrokes, so inserting
  // the character at the cursor opens the SAME dropdown a member typing
  // it manually would get. No second suggestion system.
  function insertMentionTrigger() {
    editor?.chain().focus().insertContent("@").run();
  }
  function insertChannelRefTrigger() {
    editor?.chain().focus().insertContent("#").run();
  }

  async function handleImageFiles(fileList: FileList) {
    const remaining = MAX_IMAGES_PER_POST - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES_PER_POST} images.`);
      return;
    }
    const toUpload = Array.from(fileList).slice(0, remaining);
    if (fileList.length > toUpload.length) {
      toast.error(`Only attaching the first ${toUpload.length} — max ${MAX_IMAGES_PER_POST} images per post.`);
    }
    setImageUploading(true);
    for (const file of toUpload) {
      try {
        const img = await uploadCommunityPostImage({ saId, file });
        setImages((prev) => [...prev, img]);
        if (mode === "edit") sessionUploadsRef.current.push({ storagePath: img.storagePath, kind: "image" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image upload failed");
      }
    }
    setImageUploading(false);
  }

  function removeImage(img: ImageAttachment) {
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    if (mode === "create") {
      // Eager cleanup — the whole point of uploading immediately in
      // create mode is that nothing must be left orphaned if the member
      // changes their mind before ever submitting the post.
      void deleteCommunityPostImage(saId, img.storagePath).catch(() => {});
    }
    // edit mode: deliberately deferred — see the module comment.
  }

  function removeVoiceNote() {
    if (!voiceNote) return;
    if (mode === "create") {
      void deleteVoiceNote(saId, voiceNote.storagePath).catch(() => {});
    }
    setVoiceNote(null);
  }

  async function handleFileSelect(fileList: FileList) {
    const remaining = MAX_FILES_PER_POST - files.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_FILES_PER_POST} files.`);
      return;
    }
    const toUpload = Array.from(fileList).slice(0, remaining);
    setFileUploading(true);
    for (const file of toUpload) {
      try {
        const f = await uploadCommunityPostFile({ saId, file });
        setFiles((prev) => [...prev, f]);
        if (mode === "edit") sessionUploadsRef.current.push({ storagePath: f.storagePath, kind: "file" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "File upload failed");
      }
    }
    setFileUploading(false);
  }

  function removeFile(f: FileAttachment) {
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    if (mode === "create") {
      void deleteCommunityPostFile(saId, f.storagePath).catch(() => {});
    }
  }

  function removeVideoLink(v: VideoLinkAttachment) {
    // No Storage object at all for a video link — nothing to clean up in
    // either mode, just remove it from the draft.
    setVideoLinks((prev) => prev.filter((x) => x.id !== v.id));
  }

  function cleanupDraftAttachments() {
    // Create-mode cancel cleanup — unchanged from Phase C. Deletes
    // whatever's STILL in local state (anything already removed was
    // already deleted eagerly by the remove handlers above). GIF is
    // deliberately absent here — there's no Storage object behind one.
    images.forEach((img) => void deleteCommunityPostImage(saId, img.storagePath).catch(() => {}));
    if (voiceNote) void deleteVoiceNote(saId, voiceNote.storagePath).catch(() => {});
    files.forEach((f) => void deleteCommunityPostFile(saId, f.storagePath).catch(() => {}));
  }

  async function cleanupSessionUploads(keepStoragePaths: Set<string>) {
    const orphaned = sessionUploadsRef.current.filter((u) => !keepStoragePaths.has(u.storagePath));
    await Promise.allSettled(
      orphaned.map((u) => {
        if (u.kind === "image") return deleteCommunityPostImage(saId, u.storagePath);
        if (u.kind === "voice") return deleteVoiceNote(saId, u.storagePath);
        return deleteCommunityPostFile(saId, u.storagePath);
      }),
    );
  }

  function handleCancel() {
    if (mode === "create") {
      cleanupDraftAttachments();
    } else {
      // Everything uploaded THIS session is orphaned on cancel — the
      // original post (and every attachment it already had) was never
      // touched, so there's nothing to "restore".
      void cleanupSessionUploads(new Set());
    }
    onCancel();
  }

  function buildAttachments(): MediaAttachment[] {
    return [
      ...images.map((image): MediaAttachment => ({ kind: "image", image })),
      ...(voiceNote ? [{ kind: "voice", voice: voiceNote } as MediaAttachment] : []),
      ...files.map((file): MediaAttachment => ({ kind: "file", file })),
      ...videoLinks.map((videoLink): MediaAttachment => ({ kind: "video-link", videoLink })),
      ...(gif
        ? [
            {
              kind: "gif",
              gif: {
                id: existingGif?.providerId === String(gif.id) ? existingGif.id : crypto.randomUUID(),
                provider: "giphy",
                providerId: String(gif.id),
                title: gif.title || undefined,
                authorMemberId: viewer.memberId,
                createdAt: Date.now(),
              },
            } as MediaAttachment,
          ]
        : []),
    ];
  }

  async function submit() {
    const trimmedTitle = title.trim();
    const attachments = buildAttachments();
    if (aboutPlainTextLength(body) === 0 && attachments.length === 0 && !poll) {
      toast.error("Write something, attach a photo, file, video, GIF, or voice note, or add a poll");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch(`/api/community/${saId}/${groupId}/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedTitle,
            body,
            category,
            attachments,
            commentsDisabled,
            poll: poll ? draftToApiPayload(poll) : null,
          }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          post?: { id: string; poll?: unknown };
        };
        if (!res.ok || !d.ok || !d.post?.id) {
          throw new Error(d.error ?? "Couldn't post");
        }
        // Optimistic: drop the real created post (we have its id) into the
        // feed immediately — safe to render this HTML/attachments directly
        // (CommunityPostBody doesn't re-sanitize): it came straight from
        // TipTap's own schema-constrained output and already-uploaded,
        // server-validated attachment objects, not arbitrary input. Poll
        // is NOT built optimistically from the local draft the same way —
        // it needs the server's own `FeedPoll` view (option ids, the
        // viewer's own moderator-visible counts), so a poll-bearing post
        // waits for the real response instead of guessing.
        onCreated?.({
          id: d.post.id,
          authorMemberId: viewer.memberId,
          title: trimmedTitle,
          body,
          attachments,
          category: categories.includes(category) ? category : null,
          commentsDisabled,
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
          poll: (d.post.poll as ClientPost["poll"]) ?? undefined,
        });
      } else {
        if (!editingPost) return;
        const res = await fetch(`/api/community/${saId}/${groupId}/posts/${editingPost.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edit: {
              title: trimmedTitle,
              body,
              category,
              attachments,
              commentsDisabled,
              // Only a moderator can ever change this (icon hidden
              // otherwise), but always send the CURRENT draft state so a
              // moderator's edit session is a full "what should this post
              // look like now" save, same as title/body/attachments —
              // not a diff. `undefined` (key omitted) for a non-moderator
              // editing their own post leaves whatever poll already
              // existed (there can't be one they could have created)
              // completely untouched server-side.
              ...(canManagePoll ? { poll: poll ? draftToApiPayload(poll) : null } : {}),
            },
          }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          post?: { id: string; poll?: unknown };
        };
        if (!res.ok || !d.ok || !d.post?.id) {
          throw new Error(d.error ?? "Couldn't save changes");
        }
        const finalPaths = new Set(
          attachments
            .map((a) => (a.kind === "image" ? a.image.storagePath : a.kind === "file" ? a.file.storagePath : a.kind === "voice" ? a.voice.storagePath : null))
            .filter((p): p is string => !!p),
        );
        await cleanupSessionUploads(finalPaths);
        onSaved?.({
          ...editingPost,
          title: trimmedTitle,
          body,
          attachments,
          category: categories.includes(category) ? category : null,
          commentsDisabled,
          poll: (d.post.poll as ClientPost["poll"]) ?? editingPost.poll,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton
        // Desktop centering — MUST be qualified with `data-[side=bottom]:`
        // on every override, not just `sm:` (see create-poll-sheet.tsx's
        // identical comment for exactly why a bare `sm:` rule silently
        // loses to SheetContent's own compound base-class selectors).
        // Wider than the Poll sheet (`max-w-2xl` vs `max-w-md`) — this is
        // a full post editor, not a handful of option rows.
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:left-1/2 sm:data-[side=bottom]:right-auto sm:data-[side=bottom]:w-full sm:data-[side=bottom]:max-w-2xl sm:data-[side=bottom]:-translate-x-1/2 sm:data-[side=bottom]:rounded-t-2xl"
      >
        <SheetHeader className="shrink-0 border-b border-[#f0f0f0] px-4 py-3 sm:px-5">
          <SheetTitle>{mode === "create" ? "Create post" : "Edit post"}</SheetTitle>
          <div className="mt-2 flex items-center gap-3">
            <MemberAvatar author={viewer} size={40} brand={brand} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#202124]">{viewer.displayName}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#909090]">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Channel"
                  className="rounded-md border border-[#E4E4E4] bg-white px-1.5 py-0.5 text-xs text-[#3a3a44]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span>for {communityName}</span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full border-0 p-0 text-base font-semibold text-[#202124] outline-none placeholder:text-[#b4b4b4]"
            autoFocus
          />

          {/* Formatting toolbar — PERMANENTLY visible above the writing
              surface (Part 4), not behind an "Aa" popover toggle anymore.
              "Description -> toolbar -> writing surface" hierarchy. */}
          <div className="mt-2 overflow-hidden rounded-lg border border-[#E4E4E4]">
            {editor && <RichTextToolbar editor={editor} items={COMMUNITY_POST_TOOLBAR} />}
            <div className="px-3 py-2">
              <CommunityPostEditor
                value={body}
                onChange={setBody}
                brand={brand}
                mentions={{ fetchItems: mentionFetchItems }}
                channelRefs={{ fetchItems: channelRefFetchItems }}
                onEditorReady={setEditor}
              />
            </div>
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

          {(files.length > 0 || fileUploading) && (
            <div className="mt-2 space-y-1.5">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] bg-[#FAFAFA] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-[#3a3a44]">
                    {f.fileName} <span className="text-[#909090]">· {formatFileSize(f.fileSizeBytes)}</span>
                  </span>
                  <button type="button" onClick={() => removeFile(f)} title="Remove file" className="text-[#909090] hover:text-[#202124]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {fileUploading && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#E4E4E4] px-3 py-2 text-xs text-[#909090]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </div>
              )}
            </div>
          )}

          {videoLinks.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {videoLinks.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] bg-[#FAFAFA] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs capitalize text-[#3a3a44]">{v.provider} video attached</span>
                  <button type="button" onClick={() => removeVideoLink(v)} title="Remove video" className="text-[#909090] hover:text-[#202124]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(gif || gifResolving) && (
            <div className="mt-2 max-w-[220px]">
              {gifResolving ? (
                <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-[#F0F0F0]" />
              ) : (
                gif && (
                  <div className="group relative overflow-hidden rounded-lg">
                    <GifPreview gif={gif} />
                    <button
                      type="button"
                      onClick={removeGif}
                      title="Remove GIF"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {showRecorder && !voiceNote && (
            <div className="mt-2">
              {/* "Attach" here, not "Send" — inside a post composer, a
                  separate inner "Send" followed by an outer "Post"/"Save
                  Changes" button read as two sends. Label/icon override on
                  the same reusable recorder — a future DM integration keeps
                  the component's own default "Send" wording, unchanged. */}
              <VoiceNoteRecorder
                saId={saId}
                brand={brand}
                confirmLabel="Attach"
                confirmIcon={Check}
                onUploaded={(vn) => {
                  setVoiceNote(vn);
                  setShowRecorder(false);
                  if (mode === "edit") sessionUploadsRef.current.push({ storagePath: vn.storagePath, kind: "voice" });
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

          {poll && (
            <div className="mt-2 rounded-lg border border-[#E4E4E4] bg-[#FAFAFA] px-3 py-2">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 shrink-0 text-[#909090]" />
                <span className="min-w-0 flex-1 truncate text-xs text-[#3a3a44]">
                  Poll attached · {poll.options.filter((o) => o.text.trim()).length} options
                  {pollLocked && " · has votes"}
                </span>
                <button
                  type="button"
                  onClick={() => setPollSheetOpen(true)}
                  className="shrink-0 text-xs font-medium text-[#606060] hover:text-[#202124]"
                >
                  Edit
                </button>
                {!pollLocked && (
                  <button
                    type="button"
                    onClick={() => setPoll(null)}
                    title="Remove poll"
                    className="shrink-0 text-[#909090] hover:text-[#202124]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <label className="mt-3 flex items-center gap-2 text-xs text-[#606060]">
            <input
              type="checkbox"
              checked={!commentsDisabled}
              onChange={(e) => setCommentsDisabled(!e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#E4E4E4]"
            />
            Allow comments/replies
          </label>

          {/* Action row — every action is its OWN always-visible,
              tooltipped icon button (Part 5). No more "+" popover. */}
          <TooltipProvider>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-[#f0f0f0] pt-3">
              <ComposerActionIconButton
                icon={ImagePlus}
                label="Add photo"
                onClick={() => imageInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES_PER_POST || imageUploading}
              />
              <AddVideoPopover
                authorMemberId={viewer.memberId}
                disabled={videoLinks.length >= 1}
                onAdd={(v) => setVideoLinks((prev) => [...prev, v])}
                renderTrigger={() => (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]" />
                      }
                    >
                      <Video className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>Add video</TooltipContent>
                  </Tooltip>
                )}
              />
              <ComposerActionIconButton
                icon={Mic}
                label="Record voice note"
                onClick={() => setShowRecorder(true)}
                disabled={!!voiceNote}
              />
              <ComposerActionIconButton
                icon={FileUp}
                label="Upload file"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES_PER_POST || fileUploading}
              />
              <GiphyPickerButton label="Add GIF" disabled={!!gif || gifResolving} onSelect={setGif} />
              <ComposerActionIconButton
                icon={AtSign}
                label="Mention someone"
                onClick={insertMentionTrigger}
                disabled={!editor}
              />
              <ComposerActionIconButton
                icon={Hash}
                label="Reference a channel"
                onClick={insertChannelRefTrigger}
                disabled={!editor}
              />
              {canManagePoll && (
                <ComposerActionIconButton
                  icon={ListChecks}
                  label={poll ? "Poll already attached" : "Add poll"}
                  onClick={() => setPollSheetOpen(true)}
                  disabled={!!poll}
                />
              )}
              <EmojiPickerButton editor={editor} />
            </div>
          </TooltipProvider>

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
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFileSelect(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-[#f0f0f0] px-4 py-3 sm:px-5">
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{ backgroundColor: brand }}
            className="text-white hover:opacity-90"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "create" ? "Post" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>

      {canManagePoll && (
        <CreatePollSheet
          open={pollSheetOpen}
          onOpenChange={setPollSheetOpen}
          initial={poll ?? emptyPollDraft()}
          locked={pollLocked}
          onSave={setPoll}
        />
      )}
    </Sheet>
  );
}

/** Lightweight inline preview of a freshly-picked GIF — the composer
 *  already has the FULL `IGif` object in memory (the picker handed it
 *  over directly), so this never needs the batched page-level resolver;
 *  it's the official `Gif` component rendering an object we already have,
 *  not a second resolution path. */
function GifPreview({ gif }: { gif: IGif }) {
  return <Gif gif={gif} width={220} percentWidth="100%" noLink hideAttribution={false} />;
}
