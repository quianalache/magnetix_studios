import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import {
  ContactAccessError,
  grantAccessForContact,
} from "@/lib/server/contact-access-service";

export const dynamic = "force-dynamic";

/**
 * Grant complimentary access `{ key: "community:{id}" | "course:{id}" |
 * "offer:{id}" }` from the Contact profile. Sub-account admins / agency
 * owner only. See contact-access-service.ts for what is (and isn't)
 * grantable and why — no purchase or payment record is ever created.
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
    const outcome = await grantAccessForContact({
      contact: guard.contact,
      key: typeof body.key === "string" ? body.key : "",
      staffUid: guard.access.uid,
    });
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof ContactAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
