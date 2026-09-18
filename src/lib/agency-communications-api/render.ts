import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { buildAgencyUnsubscribeUrl } from "@/lib/automations/agency-unsubscribe-token";
import { renderBroadcastEmailHtml, renderBroadcastEmailText } from "@/lib/broadcasts/render-email";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

interface RenderBody {
  content?: BroadcastContent;
  subject?: string;
  preheader?: string | null;
}

/** Composer live-preview endpoint — the agency-scope sibling of
 *  /api/broadcasts/render, same byte-for-byte-with-the-real-send contract. */
export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let payload: RenderBody;
  try {
    payload = (await request.json()) as RenderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const brand = await resolveCustomBrand();
  const unsubscribeUrl = buildAgencyUnsubscribeUrl("preview@magnetix.invalid");
  const opts = { unsubscribeUrl, mailingAddress: "", businessName: brand.name };
  const html = renderBroadcastEmailHtml(payload.content, opts, payload.subject, payload.preheader);
  const text = renderBroadcastEmailText(payload.content, opts, payload.subject, payload.preheader);

  return NextResponse.json({ html, text });
}
