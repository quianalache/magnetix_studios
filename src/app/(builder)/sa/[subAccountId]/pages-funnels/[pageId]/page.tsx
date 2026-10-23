import { redirect } from "next/navigation";

/**
 * Old editor URL — kept for bookmarks and links from before the builder
 * consolidation (2026-10-23). The New Builder is the only editor: every page
 * opens there (a page with only legacy `blocks` is converted in memory and
 * those blocks are never written). This redirect keeps the query string,
 * repeated keys included, so no second editor or write path is left behind.
 */
export default async function LegacyPageEditorRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ subAccountId: string; pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { subAccountId, pageId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/sa/${subAccountId}/pages-funnels/${pageId}/new-builder${suffix}`);
}
