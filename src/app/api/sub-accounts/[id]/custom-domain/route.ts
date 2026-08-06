import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { vercelApiConfigured } from "@/lib/vercel/client";
import {
  addCustomDomain,
  removeCustomDomain,
  setCustomDomainRootRedirect,
  validateCustomDomain,
} from "@/lib/domains/custom-domain-service";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Manage the sub-account's public-facing custom domain (booking/decoder/
 * courses/portal — see `src/lib/domains/custom-domain-service.ts`). Mirrors
 * the shape of the sibling `/resend` route (email sending domain): POST adds/
 * replaces, GET reads the persisted state, DELETE detaches, PATCH updates the
 * root-redirect setting. Live verification is a separate POST to `./verify`.
 */

interface PostBody {
  domain?: string;
}

interface PatchBody {
  rootRedirectUrl?: string | null;
}

async function loadGatedSubAccount(subAccountId: string) {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return (snap.data() ?? {}) as Partial<SubAccountDoc>;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!vercelApiConfigured()) {
    return NextResponse.json(
      { error: "Vercel isn't configured on this deployment (VERCEL_TOKEN/VERCEL_PROJECT_ID)." },
      { status: 503 },
    );
  }

  const sub = await loadGatedSubAccount(subAccountId);
  if (sub.customDomainEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The custom domain feature is disabled for this sub-account. Ask your agency owner to enable it.",
      },
      { status: 403 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateCustomDomain(body.domain ?? "");
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const record = await addCustomDomain({ subAccountId, domain: validation.domain });
    return NextResponse.json({ ok: true, customDomain: record });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to register the domain with Vercel." },
      { status: 502 },
    );
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const sub = await loadGatedSubAccount(subAccountId);
  return NextResponse.json({ ok: true, customDomain: sub.customDomain ?? null });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await setCustomDomainRootRedirect({
      subAccountId,
      rootRedirectUrl: body.rootRedirectUrl?.trim() || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await removeCustomDomain(subAccountId);
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return NextResponse.json({ ok: true });
}
