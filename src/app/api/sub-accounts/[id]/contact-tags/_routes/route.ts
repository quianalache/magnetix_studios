import "server-only";

import { NextResponse } from "next/server";
import { createTag, listTags } from "@/lib/server/contact-tags/service";
import { readJsonBody, tagErrorResponse, tagRouteAccess } from "@/lib/server/contact-tags/route-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Tags library: every tag with contact + usage counts. `?names=1` → names only (suggestions). */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    const data = await listTags({ subAccountId, territoryIds: access.territoryIds, canManage: access.canManage });
    if (new URL(request.url).searchParams.get("names") === "1") {
      return NextResponse.json({ names: data.tags.map((t) => t.name) });
    }
    return NextResponse.json(data);
  } catch (err) {
    return tagErrorResponse(err);
  }
}

/** New tag: `{ name }`. 409 `exists` points at the existing tag. */
export async function POST(request: Request, ctx: Ctx) {
  const { id: subAccountId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const tag = await createTag({ subAccountId, agencyId: access.agencyId, name: body.name, uid: access.uid });
    return NextResponse.json({ tag }, { status: 201 });
  } catch (err) {
    return tagErrorResponse(err);
  }
}
