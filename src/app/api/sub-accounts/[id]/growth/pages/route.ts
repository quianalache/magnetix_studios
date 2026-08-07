import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { addPagePerformance, listPagePerformance } from "@/lib/server/growth-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const pages = await listPagePerformance(subAccountId);
  return NextResponse.json({ ok: true, pages });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string; url?: string; pageType?: string };
  try {
    body = (await request.json()) as { title?: string; url?: string; pageType?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim().slice(0, 200);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const page = await addPagePerformance({
    agencyId,
    subAccountId,
    title,
    url: (body.url ?? "").trim().slice(0, 500),
    pageType: (body.pageType ?? "").trim().slice(0, 80) || "Sales Page",
  });
  return NextResponse.json({ ok: true, page }, { status: 201 });
}
