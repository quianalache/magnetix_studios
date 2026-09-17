import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { isOwnedAgencyCommunityAttachmentStoragePath } from "@/lib/community/attachment-provenance";
import {
  MAX_COMMUNITY_FILE_BYTES,
  isAllowedCommunityFileMimeType,
} from "@/lib/community/community-file-mime";
import type { FileAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/** Agency Community post file/document upload — same shape as
 *  post-images/route.ts, applied to a second media kind. See that file's
 *  doc comment for the full rationale. */

async function bucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  return getStorage().bucket(bucketName);
}

function extensionFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1 || dot === fileName.length - 1) return "bin";
  const ext = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
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
    const storagePath = `community/agency/${caller.agencyId}/post-files/${identityId}/${Date.now()}-${randomUUID()}.${ext}`;
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
      fileName: (file.name || "file").slice(0, 200),
      mimeType: file.type,
      fileSizeBytes: file.size,
      authorMemberId: identityId,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, file: fileAttachment });
  } catch (err) {
    console.error("[agency-community-files] upload failed", err);
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
      kind: "file",
    })
  ) {
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
    console.warn("[agency-community-files] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
