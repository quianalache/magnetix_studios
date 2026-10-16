import { notFound } from "next/navigation";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import type { Metadata } from "next";
import { CourseLoginForm } from "./login-form";
import { PublicAuthShell } from "@/components/public/public-shell";
import { getSubAccountPublicName, publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ error?: string; course?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  inactive:
    "Your account is no longer active. Contact the course owner if you think this is a mistake.",
  error: "Something went wrong signing you in. Request a new link below.",
};

/** Browser title: "Sign in · {business}". */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    return { title: publicTitle("Sign in", await getSubAccountPublicName((await params).saId)) };
  } catch {
    return {};
  }
}

export default async function CourseLoginPage({
  params,
  searchParams,
}: PageProps) {
  const { saId } = await params;
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) notFound();

  const sp = await searchParams;
  const errorMessage = sp.error ? (ERROR_MESSAGES[sp.error] ?? null) : null;

  // Tenant variant of the shared public sign-in shell (2026-10-16): the
  // business name on a neutral surface — courses have no sign-in brand field.
  const businessName = (await getSubAccountPublicName(saId)) ?? "Courses";
  return (
    <PublicAuthShell
      variant={{ kind: "tenant", brand: { name: businessName } }}
      title="Sign in"
      description="Sign in with your email and password, or use an email sign-in link."
      notice={
        errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-sm text-red-600" role="alert">
            {errorMessage}
          </div>
        ) : null
      }
    >
      <CourseLoginForm saId={saId} course={sp.course} />
    </PublicAuthShell>
  );
}
