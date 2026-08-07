import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createTemplate, listTemplates } from "@/lib/server/project-service";
import type { ProjectTemplateStep } from "@/types/projects";

function parseSteps(v: unknown): ProjectTemplateStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s, i) => {
      const title = typeof s?.title === "string" ? s.title.trim().slice(0, 300) : "";
      return title ? { title, order: i } : null;
    })
    .filter((s): s is ProjectTemplateStep => s !== null);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const templates = await listTemplates(subAccountId);
  return NextResponse.json({ ok: true, templates });
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

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const template = await createTemplate({
    agencyId,
    subAccountId,
    title,
    category: typeof body.category === "string" ? body.category.trim().slice(0, 100) : "",
    durationDays:
      typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
        ? Math.max(0, Math.round(body.durationDays))
        : null,
    description:
      typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "",
    steps: parseSteps(body.steps),
  });
  return NextResponse.json({ ok: true, template }, { status: 201 });
}
