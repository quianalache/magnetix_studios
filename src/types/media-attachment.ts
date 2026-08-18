/**
 * Surface-agnostic media-attachment types — deliberately NOT inside
 * `community.ts`'s DM-specific types, and NOT inside any Community-post
 * type file. DMs, Community posts, and a future chat-style channel system
 * should all import from here without depending on each other's type
 * modules. See the Voice Notes Reusable Architecture Investigation
 * (Phase 0) for the full rationale.
 *
 * Phase 1 added the "voice" kind. Phase C (Community post attachments)
 * adds "image" here, additively, exactly as Phase 1 anticipated — no
 * surface needed a second, parallel attachment concept. `file`/other
 * kinds remain future, out of scope.
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

export type MediaAttachmentKind = "voice" | "image";

/** The extensible wrapper — a real discriminated union so consumers get
 *  exhaustive narrowing on `kind`. Phase 1 shipped "voice"; Phase C adds
 *  "image" the same way. */
export type MediaAttachment =
  | { kind: "voice"; voice: VoiceNote }
  | { kind: "image"; image: ImageAttachment };
