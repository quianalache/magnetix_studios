import { extensionForVoiceNoteMimeType } from "@/lib/community/voice-note-mime";
import type { VoiceNote } from "@/types/media-attachment";

/**
 * YTCS's voice-note upload client — mirrors
 * `@/lib/community/upload-voice-note.ts` exactly, pointed at the YTCS
 * staff-session-authenticated route instead of the community member-
 * session one. Passed as the `upload` prop to the shared
 * `<VoiceNoteRecorder>` component (see its own doc comment).
 */
export async function uploadYtcsVoiceNote(opts: {
  saId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}): Promise<VoiceNote> {
  const ext = extensionForVoiceNoteMimeType(opts.mimeType);
  const form = new FormData();
  form.append("file", opts.blob, `voice-note.${ext}`);
  form.append("durationMs", String(Math.round(opts.durationMs)));

  const res = await fetch(`/api/sub-accounts/${opts.saId}/ytcs/voice-notes`, {
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
