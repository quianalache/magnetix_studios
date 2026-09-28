import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listMediaLibrary, tenantOf, uploadMediaFile } from "@/lib/server/assets/media-library-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";
import type { MediaLibraryKind } from "@/types/media-library";

export const dynamic = "force-dynamic";

/**
 * Media Library list (any member of the sub-account) — `?kind=video&ready=1`
 * powers the existing-file pickers. Only this sub-account's records are
 * ever read.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind = (["image", "video", "document", "other"] as const).includes(kindParam as MediaLibraryKind)
    ? (kindParam as MediaLibraryKind)
    : undefined;
  try {
    const items = await listMediaLibrary(await tenantOf(subAccountId), { kind, readyOnly: url.searchParams.get("ready") === "1" });
    return NextResponse.json({ items });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}

/** Upload an image or document (sub-account admins). Videos use the existing Bunny upload. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let file: File | null = null;
  let title = "";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const t = form.get("title");
    if (typeof t === "string") title = t;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  try {
    const item = await uploadMediaFile(await tenantOf(subAccountId), access.uid, file, title);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
