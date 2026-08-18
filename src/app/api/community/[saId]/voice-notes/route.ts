import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireMemberApi } from "@/lib/community/member-context";
import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_DURATION_MS,
  extensionForVoiceNoteMimeType,
  isAllowedVoiceNoteMimeType,
} from "@/lib/community/voice-note-mime";
import type { VoiceNote } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * The ONE shared voice-note upload/delete route — see Voice Notes
 * Reusable Architecture Investigation (Phase 0) for the full rationale.
 * Not scoped to a group/DM/post — auth is "is this a real, current member
 * of this sub-account" (`requireMemberApi`), mirroring the same
 * Admin-SDK-bypass pattern already proven by `/api/community/[saId]/avatar`
 * (members have no Firebase Auth, so a direct client Storage write is
 * impossible for them). Whichever surface later attaches the returned
 * VoiceNote to a message/post enforces its OWN "can you post here"
 * permission separately, unchanged.
 *
 * Storage path: `community/{saId}/voice-notes/{memberId}/{ts}-{uuid}.{ext}`
 * — namespaced under the uploading member's own id, which is also how
 * DELETE authorizes: a member may only delete a path under their own id.
 */

const MAX_DURATION_GRACE_MS = 5000;

async function bucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  return getStorage().bucket(bucketName);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const b = await bucket();
  if (!b) {
    return NextResponse.json(
      { error: "Voice notes aren't configured on this deployment." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  let durationMs = 0;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const d = form.get("durationMs");
    durationMs = typeof d === "string" ? Number(d) : 0;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No recording received" }, { status: 400 });
  }
  if (!isAllowedVoiceNoteMimeType(file.type)) {
    return NextResponse.json(
      { error: `Unsupported audio format: ${file.type || "unknown"}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_VOICE_NOTE_BYTES) {
    return NextResponse.json(
      { error: "Recording is too large — keep it under 10 MB." },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > MAX_VOICE_NOTE_DURATION_MS + MAX_DURATION_GRACE_MS
  ) {
    // Real caveat, not silently glossed over: this rejects a CLAIMED
    // duration outside the allowed range — it cannot independently verify
    // the audio's actual duration without decoding it, which Phase 1
    // deliberately doesn't do (no ffmpeg/transcoding, per scope).
    return NextResponse.json({ error: "Invalid recording duration" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extensionForVoiceNoteMimeType(file.type);
    const storagePath = `community/${saId}/voice-notes/${access.member.id}/${Date.now()}-${randomUUID()}.${ext}`;
    const token = randomUUID();
    await b.file(storagePath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: file.type,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    const voiceNote: VoiceNote = {
      id: randomUUID(),
      url,
      storagePath,
      mimeType: file.type,
      durationMs: Math.round(durationMs),
      fileSizeBytes: file.size,
      authorMemberId: access.member.id,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, voiceNote });
  } catch (err) {
    console.error("[voice-notes] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { storagePath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storagePath = body.storagePath?.trim();
  const expectedPrefix = `community/${saId}/voice-notes/${access.member.id}/`;
  if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
    // Deliberately vague — don't confirm/deny existence of paths that
    // aren't this member's own.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b = await bucket();
  if (!b) {
    return NextResponse.json(
      { error: "Voice notes aren't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    await b.file(storagePath).delete();
  } catch (err) {
    // Already gone (e.g. double-delete) — treat as success, same
    // idempotent-delete convention used elsewhere in this app.
    console.warn("[voice-notes] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
