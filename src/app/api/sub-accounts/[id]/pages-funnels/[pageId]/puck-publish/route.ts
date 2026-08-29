import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { publishPuckPage } from "@/lib/server/pages-funnels-puck-service";
import type { Data as PuckData } from "@puckeditor/core";

/**
 * Publish — snapshots the payload `data` into BOTH `puckDraftData` and
 * `puckPublishedData` in one atomic write (see
 * `pages-funnels-puck-service.ts`'s `publishPuckPage` doc comment for why).
 * Sub-account admin only, same gate `puck-draft` uses.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; pageId: string }> }
) {
  const { id: subAccountId, pageId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = (body as { data?: PuckData } | null)?.data;
  if (!data || typeof data !== "object" || !Array.isArray(data.content)) {
    return NextResponse.json(
      { error: "Missing or invalid `data`" },
      { status: 400 }
    );
  }

  const result = await publishPuckPage(subAccountId, pageId, data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
