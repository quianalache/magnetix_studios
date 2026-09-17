import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  updateAgencyGroupServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — get one Agency-owned community. Owner OR an active
 *  member of it (real access — see agency-community-access.ts). Includes
 *  the resolved agency brand name for member-facing "presented by" chrome
 *  (About page) — always agency-level branding, never a sub-account's. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const group = await getAgencyGroupById(caller.agencyId, groupId);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const brandName = await resolveBrandName();
  return NextResponse.json({ group, brandName });
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
