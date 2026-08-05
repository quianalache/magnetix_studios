import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { PortalLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  inactive:
    "Your account is no longer active. Contact us if you think this is a mistake.",
  error: "Something went wrong signing you in. Request a new link below.",
};

export default async function PortalLoginPage({ params, searchParams }: PageProps) {
  const { saId } = await params;
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const subName = (subSnap.data()?.name as string | undefined) ?? "your portal";

  const sp = await searchParams;
  const errorMessage = sp.error ? ERROR_MESSAGES[sp.error] ?? null : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Sign in to {subName}
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Enter your email and we&apos;ll send you a one-tap sign-in link. No
          password needed.
        </p>
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}
        <PortalLoginForm saId={saId} />
      </div>
    </div>
  );
}
