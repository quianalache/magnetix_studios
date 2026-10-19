import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { cleanupEmbedTestRecords, getEmbedConfig } from "@/lib/server/embed-config-service";

/** Test cleanup: removes this Embed's Test Readings and test-only Contacts. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; embedId: string }> }) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!(await getEmbedConfig(subAccountId, embedId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const removed = await cleanupEmbedTestRecords(subAccountId, embedId);
  return NextResponse.json({ ok: true, removed });
}
