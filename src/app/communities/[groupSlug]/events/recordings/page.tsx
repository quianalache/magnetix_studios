import CommunityRecordingsPage from "@/app/c/[saId]/[groupSlug]/events/recordings/page";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export default async function PrettyCommunityRecordingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityRecordingsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
