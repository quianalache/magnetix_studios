import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createProject, listProjectsForSubAccount } from "@/lib/server/project-service";

function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const projects = await listProjectsForSubAccount(
    subAccountId,
    status === "active" || status === "archived" ? status : undefined,
  );
  return NextResponse.json({ ok: true, projects });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = str(body.title, 200);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const assignedContactId =
    typeof body.assignedContactId === "string" && body.assignedContactId
      ? body.assignedContactId
      : null;
  let assignedContactName: string | null = null;
  if (assignedContactId) {
    const contactSnap = await getAdminDb()
      .doc(`contacts/${assignedContactId}`)
      .get();
    assignedContactName = (contactSnap.data()?.name as string | undefined) ?? null;
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const project = await createProject({
    agencyId,
    subAccountId,
    title,
    description: str(body.description, 5000),
    startAt: parseDate(body.startAt),
    dueAt: parseDate(body.dueAt),
    assignedContactId,
    assignedContactName,
    createdByUid: access.uid,
    createdByMemberId: null,
    templateId: typeof body.templateId === "string" ? body.templateId : null,
  });

  return NextResponse.json({ ok: true, project }, { status: 201 });
}
