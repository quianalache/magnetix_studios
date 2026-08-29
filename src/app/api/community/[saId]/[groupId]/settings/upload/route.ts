import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { requireGroupApiAccess } from "@/lib/community/member-context";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Logo/cover/favicon/about/card image upload for Community Settings →
 * General and the About tab's "Edit About" panel, moderator-only. Favicon
 * reuses the exact same validation as logo/cover (image/* MIME + 5MB cap)
 * — the mock-up's "PNG or ICO up to 200KB" guidance is copy shown in the
 * UI, not a stricter enforced limit; `image/x-icon`/`image/vnd.microsoft.
 * icon` (.ico) already satisfy the existing `image/*` check, so no new
 * validation branch was needed. `about`/`card` (2026-08-29 About-tab
 * cleanup) added so a pure Community moderator with no CRM/staff access
 * can upload About media and the Join Card image too — previously only
 * the staff-only, Firebase-client-auth `uploadCommunityImage` supported
 * those two kinds, which a non-staff moderator can never call.
 * Members are NOT Firebase users (see `storage.rules`'s doc comment on the
 * `community/**` path — client Storage writes require `request.auth`, which
 * a member session never has), so this mirrors the same Admin-SDK-upload
 * pattern already proven by `/api/community/[saId]/avatar` — takes the file
 * over the member's authenticated API session, writes via the Admin SDK
 * (rules bypass), and returns a public download URL. Unlike the avatar
 * route, this does NOT write the URL to Firestore itself — Settings holds
 * it in local edit state until the admin presses Save Changes, same as the
 * existing staff-side `ImageUpload` flow (upload now, persist on save).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

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
      (k === "logo" || k === "cover" || k === "favicon" || k === "about" || k === "card")
    )
      kind = k;
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
    return NextResponse.json(
      { error: "Image is too large — keep it under 5 MB." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
    // Same Storage path convention as the staff-side uploadCommunityImage,
    // so both surfaces' images live side by side.
    const path = `community/${saId}/${groupId}/${kind}-${Date.now()}.${ext}`;
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
    console.error("[community/settings/upload] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
