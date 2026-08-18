"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import { Check, FileUp, ImagePlus, Loader2, Mic, X } from "lucide-react";
import type {
  FileAttachment,
  ImageAttachment,
  MediaAttachment,
  VideoLinkAttachment,
  VoiceNote,
} from "@/types/media-attachment";
import { CommunityPostEditor } from "@/components/community/feed/community-post-editor";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { AddVideoPopover } from "@/components/community/feed/add-video-popover";
import { EmojiPickerButton } from "@/components/community/feed/emoji-picker-button";
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

/**
 * ONE shared post composer/editor — mounted by `feed-view.tsx`'s inline
 * "Write something…" flow (`mode="create"`) AND by the post-detail page's
 * Edit Post flow (`mode="edit"`, `editingPost` supplied). Phase D's
 * explicit instruction was not to build a second EditPost editor; this is
 * that reuse, not two composers that happen to look similar.
 *
 * Edit-mode attachment lifecycle (the "safe edit transaction" the Phase D
 * task asked to be reported precisely):
 *  - On mount, existing attachments are split into their per-kind arrays
 *    exactly like a freshly created post's would be — nothing is deleted
 *    or specially marked yet.
 *  - Removing an EXISTING attachment during edit only updates local
 *    state — no Storage delete happens client-side. If the member clicks
 *    Cancel, nothing was ever touched, so the original post is
 *    byte-for-byte intact. If they click Save Changes, the server
 *    (`updatePostServerSide`) diffs the OLD stored attachments against
 *    the new submitted list and deletes whatever's missing — the
 *    deletion is a consequence of a successful save, never of the local
 *    remove click itself.
 *  - Uploading a NEW attachment during edit still uploads immediately
 *    (same UX as create — a member sees a real preview/error right
 *    away), but its storage path is also recorded in `sessionUploads`
 *    (a ref, not state — it must survive without triggering re-renders
 *    and must NOT reset on every attachment add/remove). On Cancel,
 *    every session upload is deleted unconditionally (it was never part
 *    of the real post; there is nothing to preserve). On a successful
 *    Save, only the session uploads that did NOT make it into the final
 *    submitted attachment list are deleted — a new attachment the
 *    member added THEN removed again before saving would otherwise be
 *    silently orphaned (present in neither the old post nor the new
 *    one, so the server's old-vs-new diff would never see it).
 *  - CREATE mode's existing behavior (upload immediately, delete
 *    immediately on remove, `cleanupDraftAttachments` on Cancel) is left
 *    completely untouched — it's simpler because there is no "original
 *    post" to protect in the first place.
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
  const [toolbarOpen, setToolbarOpen] = useState(false);
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
    if (aboutPlainTextLength(body) === 0 && attachments.length === 0) {
      toast.error("Write something, or attach a photo, file, video, or voice note");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch(`/api/community/${saId}/${groupId}/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle, body, category, attachments, commentsDisabled }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          post?: { id: string };
        };
        if (!res.ok || !d.ok || !d.post?.id) {
          throw new Error(d.error ?? "Couldn't post");
        }
        // Optimistic: drop the real created post (we have its id) into the
        // feed immediately — safe to render this HTML/attachments directly
        // (CommunityPostBody doesn't re-sanitize): it came straight from
        // TipTap's own schema-constrained output and already-uploaded,
        // server-validated attachment objects, not arbitrary input.
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
        });
      } else {
        if (!editingPost) return;
        const res = await fetch(`/api/community/${saId}/${groupId}/posts/${editingPost.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edit: { title: trimmedTitle, body, category, attachments, commentsDisabled },
          }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          post?: { id: string };
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
          toolbarOpen={toolbarOpen}
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES_PER_POST || fileUploading}
            title="Add file"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E4E4E4] text-[#909090] hover:text-[#202124] disabled:opacity-40"
          >
            <FileUp className="h-4 w-4" />
          </button>
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
          <div className="flex h-7 w-7 items-center justify-center">
            <AddVideoPopover
              authorMemberId={viewer.memberId}
              disabled={videoLinks.length >= 1}
              onAdd={(v) => setVideoLinks((prev) => [...prev, v])}
            />
          </div>
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
    </div>
  );
}
