import { notFound } from "next/navigation";
import { PersonResetPasswordForm } from "@/components/mymagnetix/person-reset-password-form";

export const dynamic = "force-dynamic";

export default async function MyMagnetixPasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">Set your MyMagnetix password</h1>
        <p className="mt-2 text-sm text-[#909090]">
          One password for MyMagnetix — separate from any individual business&rsquo;s Client Portal password.
        </p>
        <PersonResetPasswordForm token={token} />
      </div>
    </div>
  );
}
