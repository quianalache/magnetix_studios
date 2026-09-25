import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import { getContactAccessSummary } from "@/lib/server/contact-access-service";

export const dynamic = "force-dynamic";

/**
 * Contact → Purchases & Access summary (Contacts redesign, 2026-09-25).
 * Read projection of existing purchases / enrollments / memberships for the
 * contact's member identity. Any member with access to the contact.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  const summary = await getContactAccessSummary(guard.contact);
  return NextResponse.json({ ...summary, canManage: guard.isAdmin });
}
