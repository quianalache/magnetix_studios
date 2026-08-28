import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import MemberSignupPage from "@/app/c/[saId]/signup/page";

export const dynamic = "force-dynamic";

export default async function CustomDomainSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string; ref?: string }>;
}) {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return MemberSignupPage({
    params: Promise.resolve({ saId: sub.id }),
    searchParams,
  });
}
