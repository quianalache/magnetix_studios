import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicAuthShell } from "@/components/public/public-shell";
import { PersonResetPasswordForm } from "@/components/mymagnetix/person-reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set your password · MyMagnetix" };

export default async function MyMagnetixPasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) notFound();

  return (
    <PublicAuthShell
      variant={{ kind: "magnetix" }}
      title="Set your MyMagnetix password"
      description="One password for MyMagnetix — separate from any individual business’s Client Portal password."
    >
      <PersonResetPasswordForm token={token} />
    </PublicAuthShell>
  );
}
