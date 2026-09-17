import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { isOwnedAgencyCommunityAttachmentStoragePath } from "@/lib/community/attachment-provenance";
import {
  MAX_COMMUNITY_IMAGE_BYTES,
  extensionForCommunityImageMimeType,
  isAllowedCommunityImageMimeType,
} from "@/lib/community/community-image-mime";
import type { ImageAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * Agency Community post image upload/delete — the agency-scope sibling of
 * `/api/community/[saId]/community-images`, same Admin-SDK-write shape
 * (owner has no Firebase-Storage-writable client identity here either, and
 * a member has no Firebase Auth at all). Owner OR an active member of THIS
 * community (`resolveAgencyCommunityCaller`).
 *
 * Storage path: `community/agency/{agencyId}/post-images/{identityId}/{ts}-{uuid}.{ext}`
 * — `identityId` is the caller's opaque id (Firebase uid for the owner,
 * Person id for a member), the same id already used to key likes/poll
 * votes. Never collides with a sub-account's `community/{saId}/...` path.
 */

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
    const storagePath = `community/agency/${caller.agencyId}/post-images/${identityId}/${Date.now()}-${randomUUID()}.${ext}`;
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
      authorMemberId: identityId,
      createdAt: Date.now(),
      status: "ready",
    };
    return NextResponse.json({ ok: true, image });
  } catch (err) {
    console.error("[agency-community-images] upload failed", err);
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
      kind: "image",
    })
  ) {
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
    console.warn("[agency-community-images] delete: object missing or already removed", err);
  }
  return NextResponse.json({ ok: true });
}
