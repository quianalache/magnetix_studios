import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityLiveRoomPage from "@/app/c/[saId]/[groupSlug]/live/[roomId]/page";

export const dynamic = "force-dynamic";

export default async function PrettyCommunityLiveRoomPage({
  params,
}: {
  params: Promise<{ groupSlug: string; roomId: string }>;
}) {
  const { groupSlug, roomId } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityLiveRoomPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, roomId }),
  });
}
