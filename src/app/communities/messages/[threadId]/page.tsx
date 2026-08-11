import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import DmThreadPage from "@/app/c/[saId]/messages/[threadId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain DM thread: yourdomain.com/communities/messages/{threadId}. */
export default async function CustomDomainDmThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return DmThreadPage({
    params: Promise.resolve({ saId: sub.id, threadId }),
  });
}
