import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import MemberLoginPage from "@/app/c/[saId]/login/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain login: yourdomain.com/communities/login. */
export default async function CustomDomainLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    join?: string;
    ref?: string;
    next?: string;
  }>;
}) {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return MemberLoginPage({
    params: Promise.resolve({ saId: sub.id }),
    searchParams,
  });
}
