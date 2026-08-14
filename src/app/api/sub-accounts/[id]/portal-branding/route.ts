import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolvePortalBranding } from "@/types/portal-branding";
import type {
  PortalBranding,
  PortalModuleVisibility,
  PortalPromotionConfig,
  PortalPromotionType,
} from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists)
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  const sub = snap.data() as SubAccountDoc;
  return NextResponse.json({
    ok: true,
    branding: resolvePortalBranding(sub.portalBranding),
  });
}

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function nullableStr(v: unknown, max = 2000): string | null {
  const s = str(v, max);
  return s || null;
}
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function isPromotionType(v: unknown): v is PortalPromotionType {
  return v === "course" || v === "booking" || v === "offer" || v === "custom";
}

function safeUrl(v: unknown): string | null {
  const s = nullableStr(v, 1000);
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? s : null;
  } catch {
    return null;
  }
}

function parsePromotions(
  v: unknown,
  fallback: PortalPromotionConfig[]
): PortalPromotionConfig[] {
  if (!Array.isArray(v)) return fallback;
  const now = Date.now();
  return v
    .slice(0, 6)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      if (!isPromotionType(raw.type)) return null;
      return {
        id: str(raw.id, 80) || `promo-${now}-${index}`,
        type: raw.type,
        targetId: raw.type === "custom" ? null : nullableStr(raw.targetId, 200),
        titleOverride: nullableStr(raw.titleOverride, 120),
        descriptionOverride: nullableStr(raw.descriptionOverride, 240),
        urlOverride: safeUrl(raw.urlOverride),
        hidden: raw.hidden === true,
        order:
          typeof raw.order === "number" && Number.isFinite(raw.order)
            ? raw.order
            : index,
      };
    })
    .filter((item): item is PortalPromotionConfig => item !== null)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}

export async function PATCH(
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

  const ref = getAdminDb().doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  const current = resolvePortalBranding(
    (snap.data() as SubAccountDoc).portalBranding
  );

  const modulesPatch =
    body.modules && typeof body.modules === "object"
      ? (body.modules as Record<string, unknown>)
      : null;
  const modules: PortalModuleVisibility = modulesPatch
    ? {
        appointments:
          typeof modulesPatch.appointments === "boolean"
            ? modulesPatch.appointments
            : current.modules.appointments,
        courses:
          typeof modulesPatch.courses === "boolean"
            ? modulesPatch.courses
            : current.modules.courses,
        projects:
          typeof modulesPatch.projects === "boolean"
            ? modulesPatch.projects
            : current.modules.projects,
        readings:
          typeof modulesPatch.readings === "boolean"
            ? modulesPatch.readings
            : current.modules.readings,
        sessions:
          typeof modulesPatch.sessions === "boolean"
            ? modulesPatch.sessions
            : current.modules.sessions,
        invoices:
          typeof modulesPatch.invoices === "boolean"
            ? modulesPatch.invoices
            : current.modules.invoices,
        community:
          typeof modulesPatch.community === "boolean"
            ? modulesPatch.community
            : current.modules.community,
      }
    : current.modules;

  const next: PortalBranding = {
    portalName:
      "portalName" in body
        ? nullableStr(body.portalName, 100)
        : current.portalName,
    welcomeMessage:
      typeof body.welcomeMessage === "string"
        ? str(body.welcomeMessage, 400)
        : current.welcomeMessage,
    logoUrl:
      "logoUrl" in body ? nullableStr(body.logoUrl, 1000) : current.logoUrl,
    accentColor:
      typeof body.accentColor === "string" && HEX_RE.test(body.accentColor)
        ? body.accentColor
        : current.accentColor,
    supportEmail:
      "supportEmail" in body
        ? nullableStr(body.supportEmail, 200)
        : current.supportEmail,
    modules,
    promotions:
      "promotions" in body
        ? parsePromotions(body.promotions, current.promotions)
        : current.promotions,
  };

  await ref.set(
    { portalBranding: next, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return NextResponse.json({ ok: true, branding: next });
}
