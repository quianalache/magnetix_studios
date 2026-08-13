import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { MemberResetPasswordForm } from "@/components/member-auth/member-reset-password-form";

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Set your password
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Choose a password for future Portal, Community, and Course sign-ins.
        </p>
        <MemberResetPasswordForm
          saId={saId}
          token={sp.token}
          nextPath={sp.next}
        />
      </div>
    </div>
  );
}
