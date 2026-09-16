import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  getAgencyGroupById,
  updateAgencyGroupServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — get/update one Agency-owned community. Owner-only. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  const group = await getAgencyGroupById(caller.agencyId!, groupId);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ group });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  let body: {
    name?: string;
    about?: string;
    status?: "draft" | "published";
    logoUrl?: string | null;
    coverUrl?: string | null;
    brandColor?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await getAgencyGroupById(caller.agencyId!, groupId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "draft" && body.status !== "published") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const group = await updateAgencyGroupServerSide({
    agencyId: caller.agencyId!,
    groupId,
    patch: body,
  });
  return NextResponse.json({ ok: true, group });
}
