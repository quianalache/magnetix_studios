import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLoginHref, communityRootHref } from "@/lib/community/routes";
import { getGroupById } from "@/lib/server/community-service";
import { MemberSignupForm } from "@/components/member-auth/member-signup-form";

import { PublicAuthShell } from "@/components/public/public-shell";
import { getSubAccountPublicName, publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

/** Browser title: "Join {community} · {business}" — the group only when it's published. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ join?: string }>;
}): Promise<Metadata> {
  try {
    const { saId } = await params;
    const groupId = (await searchParams).join?.trim();
    const [group, businessName] = await Promise.all([
      groupId ? getGroupById(saId, groupId) : null,
      getSubAccountPublicName(saId),
    ]);
    const published = group && group.status === "published" ? group : null;
    return { title: publicTitle(published ? `Join ${published.name}` : "Join", businessName) };
  } catch {
    return {};
  }
}

export default async function MemberSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string }>;
  searchParams: Promise<{ join?: string; ref?: string }>;
}) {
  const { saId } = await params;
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) notFound();

  const sp = await searchParams;
  const groupId = sp.join?.trim();
  if (!groupId)
    redirect(
      communityRootHref({ saId, pretty: await isCommunityPrettyRequest(saId) })
    );

  const group = await getGroupById(saId, groupId);
  if (!group || group.status !== "published") notFound();

  const pretty = await isCommunityPrettyRequest(saId);
  const linkBase = { saId, pretty };
  return (
    <PublicAuthShell
      variant={{ kind: "tenant", brand: { name: group.name, logoUrl: group.logoUrl ?? null, primary: group.brandColor ?? null } }}
      title={`Join ${group.name}`}
      description="Create your Community member account to continue."
    >
      <MemberSignupForm
          saId={saId}
          groupId={group.id}
          inviteRef={sp.ref}
          accentColor={group.brandColor ?? "#202124"}
          loginHref={communityLoginHref(linkBase, {
            join: group.id,
            ref: sp.ref,
          })}
        />
    </PublicAuthShell>
  );
}
