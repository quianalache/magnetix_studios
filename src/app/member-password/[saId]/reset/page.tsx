import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PublicAction, PublicAuthShell, PublicStateShell } from "@/components/public/public-shell";
import { MemberResetPasswordForm } from "@/components/member-auth/member-reset-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<Metadata> {
  return { title: (await searchParams).token ? "Set your password" : "Password link not valid" };
}

/**
 * The sign-in page the member came from — read from the email's `next`
 * (set by the portal, community and course sign-in forms) by prefix only;
 * the link is always rebuilt from the workspace id, never taken from `next`.
 * MyMagnetix signs a member in to every business when the surface is unknown.
 */
function signInHrefFor(saId: string, next: string | undefined): string {
  const id = encodeURIComponent(saId);
  if (next?.startsWith("/portal/")) return `/portal/${id}/login`;
  if (next?.startsWith("/c/")) return `/c/${id}/login`;
  if (next?.startsWith("/course/")) return `/course/${id}/login`;
  return "/my/login";
}

export default async function MemberPasswordResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { saId } = await params;
  const sp = await searchParams;
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();

  const businessName = ((subSnap.data()?.name as string | undefined) ?? "").trim() || "Your account";
  if (!sp.token) {
    return (
      <PublicStateShell
        variant={{ kind: "tenant", brand: { name: businessName } }}
        icon={KeyRound}
        tone="warning"
        title="This password link isn't valid"
        description="Open the most recent password email you received, or request a new link from the sign-in page."
        action={<PublicAction href={signInHrefFor(saId, sp.next)}>Go to sign in</PublicAction>}
      />
    );
  }
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
