import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteTemplate, updateTemplate } from "@/lib/server/project-service";
import type { ProjectTemplateStep } from "@/types/projects";

function parseSteps(v: unknown): ProjectTemplateStep[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .map((s, i) => {
      const title = typeof s?.title === "string" ? s.title.trim().slice(0, 300) : "";
      return title ? { title, order: i } : null;
    })
    .filter((s): s is ProjectTemplateStep => s !== null);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateTemplate(templateId, {
    title: typeof body.title === "string" ? body.title.trim().slice(0, 200) : undefined,
    category: typeof body.category === "string" ? body.category.trim().slice(0, 100) : undefined,
    durationDays:
      typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
        ? Math.max(0, Math.round(body.durationDays))
        : body.durationDays === null
          ? null
          : undefined,
    description:
      typeof body.description === "string" ? body.description.trim().slice(0, 5000) : undefined,
    steps: parseSteps(body.steps),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await deleteTemplate(templateId);
  return NextResponse.json({ ok: true });
}
