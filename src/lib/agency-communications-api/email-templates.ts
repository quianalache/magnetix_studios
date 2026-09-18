import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyEmailTemplates, createAgencyEmailTemplateServerSide } from "@/lib/server/agency-email-templates-service";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

/** Owner-only Agency Email Templates — list + create. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const templates = await listAgencyEmailTemplates(caller.agencyId!);
  return NextResponse.json({ ok: true, templates });
}

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: { name?: string; subject?: string; preheader?: string | null; content?: BroadcastContent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim() || !body.content) {
    return NextResponse.json({ error: "A name and content are required" }, { status: 400 });
  }

  const id = await createAgencyEmailTemplateServerSide({
    agencyId: caller.agencyId!,
    createdByUid: caller.uid,
    name: body.name,
    subject: body.subject ?? "",
    preheader: body.preheader ?? null,
    content: body.content,
  });
  return NextResponse.json({ ok: true, id });
}
