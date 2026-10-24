import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";
import type { Metadata } from "next";
import { PublicAuthShell } from "@/components/public/public-shell";
import { CUSTOM_BRAND } from "@/config/landing";

export const metadata: Metadata = { title: `Create your account · ${CUSTOM_BRAND.name}` };

export default function SignupPage() {
  return (
    <PublicAuthShell
      variant={{ kind: "magnetix" }}
      title="Create your account"
      description="Start closing with the CRM your team will actually use."
    >
      {/* Suspense required because SignupForm reads ?email= via
          useSearchParams to pre-fill from invite links. */}
      <Suspense fallback={<div className="h-[420px]" />}>
        <SignupForm />
      </Suspense>
    </PublicAuthShell>
  );
}
