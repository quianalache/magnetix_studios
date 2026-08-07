import "server-only";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Client Portal logo upload — same Admin-SDK-bypasses-Storage-rules pattern as the community avatar route. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json(
      { error: "Image uploads aren't configured on this deployment." },
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
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large — keep it under 5 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const path = `portalBranding/${subAccountId}/logo-${Date.now()}.${ext}`;
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

    const ref = getAdminDb().doc(`subAccounts/${subAccountId}`);
    const snap = await ref.get();
    const current = resolvePortalBranding((snap.data() as SubAccountDoc | undefined)?.portalBranding);
    await ref.set(
      { portalBranding: { ...current, logoUrl: url }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[portal-branding/logo] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
