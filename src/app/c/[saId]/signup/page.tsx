import { redirect, notFound } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLoginHref, communityRootHref } from "@/lib/community/routes";
import { getGroupById } from "@/lib/server/community-service";
import { MemberSignupForm } from "@/components/member-auth/member-signup-form";

export const dynamic = "force-dynamic";

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
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Join {group.name}
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Create your Community member account to continue.
        </p>
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
      </div>
    </div>
  );
}
