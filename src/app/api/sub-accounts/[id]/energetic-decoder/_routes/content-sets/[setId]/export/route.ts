import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { exportContentSet } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

/** JSON export of one set's written text (blank entries omitted). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; setId: string }> }) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    const file = await exportContentSet(subAccountId, setId);
    const slug = file.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "content-set";
    return new NextResponse(JSON.stringify(file, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.content-set.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
