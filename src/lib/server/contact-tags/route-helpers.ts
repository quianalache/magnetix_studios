import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { TagServiceError } from "./service";

export interface TagRouteAccess {
  uid: string;
  agencyId: string;
  /** Workspace admin / agency owner — may rename, merge and delete. */
  canManage: boolean;
  /** Contact counts follow the caller's territories (null = everything). */
  territoryIds: string[] | null;
}

/**
 * Auth for every /contact-tags route (Contacts & Tags, 2026-11). Any active
 * member may read the library and create a tag (they can already tag a
 * contact); rename / merge / delete rewrite workflows, forms and other
 * settings, so they need a workspace admin — enforced here on the server,
 * not just hidden in the UI.
 */
export async function tagRouteAccess(
  request: Request,
  subAccountId: string,
  opts: { manage?: boolean } = {},
): Promise<TagRouteAccess | NextResponse> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const canManage = access.subAccountRole === "admin" || access.subAccountRole === "agencyOwner";
  if (opts.manage && !canManage) {
    return NextResponse.json({ error: "Only workspace admins can change tags across the workspace." }, { status: 403 });
  }
  const sub = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = String(sub.get("agencyId") ?? "");
  const scope = await loadEffectiveTerritoryScope(access);
  return {
    uid: access.uid,
    agencyId,
    canManage,
    territoryIds: scope.enforce ? (scope.ids ?? []) : null,
  };
}

export function tagErrorResponse(err: unknown): NextResponse {
  if (err instanceof TagServiceError) {
    return NextResponse.json({ error: err.message, code: err.code, ...err.extra }, { status: err.status });
  }
  console.error("[contact-tags] route failed", err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
