import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { savePuckDraft } from "@/lib/server/pages-funnels-puck-service";
import type { Data as PuckData } from "@puckeditor/core";

/**
 * Save Draft (manual and autosave both call this — see
 * `pages-funnels-puck-service.ts`'s own doc comment for why there is
 * exactly one save code path). Sub-account admin only, same gate V1's own
 * publish/save Firestore rule already enforces for this collection.
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

  const result = await savePuckDraft(subAccountId, pageId, data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
