import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
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
  const subName = (subSnap.data()?.name as string | undefined) ?? "your portal";

  const sp = await searchParams;

  return <PortalLoginView saId={saId} subName={subName} errorCode={sp.error} />;
}
