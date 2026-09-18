import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Thumbnail/theme image upload for Agency Course Offers — owner-only,
 *  Admin-SDK write, same reasoning as the sibling Standalone Course upload
 *  route. Does NOT write the URL to Firestore itself — the caller holds it
 *  in local state until Save. */
export async function POST(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json({ error: "Image uploads aren't configured on this deployment." }, { status: 503 });
  }

  let file: File | null = null;
  let kind = "thumbnail";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const k = form.get("kind");
    if (typeof k === "string" && ["thumbnail", "hero", "block", "background"].includes(k)) {
      kind = k;
    }
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large — keep it under 5 MB." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
    const path = `course-offers/agency/${caller.agencyId}/${offerId}/${kind}-${Date.now()}.${ext}`;
    const token = randomUUID();
    await getStorage()
      .bucket(bucketName)
      .file(path)
      .save(buffer, { resumable: false, metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: token } } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[agency-course-offer-upload] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
