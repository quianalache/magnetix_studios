"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import {
  Check,
  FileUp,
  ImagePlus,
  ListChecks,
  Loader2,
  Mic,
  Sticker,
  Type,
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
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { AddVideoPopover } from "@/components/community/feed/add-video-popover";
import { EmojiPickerButton } from "@/components/community/feed/emoji-picker-button";
import {
  CreatePollSheet,
  emptyPollDraft,
  type PollDraftState,
} from "@/components/community/feed/create-poll-sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
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

/** `PollDraftState` -> the raw shape `normalizePollDraft` (server) expects. */
function draftToApiPayload(draft: PollDraftState) {
  return {
    options: draft.options.map((o) => ({ text: o.text })),
    allowMultiple: draft.allowMultiple,
    showResults: draft.showResults,
    endsAt: draft.endsAt || null,
  };
}

/**
 * ONE shared post composer/editor — mounted by `feed-view.tsx`'s inline
 * "Write something…" flow (`mode="create"`) AND by the post-detail page's
 * Edit Post flow (`mode="edit"`, `editingPost` supplied). Phase D's
 * explicit instruction was not to build a second EditPost editor; this is
 * that reuse, not two composers that happen to look similar.
 *
 * Composer UX refinement (2026-08-20) — the action row below the editor
 * was rebuilt around the same "one coherent, progressively-disclosed
 * system" the comment composer's `+` menu already established, rather
 * than a permanent row of always-visible icons that grew feature-by-
 * feature:
 *  - Formatting ("Aa") is now a `Popover` anchored to its own trigger,
 *    rendering the SAME `RichTextToolbar`/`COMMUNITY_POST_TOOLBAR` the
 *    editor always used — it used to render inline above the editor
 *    (near the TOP of the card) while the toggle lived in the action row
 *    at the BOTTOM, so tapping it made a control strip appear far from
 *    where the member was looking, especially with attachments/previews
 *    in between on a tall mobile composer. A Popover is physically
 *    anchored to its trigger by construction, so this can't recur.
 *  - Photo/voice/file/video/GIF are now one `+` Popover menu, mirroring
 *    the comment composer's menu content almost exactly (video is the
 *    one addition — comments don't support it, posts do).
 *  - Poll is its own one-tap icon (not buried in `+`, matching the
 *    reference screenshots' dedicated poll icon), visible ONLY to
 *    moderators — `viewer.role === "moderator"`. Selecting it opens
 *    `CreatePollSheet`; the result is held as local draft state
 *    (`poll`) and submitted together with the rest of the post, same
 *    "attachment tray" pattern images/voice/files already use. Editing an
 *    EXISTING published poll reuses this exact same Edit Post flow — no
 *    separate "Edit poll" surface — with `locked` passed to the sheet
 *    once the poll already has votes (Part 9's "no destructive changes
 *    after votes exist"), independently re-enforced server-side by
 *    `normalizePollEdit` regardless of what this UI sends.
 *  - Emoji stays its own one-tap icon (unchanged) — already lightweight
 *    enough not to need hiding behind a menu, same call the comment
 *    composer already made.
 *
 * Edit-mode attachment lifecycle (the "safe edit transaction" the Phase D
 * task asked to be reported precisely) is UNCHANGED by this refinement —
 * see the inline comments below, still exactly as before.
 */
export function PostComposer({
  saId,
  groupId,
  brand,
  categories,
  viewer,
  mode,
  editingPost,
  onCreated,
  onSaved,
  onCancel,
}: {
  saId: string;
  groupId: string;
  brand: string;
  categories: string[];
  viewer: Viewer;
  mode: "create" | "edit";
  editingPost?: ClientPost;
  onCreated?: (post: ClientPost) => void;
  onSaved?: (post: ClientPost) => void;
  onCancel: () => void;
}) {
  const initialAttachments = editingPost?.attachments ?? [];
  const [title, setTitle] = useState(editingPost?.title ?? "");
  const [body, setBody] = useState(editingPost?.body ?? "");
  const [category, setCategory] = useState(editingPost?.category ?? categories[0] ?? "General");
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

  // Polls (2026-08-20) — held as local draft state, same "not persisted
  // until Post/Save Changes" convention as every other attachment kind
  // above. `null` = no poll attached. The moderator gate is enforced both
  // here (icon hidden) and server-side (the route independently checks
  // `access.membership.role`).
  const [poll, setPoll] = useState<PollDraftState | null>(
    editingPost?.poll ? feedPollToDraft(editingPost.poll) : null,
  );
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const pollLocked = (editingPost?.poll?.voterCount ?? 0) > 0;
  const canManagePoll = viewer.role === "moderator";

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);

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
    // already deleted eagerly by the remove handlers above).
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
    ];
  }

  async function submit() {
    const trimmedTitle = title.trim();
    const attachments = buildAttachments();
    if (aboutPlainTextLength(body) === 0 && attachments.length === 0 && !poll) {
      toast.error("Write something, attach a photo, file, video, or voice note, or add a poll");
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
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full border-0 p-0 text-base font-semibold text-[#202124] outline-none placeholder:text-[#b4b4b4]"
        autoFocus
      />
      <div className="mt-2">
        <CommunityPostEditor
          value={body}
          onChange={setBody}
          brand={brand}
          mentions={{ fetchItems: mentionFetchItems }}
          channelRefs={{ fetchItems: channelRefFetchItems }}
          onEditorReady={setEditor}
        />
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

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0f0f0] pt-3">
        <div className="flex flex-wrap items-center gap-1">
          {/* Formatting — a Popover anchored to THIS trigger, not an
              inline block rendered above the editor. See the module
              comment for why that mattered. */}
          <Popover open={formattingOpen} onOpenChange={setFormattingOpen}>
            <PopoverTrigger
              type="button"
              title="Formatting"
              aria-label="Formatting"
              aria-pressed={formattingOpen}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                formattingOpen ? "border-transparent text-white" : "border-[#E4E4E4] text-[#909090] hover:text-[#202124]",
              )}
              style={formattingOpen ? { backgroundColor: brand } : undefined}
            >
              <Type className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-x-auto p-1">
              {editor && <RichTextToolbar editor={editor} items={COMMUNITY_POST_TOOLBAR} />}
            </PopoverContent>
          </Popover>

          {/* Photo / voice / file / video / GIF — one consolidated `+`
              menu, mirroring the comment composer's own `+` menu almost
              exactly (video is the one addition posts get that comments
              don't). Progressive disclosure instead of five permanent
              icons. */}
          <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
            <PopoverTrigger
              type="button"
              title="Add to post"
              aria-label="Add to post"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
            >
              <span className="text-base leading-none">+</span>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  imageInputRef.current?.click();
                }}
                disabled={images.length >= MAX_IMAGES_PER_POST || imageUploading}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
              >
                <ImagePlus className="h-4 w-4 text-[#909090]" /> Add photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  setShowRecorder(true);
                }}
                disabled={!!voiceNote}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
              >
                <Mic className="h-4 w-4 text-[#909090]" /> Record voice note
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                disabled={files.length >= MAX_FILES_PER_POST || fileUploading}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
              >
                <FileUp className="h-4 w-4 text-[#909090]" /> Upload file
              </button>
              <AddVideoPopover
                authorMemberId={viewer.memberId}
                disabled={videoLinks.length >= 1}
                onAdd={(v) => {
                  setVideoLinks((prev) => [...prev, v]);
                  setAttachMenuOpen(false);
                }}
                renderTrigger={() => (
                  <span className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2]">
                    <Video className="h-4 w-4 text-[#909090]" /> Add video
                  </span>
                )}
              />
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  toast("GIFs are coming soon — we're finishing the provider setup.");
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#b4b4b4] hover:bg-[#F5F4F2]"
              >
                <Sticker className="h-4 w-4 text-[#b4b4b4]" /> Add GIF
                <span className="ml-auto text-[10px] uppercase tracking-wide text-[#b4b4b4]">Soon</span>
              </button>
            </PopoverContent>
          </Popover>
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

          {/* Poll — moderator/admin-only (Part 1), server-enforced
              regardless of this hidden-icon UX gate. */}
          {canManagePoll && (
            <button
              type="button"
              onClick={() => setPollSheetOpen(true)}
              disabled={!!poll}
              title={poll ? "Poll already attached" : "Add poll"}
              aria-label="Add poll"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E4E4E4] text-[#909090] hover:text-[#202124] disabled:opacity-40"
            >
              <ListChecks className="h-4 w-4" />
            </button>
          )}

          <div className="flex h-7 w-7 items-center justify-center">
            <EmojiPickerButton editor={editor} />
          </div>
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
            {mode === "create" ? "Post" : "Save changes"}
          </button>
        </div>
      </div>

      {canManagePoll && (
        <CreatePollSheet
          open={pollSheetOpen}
          onOpenChange={setPollSheetOpen}
          initial={poll ?? emptyPollDraft()}
          locked={pollLocked}
          onSave={setPoll}
        />
      )}
    </div>
  );
}
