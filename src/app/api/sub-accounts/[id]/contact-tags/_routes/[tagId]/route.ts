import "server-only";

import { NextResponse } from "next/server";
import { deleteTag, getTagDetail, renameTag } from "@/lib/server/contact-tags/service";
import { readJsonBody, tagErrorResponse, tagRouteAccess } from "@/lib/server/contact-tags/route-helpers";
import { TAG_USAGE_TYPES, type TagUsageType } from "@/types/contact-tags";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; tagId: string }> };

/** Tag detail + where it's used. `?more=<type>&offset=<n>` pages one section. */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, tagId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const moreType = url.searchParams.get("more");
  const more =
    moreType && (TAG_USAGE_TYPES as string[]).includes(moreType)
      ? { type: moreType as TagUsageType, offset: Number(url.searchParams.get("offset") ?? 0) || 0 }
      : null;
  try {
    return NextResponse.json(
      await getTagDetail({ subAccountId, tagId, territoryIds: access.territoryIds, canManage: access.canManage, more }),
    );
  } catch (err) {
    return tagErrorResponse(err);
  }
}

/** Rename: `{ name }` (admins). Updates contacts and every setting that names the tag. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, tagId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId, { manage: true });
  if (access instanceof NextResponse) return access;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    return NextResponse.json(
      await renameTag({ subAccountId, agencyId: access.agencyId, tagId, newName: body.name, uid: access.uid }),
    );
  } catch (err) {
    return tagErrorResponse(err);
  }
}

/** Delete: `{ confirmName, expectedReferenceCount }` (admins). Re-checked server-side. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, tagId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId, { manage: true });
  if (access instanceof NextResponse) return access;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    return NextResponse.json(
      await deleteTag({
        subAccountId,
        tagId,
        uid: access.uid,
        confirmName: body.confirmName,
        expectedReferenceCount: body.expectedReferenceCount,
      }),
    );
  } catch (err) {
    return tagErrorResponse(err);
  }
}
