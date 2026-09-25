import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  ContactListError,
  deleteContactList,
  getContactList,
  toContactListView,
  updateContactList,
} from "@/lib/server/contact-lists-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; listId: string }> };

async function caller(request: Request, subAccountId: string) {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  return {
    access,
    who: {
      uid: access.uid,
      isAdmin:
        access.subAccountRole === "admin" ||
        access.subAccountRole === "agencyOwner",
    },
  };
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ContactListError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, listId } = await ctx.params;
  const c = await caller(request, subAccountId);
  if (c instanceof NextResponse) return c;
  const list = await getContactList(subAccountId, listId);
  if (!list) {
    return NextResponse.json({ error: "Contact List not found." }, { status: 404 });
  }
  return NextResponse.json({ list: toContactListView(list, c.who) });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, listId } = await ctx.params;
  const c = await caller(request, subAccountId);
  if (c instanceof NextResponse) return c;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const list = await updateContactList({
      subAccountId,
      listId,
      caller: c.who,
      name: body.name,
      description: body.description,
      group: body.group,
    });
    return NextResponse.json({ list: toContactListView(list, c.who) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, listId } = await ctx.params;
  const c = await caller(request, subAccountId);
  if (c instanceof NextResponse) return c;
  try {
    await deleteContactList({ subAccountId, listId, caller: c.who });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
