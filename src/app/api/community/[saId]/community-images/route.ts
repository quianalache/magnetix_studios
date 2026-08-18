import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireMemberApi } from "@/lib/community/member-context";
import {
  MAX_COMMUNITY_IMAGE_BYTES,
  extensionForCommunityImageMimeType,
  isAllowedCommunityImageMimeType,
} from "@/lib/community/community-image-mime";
import type { ImageAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * Community post image upload/delete — same shape as
 * /api/community/[saId]/voice-notes, deliberately: member-session
 * authenticated (`requireMemberApi`, sub-account-scoped, not group-scoped
 * — the specific "can you post this here" permission stays with the
 * create-post route), Admin SDK Storage write (members have no Firebase
 * Auth, so a direct client Storage write is impossible for them — the
 * same constraint voice notes already solved). Not a new upload
 * architecture, the proven one applied to a second media kind.
 *
 * Storage path: `community/{saId}/post-images/{memberId}/{ts}-{uuid}.{ext}`
 * — namespaced under the uploading member's own id, which is also how
 * DELETE authorizes: a member may only delete a path under their own id.
 */

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
      { error: "Image uploads aren't configured on this deployment." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const w = form.get("width");
    const h = form.get("height");
    // Purely a rendering hint (aspect-ratio, avoids layout shift) — never
    // trusted for anything security- or cost-relevant, so a client-
    // reported value is fine here, unlike file size/MIME/duration.
    if (typeof w === "string" && Number.isFinite(Number(w))) width = Math.round(Number(w));
    if (typeof h === "string" && Number.isFinite(Number(h))) height = Math.round(Number(h));
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!isAllowedCommunityImageMimeType(file.type)) {
    return NextResponse.json(
      { error: "Choose a JPEG, PNG, WebP, or GIF image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_COMMUNITY_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large — keep it under 5 MB." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extensionForCommunityImageMimeType(file.type);
    const storagePath = `community/${saId}/post-images/${access.member.id}/${Date.now()}-${randomUUID()}.${ext}`;
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

    const image: ImageAttachment = {
      id: randomUUID(),
      url,
      storagePath,
      mimeType: file.type,
      fileSizeBytes: file.size,
      width,
      height,
      authorMemberId: access.member.id,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, image });
  } catch (err) {
    console.error("[community-images] upload failed", err);
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
  const expectedPrefix = `community/${saId}/post-images/${access.member.id}/`;
  if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b = await bucket();
  if (!b) {
    return NextResponse.json(
      { error: "Image uploads aren't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    await b.file(storagePath).delete();
  } catch (err) {
    console.warn("[community-images] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
