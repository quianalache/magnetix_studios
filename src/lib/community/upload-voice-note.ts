import { extensionForVoiceNoteMimeType } from "@/lib/community/voice-note-mime";
import type { VoiceNote } from "@/types/media-attachment";

/**
 * The ONE shared voice-note upload path — member-session-authenticated,
 * Admin-SDK-backed on the server (see the route for why: members have no
 * Firebase Auth, so a direct client Storage write is impossible for them,
 * same constraint as every other member-facing upload in this app).
 * Deliberately sub-account-scoped, not per-group/per-surface — DMs,
 * Community posts, and future channels all call this same function; the
 * *specific* "can you post this here" permission stays with whichever
 * surface's own send/create route consumes the resulting VoiceNote.
 */
export async function uploadVoiceNote(opts: {
  saId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}): Promise<VoiceNote> {
  const ext = extensionForVoiceNoteMimeType(opts.mimeType);
  const form = new FormData();
  form.append("file", opts.blob, `voice-note.${ext}`);
  form.append("durationMs", String(Math.round(opts.durationMs)));

  const res = await fetch(`/api/community/${opts.saId}/voice-notes`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    voiceNote?: VoiceNote;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.voiceNote) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data.voiceNote;
}

/**
 * Deletes the underlying Storage object for a voice note the caller owns
 * (server re-verifies the storagePath belongs to the requesting member —
 * see the route). Exists specifically so nothing built on this foundation
 * repeats the existing image-upload flows' mistake of never being able to
 * clean up an orphaned file.
 */
export async function deleteVoiceNote(saId: string, storagePath: string): Promise<void> {
  const res = await fetch(`/api/community/${saId}/voice-notes`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't delete recording");
  }
}
