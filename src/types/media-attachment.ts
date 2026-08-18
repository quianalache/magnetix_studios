/**
 * Surface-agnostic media-attachment types — deliberately NOT inside
 * `community.ts`'s DM-specific types, and NOT inside any Community-post
 * type file. DMs, Community posts, and a future chat-style channel system
 * should all import from here without depending on each other's type
 * modules. See the Voice Notes Reusable Architecture Investigation
 * (Phase 0) for the full rationale.
 *
 * Phase 1 added the "voice" kind. Phase C (Community post attachments)
 * added "image" here, additively, exactly as Phase 1 anticipated — no
 * surface needed a second, parallel attachment concept. Phase D adds
 * "gif", "file", and "video-link" the same additive way — every kind
 * lives in this one discriminated union, never a new top-level
 * `CommunityPost` field per media type.
 */

export type VoiceNoteStatus = "uploading" | "ready" | "failed";

/**
 * One recorded-and-uploaded voice note. Not tied to any Firestore
 * document — this is the shape the upload API returns; whichever surface
 * eventually attaches it to a message/post (Phase 2+) decides how (or
 * whether) to persist it.
 */
export interface VoiceNote {
  id: string;
  /** Public playback URL (Firebase Storage download-token URL). Never
   *  shown to end users as text/UI — only ever passed to a player. */
  url: string;
  /** Firebase Storage object path — retained specifically so the object
   *  can be deleted later (existing image-upload flows never keep this,
   *  which is why they can never clean up; voice notes must not repeat
   *  that). */
  storagePath: string;
  /** The REAL MIME type the recording browser produced — never assumed. */
  mimeType: string;
  /** Client-timed elapsed recording duration, in milliseconds. */
  durationMs: number;
  fileSizeBytes: number;
  authorMemberId: string;
  /** Epoch ms. Plain number, not a Firestore Timestamp — this object
   *  isn't itself a Firestore document in Phase 1. */
  createdAt: number;
  status: VoiceNoteStatus;
}

export type ImageAttachmentStatus = "uploading" | "ready" | "failed";

/**
 * One uploaded image. Same shape/philosophy as VoiceNote — not tied to any
 * Firestore document itself; whichever surface attaches it decides how to
 * persist it. `width`/`height` are populated from the browser's own
 * decoded dimensions at upload time (readily available, genuinely useful
 * for rendering without layout shift) — no other speculative metadata.
 */
export interface ImageAttachment {
  id: string;
  /** Public URL. Never shown to end users as text/UI — only ever passed
   *  to an <img>. */
  url: string;
  /** Firebase Storage object path — retained so the object can actually
   *  be deleted later, unlike existing image-upload flows elsewhere in
   *  the app, which never keep this and so can never clean up. */
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  authorMemberId: string;
  /** Epoch ms, same convention as VoiceNote.createdAt. */
  createdAt: number;
  status: ImageAttachmentStatus;
}

/**
 * Phase D — generic file/document attachment. Same shape/philosophy as
 * ImageAttachment/VoiceNote: not tied to any Firestore document itself,
 * `storagePath` retained so it can actually be deleted later. `fileName`
 * is the member's ORIGINAL filename (display only, never used to build
 * the Storage path — see the upload route for why).
 */
export type FileAttachmentStatus = "uploading" | "ready" | "failed";

export interface FileAttachment {
  id: string;
  url: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  authorMemberId: string;
  createdAt: number;
  status: FileAttachmentStatus;
}

/**
 * Phase D — a GIF selected from the provider picker (Tenor). Deliberately
 * NOT downloaded/re-uploaded into our own Storage — `url` is the
 * provider's own CDN URL, `previewUrl` its (usually smaller/looping) still
 * or reduced-size preview. No `storagePath`/upload lifecycle at all: there
 * is nothing of ours to clean up when a GIF is removed, unlike image/
 * voice/file. See the Phase D report for why Tenor was chosen and why
 * live search isn't wired yet (pending an API key).
 */
export interface GifAttachment {
  id: string;
  provider: "tenor";
  /** The provider's own id for this GIF — kept so a future feature (e.g.
   *  re-fetching fresher metadata) doesn't have to re-search by content. */
  providerId: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  /** Attribution text some GIF providers' terms require showing alongside
   *  the media — stored so the renderer doesn't have to know provider
   *  policy details. */
  attribution?: string;
  authorMemberId: string;
  createdAt: number;
}

/**
 * Phase D — a supported video/media link (YouTube/Vimeo/Loom/Descript).
 * Built entirely client-side from `parseVideoUrl` (video-embed.ts) and
 * re-validated server-side the same way before a post is ever created —
 * never an arbitrary iframe URL. No file upload; this is metadata only.
 */
export interface VideoLinkAttachment {
  id: string;
  /** The URL the member actually pasted, kept for display/"open original". */
  originalUrl: string;
  provider: VideoProviderName;
  /** The provider's own video id, exactly as `parseVideoUrl` extracts it. */
  providerId: string;
  embedUrl: string;
  authorMemberId: string;
  createdAt: number;
}

/** Mirrors `VideoProvider` from community.ts (youtube/vimeo/loom/descript)
 *  without importing community.ts here — see the module comment above for
 *  why this file stays independent of any single surface's type module. */
export type VideoProviderName = "youtube" | "vimeo" | "loom" | "descript";

export type MediaAttachmentKind = "voice" | "image" | "gif" | "file" | "video-link";

/** The extensible wrapper — a real discriminated union so consumers get
 *  exhaustive narrowing on `kind`. Phase 1 shipped "voice"; Phase C added
 *  "image"; Phase D adds "gif" / "file" / "video-link" the same way. */
export type MediaAttachment =
  | { kind: "voice"; voice: VoiceNote }
  | { kind: "image"; image: ImageAttachment }
  | { kind: "gif"; gif: GifAttachment }
  | { kind: "file"; file: FileAttachment }
  | { kind: "video-link"; videoLink: VideoLinkAttachment };
