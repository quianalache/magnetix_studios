import { notFound } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import type { Metadata } from "next";
import { MemberLoginForm } from "./login-form";
import { PublicAuthShell } from "@/components/public/public-shell";
import { getGroupById } from "@/lib/server/community-service";
import { getSubAccountPublicName, publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{
    error?: string;
    join?: string;
    ref?: string;
    next?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  used: "That sign-in link has already been used. Request a new one below.",
  inactive:
    "Your membership is no longer active. Contact the community owner if you think this is a mistake.",
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

export default async function MemberLoginPage({
  params,
  searchParams,
}: PageProps) {
  const { saId } = await params;
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) notFound();

  const sp = await searchParams;
  const errorMessage = sp.error ? (ERROR_MESSAGES[sp.error] ?? null) : null;

  // Tenant variant of the shared public sign-in shell (2026-10-16). Identity
  // comes only from existing sources: the community being joined (its name,
  // logo and brand color) when the link names one, otherwise the business
  // name on a neutral surface.
  const joinGroup = sp.join ? await getGroupById(saId, sp.join).catch(() => null) : null;
  const group = joinGroup && joinGroup.status === "published" ? joinGroup : null;
  const businessName = (await getSubAccountPublicName(saId)) ?? "Community";
  const brand = group
    ? { name: group.name, logoUrl: group.logoUrl ?? null, primary: group.brandColor ?? null }
    : { name: businessName };
  return (
    <PublicAuthShell
      variant={{ kind: "tenant", brand }}
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
      <MemberLoginForm saId={saId} join={sp.join} inviteRef={sp.ref} next={sp.next} accentColor={group?.brandColor ?? null} />
    </PublicAuthShell>
  );
}
