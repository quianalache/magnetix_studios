import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { getGroupBySlug } from "@/lib/server/community-service";

/** Custom-domain mirror of `src/app/c/[saId]/[groupSlug]/layout.tsx` — see
 *  that file's module comment for the full rationale. Resolves `saId` from
 *  the request host the same way every other `/communities/*` thin wrapper
 *  page already does, rather than assuming it. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}): Promise<Metadata> {
  try {
    const { groupSlug } = await params;
    const host = (await headers()).get("host");
    const sub = await getSubAccountByCustomDomain(host);
    if (!sub) return {};
    const group = await getGroupBySlug(sub.id, groupSlug);
    if (!group?.faviconUrl) return {};
    return { icons: { icon: group.faviconUrl } };
  } catch {
    return {};
  }
}

export default function CommunityGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
