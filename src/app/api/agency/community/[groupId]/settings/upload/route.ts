import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Logo/cover/favicon image upload for Agency Community Settings — the
 * agency-scope sibling of `/api/community/[saId]/[groupId]/settings/upload`.
 * Owner-only (settings is an owner action). Admin-SDK write, same rationale
 * as every other agency-community upload route: the owner has no
 * Firebase-Storage-writable client identity scoped to this path either.
 * Does NOT write the URL to Firestore itself — Settings holds it in local
 * edit state until Save Changes PATCHes it in, same convention as tenant.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json(
      { error: "Image uploads aren't configured on this deployment." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  let kind: string = "cover";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const k = form.get("kind");
    if (
      typeof k === "string" &&
      (k === "logo" || k === "cover" || k === "favicon" || k === "card" || k === "event" || k === "live")
    ) {
      kind = k;
    }
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large — keep it under 5 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
    // Same Storage path convention as the tenant settings upload, rooted
    // at a literal "agency" segment so the two ownership scopes can never
    // collide — see storage.rules.
    const path = `community/agency/${caller.agencyId}/${groupId}/${kind}-${Date.now()}.${ext}`;
    const token = randomUUID();
    await getStorage()
      .bucket(bucketName)
      .file(path)
      .save(buffer, {
        resumable: false,
        metadata: {
          contentType: file.type,
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[agency-community-settings-upload] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
