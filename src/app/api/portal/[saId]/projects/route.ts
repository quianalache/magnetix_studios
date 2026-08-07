import "server-only";

import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import { getAdminDb } from "@/lib/firebase/admin";
import { createProject } from "@/lib/server/project-service";

/** Client Portal: a student starting their own project, per her explicit "I would like for a student to be able to put together a project maybe on their own if they wanted to." Always self-assigned — a member can never set someone else's assignedContactId. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string }> },
) {
  const { saId } = await ctx.params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!member.contactId) {
    return NextResponse.json(
      { error: "Your account isn't fully set up yet — contact us for help." },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  const project = await createProject({
    agencyId,
    subAccountId: saId,
    title,
    description:
      typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "",
    startAt: parseDate(body.startAt),
    dueAt: parseDate(body.dueAt),
    assignedContactId: member.contactId,
    assignedContactName: member.displayName ?? null,
    createdByUid: null,
    createdByMemberId: member.id,
  });

  return NextResponse.json({ ok: true, project }, { status: 201 });
}
