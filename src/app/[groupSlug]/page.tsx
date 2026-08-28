import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCommunityGate } from "@/lib/community/gate";
import GroupAboutPage from "@/app/c/[saId]/[groupSlug]/page";

export const dynamic = "force-dynamic";

/**
 * Magnetix-hosted public Community entry point: /{communitySlug}.
 *
 * Community slugs are currently unique only within a sub-account, so a
 * host-root lookup must refuse ambiguous matches rather than guessing a
 * tenant. Only published groups from Community-enabled sub-accounts are
 * eligible; the existing About page remains the single renderer and keeps
 * its normal public/member access behavior.
 */
export default async function RootCommunityPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const matches = await getAdminDb()
    .collectionGroup("communityGroups")
    .where("slug", "==", groupSlug)
    .limit(20)
    .get();

  const publishedMatches = matches.docs.filter(
    (doc) => doc.data().status === "published"
  );

  if (publishedMatches.length !== 1) notFound();
  const groupDoc = publishedMatches[0];
  const subAccountId = groupDoc.ref.parent.parent?.id;
  if (!subAccountId) notFound();

  const gate = await getCommunityGate(subAccountId);
  if (!gate || !gate.enabled) notFound();

  return GroupAboutPage({
    params: Promise.resolve({ saId: subAccountId, groupSlug }),
  });
}
