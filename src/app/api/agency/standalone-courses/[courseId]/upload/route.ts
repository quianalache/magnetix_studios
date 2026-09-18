import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Cover/lesson image upload for Agency Standalone Courses — owner-only,
 *  Admin-SDK write (the agency owner has no Firebase-Storage-writable
 *  client identity scoped to this path, matching every other agency
 *  upload route in this codebase). Does NOT write the URL to Firestore
 *  itself — the wizard/lesson editor holds it in local state until Save. */
export async function POST(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json({ error: "Image uploads aren't configured on this deployment." }, { status: 503 });
  }

  let file: File | null = null;
  let kind = "cover";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const k = form.get("kind");
    if (typeof k === "string" && (k === "cover" || k === "lesson" || k === "instructor-headshot" || k === "logo" || k === "favicon")) {
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
    const path = `standalone-courses/agency/${caller.agencyId}/${courseId}/${kind}-${Date.now()}.${ext}`;
    const token = randomUUID();
    await getStorage()
      .bucket(bucketName)
      .file(path)
      .save(buffer, { resumable: false, metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: token } } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[agency-standalone-course-upload] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
