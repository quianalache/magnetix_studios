import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  loadAgencyEmailTemplate,
  saveAgencyEmailTemplateServerSide,
  deleteAgencyEmailTemplateServerSide,
} from "@/lib/server/agency-email-templates-service";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const template = await loadAgencyEmailTemplate(caller.agencyId!, id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, template });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;

  let body: { name?: string; subject?: string; preheader?: string | null; content?: BroadcastContent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.content) return NextResponse.json({ error: "content is required" }, { status: 400 });

  await saveAgencyEmailTemplateServerSide({
    agencyId: caller.agencyId!,
    id,
    name: body.name ?? "",
    subject: body.subject ?? "",
    preheader: body.preheader ?? null,
    content: body.content,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  await deleteAgencyEmailTemplateServerSide(caller.agencyId!, id);
  return NextResponse.json({ ok: true });
}
