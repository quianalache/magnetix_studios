import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import {
  ContactAccessError,
  revokeComplimentaryAccessForContact,
} from "@/lib/server/contact-access-service";

export const dynamic = "force-dynamic";

/**
 * Revoke COMPLIMENTARY course or community access granted from Contacts
 * `{ key: "community:{id}" | "course:{id}" }`. Admin / agency owner only.
 * Never removes access that a paid purchase or a linked product
 * independently provides.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id, { admin: true });
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await revokeComplimentaryAccessForContact({
      contact: guard.contact,
      key: typeof body.key === "string" ? body.key : "",
      staffUid: guard.access.uid,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContactAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
