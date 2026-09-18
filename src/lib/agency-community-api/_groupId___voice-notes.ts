import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { isOwnedAgencyCommunityAttachmentStoragePath } from "@/lib/community/attachment-provenance";
import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_DURATION_MS,
  extensionForVoiceNoteMimeType,
  isAllowedVoiceNoteMimeType,
} from "@/lib/community/voice-note-mime";
import type { VoiceNote } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/** Agency Community voice-note upload/delete — same shape as
 *  post-images/route.ts, applied to voice notes. See that file's doc
 *  comment for the full rationale. */

const MAX_DURATION_GRACE_MS = 5000;

async function bucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  return getStorage().bucket(bucketName);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const identityId = caller.kind === "owner" ? caller.uid : caller.personId;

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
    return NextResponse.json({ error: "Invalid recording duration" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extensionForVoiceNoteMimeType(file.type);
    const storagePath = `community/agency/${caller.agencyId}/voice-notes/${identityId}/${Date.now()}-${randomUUID()}.${ext}`;
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
      authorMemberId: identityId,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, voiceNote });
  } catch (err) {
    console.error("[agency-voice-notes] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const identityId = caller.kind === "owner" ? caller.uid : caller.personId;

  let body: { storagePath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storagePath = body.storagePath?.trim();
  if (
    !storagePath ||
    !isOwnedAgencyCommunityAttachmentStoragePath({
      storagePath,
      agencyId: caller.agencyId,
      memberId: identityId,
      kind: "voice",
    })
  ) {
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
    console.warn("[agency-voice-notes] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
