import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import MessagesInboxPage from "@/app/c/[saId]/messages/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain DM inbox: yourdomain.com/communities/messages. */
export default async function CustomDomainMessagesInboxPage() {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return MessagesInboxPage({ params: Promise.resolve({ saId: sub.id }) });
}
