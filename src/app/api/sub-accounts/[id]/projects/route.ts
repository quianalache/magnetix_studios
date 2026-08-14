import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createProject,
  getTemplate,
  listProjectsForSubAccount,
} from "@/lib/server/project-service";
import { projectTemplateAudience } from "@/types/projects";

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
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const projects = await listProjectsForSubAccount(
    subAccountId,
    status === "active" || status === "archived" ? status : undefined
  );
  return NextResponse.json({ ok: true, projects });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
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
    if (
      !contactSnap.exists ||
      contactSnap.data()?.subAccountId !== subAccountId
    ) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    assignedContactName =
      (contactSnap.data()?.name as string | undefined) ?? null;
  }

  const templateId =
    typeof body.templateId === "string" && body.templateId
      ? body.templateId
      : null;
  if (templateId) {
    const template = await getTemplate(templateId);
    if (!template || template.subAccountId !== subAccountId) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }
    const expectedAudience = assignedContactId ? "client" : "internal";
    if (projectTemplateAudience(template) !== expectedAudience) {
      return NextResponse.json(
        {
          error: assignedContactId
            ? "Choose a client project template for assigned projects."
            : "Choose an internal template for unassigned projects.",
        },
        { status: 400 }
      );
    }
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId =
    (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

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
    templateId,
  });

  return NextResponse.json({ ok: true, project }, { status: 201 });
}
