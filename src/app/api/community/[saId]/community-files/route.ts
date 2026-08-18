import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireMemberApi } from "@/lib/community/member-context";
import {
  MAX_COMMUNITY_FILE_BYTES,
  isAllowedCommunityFileMimeType,
} from "@/lib/community/community-file-mime";
import type { FileAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * Community post generic file/document upload — same shape as
 * /api/community/[saId]/community-images, deliberately: member-session
 * authenticated (`requireMemberApi`), Admin SDK Storage write. Not a new
 * upload architecture, the proven one applied to a third media kind.
 *
 * Storage path: `community/{saId}/post-files/{memberId}/{ts}-{uuid}.{ext}`
 * — the member's ORIGINAL filename is stored as metadata/on the returned
 * FileAttachment for display, never used to build the Storage path itself
 * (avoids path-traversal/collision/unsafe-character concerns entirely).
 */

async function bucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  return getStorage().bucket(bucketName);
}

function extensionFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1 || dot === fileName.length - 1) return "bin";
  // Keep it short/safe — a real extension is a handful of alnum chars;
  // anything else falls back rather than trusting an odd filename.
  const ext = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
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
      { error: "File uploads aren't configured on this deployment." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!isAllowedCommunityFileMimeType(file.type)) {
    return NextResponse.json(
      { error: "That file type isn't supported. Try a PDF, Word, Excel, PowerPoint, CSV, or text file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_COMMUNITY_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too large — keep it under 15 MB." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extensionFromFileName(file.name || "file");
    const storagePath = `community/${saId}/post-files/${access.member.id}/${Date.now()}-${randomUUID()}.${ext}`;
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

    const fileAttachment: FileAttachment = {
      id: randomUUID(),
      url,
      storagePath,
      // Original filename, display-only — never trusted for anything else.
      fileName: (file.name || "file").slice(0, 200),
      mimeType: file.type,
      fileSizeBytes: file.size,
      authorMemberId: access.member.id,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, file: fileAttachment });
  } catch (err) {
    console.error("[community-files] upload failed", err);
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
  const expectedPrefix = `community/${saId}/post-files/${access.member.id}/`;
  if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b = await bucket();
  if (!b) {
    return NextResponse.json(
      { error: "File uploads aren't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    await b.file(storagePath).delete();
  } catch (err) {
    console.warn("[community-files] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
