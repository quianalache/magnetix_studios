import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  listContentItemsForSubAccount,
  listContentTemplatesForSubAccount,
} from "@/lib/server/content-library-service";

export const dynamic = "force-dynamic";

/**
 * Server-verified fallback for the Content Library page (2026-08-30
 * CRM-wide stability pass). Content Library previously had NO server
 * baseline at all — its Pipeline/Templates tabs were 100% dependent on
 * two client-only Firestore listeners with no distinction between "still
 * loading" and "confirmed zero," the same false-empty risk class already
 * found and fixed for Community/Courses (see `useResilientList`'s own
 * doc comment). Reproduced live: when the client listener degraded under
 * the firebase-js-sdk#9267 corrupted-state condition, the page rendered
 * as a fully-loaded pipeline with zero cards in every stage — visually
 * indistinguishable from a genuinely empty pipeline, not an error state
 * a customer would think to report as a bug.
 *
 * `requireSubAccountMember` matches who can already view this page —
 * not a new or looser check.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const [items, templates] = await Promise.all([
    listContentItemsForSubAccount(subAccountId),
    listContentTemplatesForSubAccount(subAccountId),
  ]);

  return NextResponse.json({ ok: true, items, templates });
}
