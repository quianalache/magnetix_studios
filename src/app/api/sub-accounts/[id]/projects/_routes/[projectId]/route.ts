import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/lib/server/project-service";

function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadScopedProject(subAccountId: string, projectId: string) {
  const project = await getProject(projectId);
  if (!project || project.subAccountId !== subAccountId) return null;
  return project;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: subAccountId, projectId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await loadScopedProject(subAccountId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.title === "string") patch.title = str(body.title, 200);
  if (typeof body.description === "string") patch.description = str(body.description, 5000);
  if (body.status === "active" || body.status === "archived") patch.status = body.status;
  if ("startAt" in body) patch.startAt = parseDate(body.startAt);
  if ("dueAt" in body) patch.dueAt = parseDate(body.dueAt);
  if ("assignedContactId" in body) {
    const assignedContactId =
      typeof body.assignedContactId === "string" && body.assignedContactId
        ? body.assignedContactId
        : null;
    patch.assignedContactId = assignedContactId;
    if (assignedContactId) {
      const contactSnap = await getAdminDb().doc(`contacts/${assignedContactId}`).get();
      patch.assignedContactName = (contactSnap.data()?.name as string | undefined) ?? null;
    } else {
      patch.assignedContactName = null;
    }
  }

  await updateProject(projectId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: subAccountId, projectId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await loadScopedProject(subAccountId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await deleteProject(projectId);
  return NextResponse.json({ ok: true });
}
