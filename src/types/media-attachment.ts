/**
 * Surface-agnostic media-attachment types — deliberately NOT inside
 * `community.ts`'s DM-specific types, and NOT inside any Community-post
 * type file. DMs, Community posts, and a future chat-style channel system
 * should all import from here without depending on each other's type
 * modules. See the Voice Notes Reusable Architecture Investigation
 * (Phase 0) for the full rationale.
 *
 * Phase 1 scope: `MediaAttachment` only has a "voice" kind. The union
 * shape exists so adding "image"/"file" kinds later is additive, not a
 * migration — no surface should ever need a second, parallel attachment
 * concept.
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

export type MediaAttachmentKind = "voice";

/** The extensible wrapper — only "voice" is populated in Phase 1. */
export interface MediaAttachment {
  kind: MediaAttachmentKind;
  voice: VoiceNote;
}
