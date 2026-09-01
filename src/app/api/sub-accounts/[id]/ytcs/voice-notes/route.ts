import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_DURATION_MS,
  extensionForVoiceNoteMimeType,
  isAllowedVoiceNoteMimeType,
} from "@/lib/community/voice-note-mime";
import type { VoiceNote } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * YouTube Content Studio's voice-note upload route — staff-session
 * authenticated (`requireSubAccountMember`, same guard as every other
 * YTCS route), otherwise a direct mirror of the community voice-notes
 * route (`/api/community/[saId]/voice-notes`) which pioneered this
 * pattern. A second route rather than parameterizing the community one:
 * the auth model is genuinely different (staff session vs. member
 * session — community members have no Firebase Auth at all, staff do),
 * so the two routes verify different things even though the upload
 * mechanics are identical.
 *
 * Storage path: `ytcs/{subAccountId}/voice-notes/{uuid}.{ext}` — same
 * `ytcs/{subAccountId}/voice-notes/` prefix Phase 0's migration importer
 * already uses (keyed there by the historical voice note's own source
 * id; keyed here by a fresh uuid per new recording, since these are new
 * recordings with no prior id to preserve).
 */

async function bucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  return getStorage().bucket(bucketName);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

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
    durationMs > MAX_VOICE_NOTE_DURATION_MS + 5000
  ) {
    return NextResponse.json({ error: "Invalid recording duration" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extensionForVoiceNoteMimeType(file.type);
    const id = randomUUID();
    const storagePath = `ytcs/${subAccountId}/voice-notes/${id}.${ext}`;
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
      id,
      url,
      storagePath,
      mimeType: file.type,
      durationMs: Math.round(durationMs),
      fileSizeBytes: file.size,
      authorMemberId: access.uid,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, voiceNote });
  } catch (err) {
    console.error("[ytcs voice-notes] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
