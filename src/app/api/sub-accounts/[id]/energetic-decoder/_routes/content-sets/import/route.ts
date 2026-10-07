import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { importContentSet } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

/**
 * Import a Magnetix content set export. `{ file, commit: false }` validates
 * and returns a preview (nothing written); `{ file, commit: true, name? }`
 * creates a NEW Draft set — an import never overwrites an existing set.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as { file?: unknown; commit?: unknown; name?: unknown };
  try {
    const result = await importContentSet(subAccountId, access, body.file, {
      commit: body.commit === true,
      name: typeof body.name === "string" ? body.name : undefined,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
