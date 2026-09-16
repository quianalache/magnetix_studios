import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencySectionServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — create a section. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  let body: { name?: string; icon?: string; private?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Section name is required." }, { status: 400 });
  }

  try {
    const section = await createAgencySectionServerSide({
      agencyId: caller.agencyId!,
      groupId,
      name: body.name,
      icon: body.icon ?? "📁",
      private: body.private,
    });
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't create section" },
      { status: 400 },
    );
  }
}
