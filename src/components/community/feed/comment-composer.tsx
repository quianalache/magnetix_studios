"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { toast } from "sonner";
import type { IGif } from "@giphy/js-types";
import { Gif } from "@giphy/react-components";
import {
  ArrowLeft,
  Check,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Mic,
  Plus,
  Sticker,
  X,
} from "lucide-react";
import { useRichTextEditor } from "@/components/editor/use-rich-text-editor";
import { LinkPopover } from "@/components/editor/link-popover";
import { EmojiPickerButton } from "@/components/community/feed/emoji-picker-button";
import { GiphyPicker } from "@/components/community/feed/giphy-picker";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { MemberAvatar } from "@/components/community/member-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getGiphyFetch } from "@/lib/community/giphy-client";
import {
  deleteCommunityPostImage,
  uploadCommunityPostImage,
} from "@/lib/community/upload-community-image";
import { deleteVoiceNote } from "@/lib/community/upload-voice-note";
import { deleteCommunityPostFile, uploadCommunityPostFile } from "@/lib/community/upload-community-file";
import { MAX_IMAGES_PER_COMMENT } from "@/lib/community/community-image-mime";
import { MAX_FILES_PER_COMMENT, formatFileSize } from "@/lib/community/community-file-mime";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import type {
  FileAttachment,
  ImageAttachment,
  MediaAttachment,
  VoiceNote,
} from "@/types/media-attachment";
import type { AuthorView } from "@/types/community";
import type { ClientComment } from "./post-detail-view";

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

export interface ReplyTarget {
  /** Already resolved to the TRUE top-level ancestor client-side (mirrors
   *  the server's own resolveCommentParentId) — see post-detail-view.tsx. */
  parentId: string;
  mentionMemberId: string;
  mentionLabel: string;
}

type SessionUpload = { storagePath: string; kind: "image" | "voice" | "file" };

/**
 * Comments & Replies (2026-08-19) — the compact, conversational composer.
 * Deliberately NOT `PostComposer` reused, and deliberately NOT wrapping
 * `CommunityPostEditor` (which bakes in the Aa toolbar/toggle Community
 * posts want and comments explicitly must not have) — this calls
 * `useRichTextEditor` directly with `toolbar: []` (no headings, no
 * underline extension registered) and never mounts `RichTextToolbar` at
 * all. Formatting marks a member could still reach via keyboard shortcut
 * (e.g. Ctrl+B) remain technically possible — same accepted, pre-existing
 * behavior Phase A documented for every toolbar config, not a new gap —
 * but the server-side sanitizer (sanitizeCommunityCommentHtml) strips
 * bold/italic/etc regardless, so a comment can never actually STORE
 * formatting even if a member found a way to apply it locally.
 *
 * Reused as-is: useRichTextEditor, LinkPopover (via its new `renderTrigger`
 * so "Add link" can be a `+` menu row instead of a toolbar icon),
 * EmojiPickerButton, VoiceNoteRecorder/Player, the image/file upload
 * clients, MediaAttachment. GIF is architecture-ready (the `+` menu has a
 * row for it) but not wired — see the report for exactly what remains.
 *
 * One composer instance serves three roles via props, not three
 * components: a new top-level comment, a targeted reply (banner + auto-
 * mention), and editing an existing comment/reply (attachment lifecycle
 * mirrors PostComposer's edit mode exactly — see the module comment
 * there for the full contract; duplicated in spirit, not copy-pasted,
 * since this composer's shape is otherwise unrelated to PostComposer's).
 */
export function CommentComposer({
  saId,
  groupId,
  postId,
  brand,
  primaryAction,
  accent,
  viewer,
  mode,
  placeholder = "Write a comment…",
  collapsedByDefault = false,
  replyTarget = null,
  onCancelReplyTarget,
  editingComment,
  onCreated,
  onSaved,
  onCancelEdit,
}: {
  saId: string;
  groupId: string;
  postId: string;
  brand: string;
  /** Theme parity (2026-08-29 closeout) — the submit ("Comment"/"Reply"/
   *  "Save") button is a genuine CTA. Optional, falls back to `brand`. */
  primaryAction?: string;
  /** Link color inside the composer's rich text. Optional, falls back to
   *  `brand`. */
  accent?: string;
  viewer: Viewer;
  mode: "create" | "edit";
  placeholder?: string;
  collapsedByDefault?: boolean;
  replyTarget?: ReplyTarget | null;
  onCancelReplyTarget?: () => void;
  editingComment?: ClientComment;
  onCreated?: (comment: ClientComment) => void;
  onSaved?: (comment: ClientComment) => void;
  onCancelEdit?: () => void;
}) {
  const initialAttachments = editingComment?.attachments ?? [];
  const [open, setOpen] = useState(!collapsedByDefault || !!replyTarget);
  const [body, setBody] = useState(editingComment?.body ?? "");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  // GIF (Part 11) — activates the already-scaffolded capability via the
  // SAME shared `GiphyPicker` the post composer uses; every other comment
  // capability (links/emoji/mentions/1-image/1-voice/1-file/edit/delete/
  // threading) is unchanged. The `+` menu itself stays exactly as it was
  // (Part 11: "the comment + menu may stay as-is") — only its "Add GIF"
  // row goes from a "coming soon" toast to actually opening the picker,
  // swapping the SAME popover's content rather than opening a second one.
  const [menuView, setMenuView] = useState<"list" | "gif">("list");
  const existingGif = initialAttachments.find(
    (a): a is Extract<MediaAttachment, { kind: "gif" }> => a.kind === "gif",
  )?.gif;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionUploadsRef = useRef<SessionUpload[]>([]);
  const insertedMentionForKeyRef = useRef<string | null>(null);

  const editor = useRichTextEditor({
    toolbar: [],
    value: body,
    onChange: setBody,
    mentions: { fetchItems: mentionFetchItems },
    // Deliberately no channelRefs — comments don't offer #channel
    // references in this phase (product decision, see the report).
    proseClassName: "text-sm text-[#3a3a44] [&_a]:text-(--comment-link-color) [&_a]:underline [&_span[data-type=mention]]:font-semibold [&_span[data-type=mention]]:text-(--comment-link-color)",
    minHeightClassName: "min-h-[36px]",
    contentPaddingClassName: "px-3 py-2",
  });

  async function mentionFetchItems(query: string) {
    const res = await fetch(
      `/api/community/${saId}/${groupId}/mention-members?q=${encodeURIComponent(query)}`,
    );
    const d = (await res.json().catch(() => ({}))) as {
      members?: { id: string; label: string; avatarUrl: string | null }[];
    };
    return d.members ?? [];
  }

  // Auto-insert the structured @mention the moment a NEW reply target is
  // set — only when the editor is currently empty, so switching targets
  // mid-draft never clobbers text already typed (see the module comment).
  useEffect(() => {
    if (!editor || !replyTarget) return;
    const key = `${replyTarget.parentId}:${replyTarget.mentionMemberId}`;
    if (insertedMentionForKeyRef.current === key) return;
    insertedMentionForKeyRef.current = key;
    if (aboutPlainTextLength(editor.getHTML()) > 0) return;
    editor
      .chain()
      .focus()
      .insertContentAt(0, [
        { type: "mention", attrs: { id: replyTarget.mentionMemberId, label: replyTarget.mentionLabel } },
        { type: "text", text: " " },
      ])
      .run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, replyTarget?.parentId, replyTarget?.mentionMemberId]);

  // A reply target being set is an explicit "I want to type now" gesture —
  // expand even a collapsed-by-default composer, and bring it into view so
  // it's never left off-screen (mobile requirement: the composer must stay
  // reachable, never detached from the conversation it's replying in).
  useEffect(() => {
    if (!replyTarget) return;
    setOpen(true);
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Deliberately keyed on the target's identity fields, not the
    // `replyTarget` object reference itself (a new object every render
    // would otherwise re-scroll on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTarget?.parentId, replyTarget?.mentionMemberId]);

  async function handleImageFiles(fileList: FileList) {
    const remaining = MAX_IMAGES_PER_COMMENT - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES_PER_COMMENT} image per comment.`);
      return;
    }
    const toUpload = Array.from(fileList).slice(0, remaining);
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
      void deleteCommunityPostImage(saId, img.storagePath).catch(() => {});
    }
    // edit mode: deferred — see the module comment / PostComposer's own.
  }

  function removeVoiceNote() {
    if (!voiceNote) return;
    if (mode === "create") {
      void deleteVoiceNote(saId, voiceNote.storagePath).catch(() => {});
    }
    setVoiceNote(null);
  }

  async function handleFileSelect(fileList: FileList) {
    const remaining = MAX_FILES_PER_COMMENT - files.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_FILES_PER_COMMENT} file per comment.`);
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

  function cleanupDraftAttachments() {
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

  function removeGif() {
    // No Storage object behind a GIF (Part 13) — a draft state update
    // only, same as PostComposer's own removeGif.
    setGif(null);
  }

  function resetDraft() {
    setBody("");
    editor?.commands.clearContent();
    setImages([]);
    setVoiceNote(null);
    setFiles([]);
    setGif(null);
    insertedMentionForKeyRef.current = null;
    if (collapsedByDefault) setOpen(false);
  }

  function handleCancel() {
    if (mode === "edit") {
      void cleanupSessionUploads(new Set());
      onCancelEdit?.();
      return;
    }
    cleanupDraftAttachments();
    resetDraft();
    onCancelReplyTarget?.();
  }

  function buildAttachments(): MediaAttachment[] {
    return [
      ...images.map((image): MediaAttachment => ({ kind: "image", image })),
      ...(voiceNote ? [{ kind: "voice", voice: voiceNote } as MediaAttachment] : []),
      ...files.map((file): MediaAttachment => ({ kind: "file", file })),
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
    const attachments = buildAttachments();
    if (aboutPlainTextLength(body) === 0 && attachments.length === 0) {
      toast.error("Write something, or attach a photo, voice note, file, or GIF");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch(`/api/community/${saId}/${groupId}/posts/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, parentId: replyTarget?.parentId ?? null, attachments }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          comment?: { id: string };
        };
        if (!res.ok || !d.ok || !d.comment?.id) {
          throw new Error(d.error ?? "Couldn't comment");
        }
        const author: AuthorView = {
          memberId: viewer.memberId,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        };
        onCreated?.({
          id: d.comment.id,
          body,
          attachments,
          likeCount: 0,
          likedByViewer: false,
          createdAtMs: Date.now(),
          parentId: replyTarget?.parentId ?? null,
          author,
        });
        resetDraft();
        onCancelReplyTarget?.();
      } else {
        if (!editingComment) return;
        const res = await fetch(
          `/api/community/${saId}/${groupId}/posts/${postId}/comments/${editingComment.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body, attachments }),
          },
        );
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; body?: string };
        if (!res.ok || !d.ok) {
          throw new Error(d.error ?? "Couldn't save changes");
        }
        const finalPaths = new Set(
          attachments
            .map((a) => (a.kind === "image" ? a.image.storagePath : a.kind === "file" ? a.file.storagePath : a.kind === "voice" ? a.voice.storagePath : null))
            .filter((p): p is string => !!p),
        );
        await cleanupSessionUploads(finalPaths);
        onSaved?.({
          ...editingComment,
          body: d.body ?? body,
          attachments,
          edited: true,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-full border border-[#E4E4E4] bg-white px-3 py-2 text-left text-sm text-[#909090] hover:border-[#d4d4d4]"
      >
        <MemberAvatar
          author={{ memberId: viewer.memberId, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, level: viewer.level }}
          size={24}
          brand={brand}
        />
        {placeholder}
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className="space-y-1.5"
      style={{ ["--comment-link-color" as string]: accent || brand } as React.CSSProperties}
    >
      {mode === "create" && replyTarget && (
        <div className="flex items-center gap-1.5 rounded-md bg-[#F5F4F2] px-2.5 py-1 text-xs text-[#606060]">
          Replying to <span className="font-medium text-[#202124]">@{replyTarget.mentionLabel}</span>
          <button
            type="button"
            onClick={() => {
              onCancelReplyTarget?.();
            }}
            title="Cancel reply"
            className="ml-auto text-[#909090] hover:text-[#202124]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-start gap-2">
        <MemberAvatar
          author={{ memberId: viewer.memberId, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, level: viewer.level }}
          size={28}
          brand={brand}
        />
        <div className="min-w-0 flex-1 rounded-xl border border-[#E4E4E4] bg-white">
          {editor ? <EditorContent editor={editor} /> : <div className="min-h-[36px] px-3 py-2" />}

          {(images.length > 0 || imageUploading) && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {images.map((img) => (
                <div key={img.id} className="group relative h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(img)}
                    title="Remove image"
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {imageUploading && (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[#E4E4E4]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#909090]" />
                </div>
              )}
            </div>
          )}

          {(files.length > 0 || fileUploading) && (
            <div className="space-y-1 px-3 pb-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] bg-[#FAFAFA] px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-[#3a3a44]">
                    {f.fileName} <span className="text-[#909090]">· {formatFileSize(f.fileSizeBytes)}</span>
                  </span>
                  <button type="button" onClick={() => removeFile(f)} title="Remove file" className="shrink-0 text-[#909090] hover:text-[#202124]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {fileUploading && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#E4E4E4] px-2.5 py-1.5 text-xs text-[#909090]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </div>
              )}
            </div>
          )}

          {(gif || gifResolving) && (
            <div className="px-3 pb-2">
              <div className="max-w-[180px]">
                {gifResolving ? (
                  <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-[#F0F0F0]" />
                ) : (
                  gif && (
                    <div className="group relative overflow-hidden rounded-lg">
                      <Gif gif={gif} width={180} percentWidth="100%" noLink hideAttribution={false} />
                      <button
                        type="button"
                        onClick={removeGif}
                        title="Remove GIF"
                        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {showRecorder && !voiceNote && (
            <div className="px-3 pb-2">
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
            <div className="space-y-1 px-3 pb-2">
              <div className="flex items-center gap-2">
                <VoiceNotePlayer url={voiceNote.url} durationMs={voiceNote.durationMs} brand={brand} />
                <button
                  type="button"
                  onClick={removeVoiceNote}
                  title="Remove voice note"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#909090] hover:text-[#202124]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 border-t border-[#f0f0f0] px-2 py-1.5">
            <div className="flex items-center gap-0.5">
              <Popover
                open={plusMenuOpen}
                onOpenChange={(next) => {
                  setPlusMenuOpen(next);
                  // Always land back on the menu list next time this
                  // opens — a member who backed out of the GIF search
                  // shouldn't reopen straight into it.
                  if (!next) setMenuView("list");
                }}
              >
                <PopoverTrigger
                  type="button"
                  title="Add to comment"
                  aria-label="Add to comment"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
                >
                  <Plus className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent className={menuView === "gif" ? "w-auto p-2" : "w-56 p-1.5"}>
                  {menuView === "list" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPlusMenuOpen(false);
                          imageInputRef.current?.click();
                        }}
                        disabled={images.length >= MAX_IMAGES_PER_COMMENT || imageUploading}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
                      >
                        <ImageIcon className="h-4 w-4 text-[#909090]" /> Add photo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlusMenuOpen(false);
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
                          setPlusMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        disabled={files.length >= MAX_FILES_PER_COMMENT || fileUploading}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
                      >
                        <FileUp className="h-4 w-4 text-[#909090]" /> Upload file
                      </button>
                      {editor && (
                        <LinkPopover
                          editor={editor}
                          renderTrigger={() => (
                            <span className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2]">
                              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#909090]" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Add link
                            </span>
                          )}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setMenuView("gif")}
                        disabled={!!gif || gifResolving}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#202124] hover:bg-[#F5F4F2] disabled:opacity-40"
                      >
                        <Sticker className="h-4 w-4 text-[#909090]" /> Add GIF
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setMenuView("list")}
                        className="flex items-center gap-1 text-xs font-medium text-[#606060] hover:text-[#202124]"
                      >
                        <ArrowLeft className="h-3 w-3" /> Back
                      </button>
                      <GiphyPicker
                        onSelect={(g) => {
                          setGif(g);
                          setPlusMenuOpen(false);
                          setMenuView("list");
                        }}
                        gridWidth={224}
                        className="w-56"
                      />
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
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
              <EmojiPickerButton editor={editor} />
            </div>
            <div className="flex items-center gap-1.5">
              {(mode === "edit" || (mode === "create" && (collapsedByDefault || replyTarget))) && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#909090] hover:text-[#202124]"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryAction || brand }}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === "edit" ? "Save" : replyTarget ? "Reply" : "Comment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
