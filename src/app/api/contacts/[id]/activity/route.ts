import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import {
  listContactActivity,
  parseActivityFilter,
} from "@/lib/server/contact-feed-service";

export const dynamic = "force-dynamic";

/**
 * Contact Activity tab (Contacts redesign, 2026-09-25) — one page,
 * newest first. `?cursor=` from the previous page, `?filter=` a category
 * from lib/contacts/activity-categories.ts. Any member with access to the
 * contact (territory-scoped).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  const params = new URL(request.url).searchParams;
  const page = await listContactActivity({
    subAccountId: guard.contact.subAccountId,
    contactId: id,
    cursor: params.get("cursor"),
    filter: parseActivityFilter(params.get("filter")),
  });
  return NextResponse.json(page);
}
