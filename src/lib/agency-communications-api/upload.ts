import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Block image/video-thumbnail upload for the Agency Communications
 *  composer/template editor — owner-only, Admin-SDK write, same reasoning
 *  as every other agency upload route in this codebase (the agency owner
 *  has no Firebase-Storage-writable client identity scoped to this path). */
export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json({ error: "Image uploads aren't configured on this deployment." }, { status: 503 });
  }

  let file: File | null = null;
  let kind = "image";
  let draftId = "unscoped";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const k = form.get("kind");
    if (typeof k === "string" && (k === "image" || k === "video-thumbnail")) kind = k;
    const d = form.get("draftId");
    if (typeof d === "string" && /^[A-Za-z0-9_-]+$/.test(d)) draftId = d;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large — keep it under 5 MB." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
    const path = `broadcasts/agency/${caller.agencyId}/${draftId}/${kind}-${Date.now()}.${ext}`;
    const token = randomUUID();
    await getStorage()
      .bucket(bucketName)
      .file(path)
      .save(buffer, { resumable: false, metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: token } } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[agency-communications-upload] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
