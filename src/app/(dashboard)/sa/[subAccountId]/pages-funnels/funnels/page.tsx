import { redirect } from "next/navigation";

/**
 * The funnel list now lives in the Pages & Funnels home's Funnels view
 * (2026-11). This address keeps working for old links and bookmarks.
 */
export default async function FunnelsPage({ params }: { params: Promise<{ subAccountId: string }> }) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/pages-funnels?view=funnels`);
}
