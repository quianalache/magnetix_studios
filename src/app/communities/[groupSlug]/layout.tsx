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
  // Next's generated LayoutProps for this segment requires every exported
  // function here (not just the default export) to accept the @modal
  // slot's prop, required (not optional), once that parallel route exists
  // (2026-09-03, parity follow-up) — generateMetadata never reads it, but
  // the type has to be declared to satisfy the constraint. Same fix
  // applied to the opaque mirror's layout.tsx.
  modal: React.ReactNode;
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

export default function CommunityGroupLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Post-detail intercepting route (2026-09-03, parity follow-up) — see
  // @modal/(.)home/[postId]/page.tsx. Empty (default.tsx) on every URL
  // except a post opened via client-side navigation from within this
  // community; renders alongside `children`, never replacing it, so the
  // feed underneath stays mounted. Mirrors
  // src/app/c/[saId]/[groupSlug]/layout.tsx's identical slot.
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
