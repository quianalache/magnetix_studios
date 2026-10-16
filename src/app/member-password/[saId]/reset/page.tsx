import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Metadata } from "next";
import { PublicAuthShell } from "@/components/public/public-shell";
import { MemberResetPasswordForm } from "@/components/member-auth/member-reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set your password" };

export default async function MemberPasswordResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { saId } = await params;
  const sp = await searchParams;
  if (!sp.token) notFound();
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();

  const businessName = ((subSnap.data()?.name as string | undefined) ?? "").trim() || "Your account";
  return (
    <PublicAuthShell
      variant={{ kind: "tenant", brand: { name: businessName } }}
      title="Set your password"
      description="Choose a password for future Portal, Community, and Course sign-ins."
    >
      <MemberResetPasswordForm saId={saId} token={sp.token} nextPath={sp.next} />
    </PublicAuthShell>
  );
}
