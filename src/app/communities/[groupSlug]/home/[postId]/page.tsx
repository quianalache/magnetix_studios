import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import PostDetailPage from "@/app/c/[saId]/[groupSlug]/community/[postId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain post detail: yourdomain.com/communities/{slug}/home/{postId}. */
export default async function CustomDomainPostDetailPage({
  params,
}: {
  params: Promise<{ groupSlug: string; postId: string }>;
}) {
  const { groupSlug, postId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return PostDetailPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, postId }),
  });
}
