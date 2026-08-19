import type { Metadata } from "next";
import { getGroupBySlug } from "@/lib/server/community-service";

/**
 * Community Settings → General's new Favicon field, actually applied to
 * the real browser tab (Part 2's "wire the saved favicon to the actual
 * community page favicon" — investigated and completed, not deferred).
 *
 * Next.js's Metadata API merges `icons` down the segment tree, most
 * specific segment wins — a `generateMetadata` here overrides the root
 * layout's global default `icons.icon` for every page under this ONE
 * community group, without touching any of those existing page files
 * individually (this file is purely additive). No `faviconUrl` set (the
 * common case — most communities haven't configured Branding/Favicon at
 * all) falls through to the root layout's own default, same as before
 * this existed.
 *
 * Deliberately the cheapest possible lookup for something that runs on
 * every request to this segment: `getGroupBySlug` is a single unauthenticated
 * doc read, no membership/access check — metadata generation must never be
 * the thing that decides who can see a page (the page component's own
 * `requireGroupPageAccess`/`notFound()` still does that); this can't fail
 * a real visitor's page load even if it can't resolve a group at all.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}): Promise<Metadata> {
  try {
    const { saId, groupSlug } = await params;
    const group = await getGroupBySlug(saId, groupSlug);
    if (!group?.faviconUrl) return {};
    return { icons: { icon: group.faviconUrl } };
  } catch {
    return {};
  }
}

export default function CommunityGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
