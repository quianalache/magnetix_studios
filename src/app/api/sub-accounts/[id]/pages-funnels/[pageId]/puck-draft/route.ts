import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { savePuckDraft } from "@/lib/server/pages-funnels-puck-service";
import { versionActor } from "@/lib/server/pages-funnels/page-version-core";
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
  const popups = (body as { popups?: unknown } | null)?.popups;
  if (!data || typeof data !== "object" || !Array.isArray(data.content)) {
    return NextResponse.json(
      { error: "Missing or invalid `data`" },
      { status: 400 }
    );
  }

  // Version History (2026-11-17): Save Draft says it's a manual save (a
  // history checkpoint); autosave doesn't. `baseRevision` is the draft
  // revision the editor last saw — a stale one is refused as a conflict.
  const kind = (body as { kind?: unknown }).kind === "manual" ? "manual" : "auto";
  const rawRevision = (body as { baseRevision?: unknown }).baseRevision;
  const baseRevision = typeof rawRevision === "number" && Number.isInteger(rawRevision) && rawRevision >= 0 ? rawRevision : null;
  const result = await savePuckDraft(subAccountId, pageId, data, popups as never, {
    kind,
    baseRevision,
    actor: await versionActor(access.uid),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, revision: result.revision });
}
