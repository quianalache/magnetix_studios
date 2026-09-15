import { notFound, redirect } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveSpaceIdentifier } from "@/lib/server/space-slug-service";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";
import { PortalLoginView } from "../../portal-login-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function PortalLoginPage({ params, searchParams }: PageProps) {
  let { saId } = await params;
  // Branded Space URLs (2026-09-16) — same resolve-and-redirect contract
  // as PortalHomeView's own identical comment; see that one for the full
  // reasoning. `saId` is reassigned to the real subAccountId so the
  // Firestore read below and everything this page passes to
  // PortalLoginView keeps behaving exactly as it already did.
  const resolved = await resolveSpaceIdentifier(saId);
  if (!resolved) notFound();
  if (saId !== resolved.canonicalSlug) {
    redirect(`/portal/${resolved.canonicalSlug}/login`);
  }
  saId = resolved.subAccountId;

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;

  const sp = await searchParams;

  return (
    <PortalLoginView
      saId={saId}
      branding={resolvePortalBranding(sub.portalBranding)}
      fallbackName={sub.name ?? "your portal"}
      errorCode={sp.error}
    />
  );
}
