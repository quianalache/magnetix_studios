import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { isWellFormedFormId, pageSubAccountId, resolveFormsForSubAccount } from "@/lib/server/page-form-resolver";

/**
 * Form-block resolver for the builder canvas and Preview (client components
 * that can't read Forms directly — `/forms/{id}` is member-only).
 *
 * Tenant safety (2026-11-03): the caller names the PAGE being edited
 * (`pageId`) and the `formId`. The workspace is the page's own
 * `subAccountId`, read server-side — a client-supplied workspace id is never
 * trusted — and the caller must be able to open that workspace. The Form
 * must belong to it. Every failure (unknown page, no access, missing,
 * malformed or foreign Form) is the same 404 with no body, so the response
 * never reveals whether a foreign Form exists.
 *
 * Published pages don't use this route: they resolve Forms server-side
 * through the same `resolveFormsForSubAccount`.
 */
const notFound = () => NextResponse.json(null, { status: 404 });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const formId = params.get("formId");
  const pageId = params.get("pageId");
  if (!isWellFormedFormId(formId) || !pageId) return notFound();

  const subAccountId = await pageSubAccountId(pageId);
  if (!subAccountId) return notFound();
  const access = await requireSubAccountMember(req, subAccountId);
  if (access instanceof NextResponse) return notFound();

  const form = (await resolveFormsForSubAccount(subAccountId, [formId]))[formId];
  return form ? NextResponse.json(form) : notFound();
}
