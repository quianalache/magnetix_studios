import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";
import { PortalLoginView } from "../../portal-login-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function PortalLoginPage({ params, searchParams }: PageProps) {
  const { saId } = await params;
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
