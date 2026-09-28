import { redirect } from "next/navigation";

/**
 * Tasks moved under Projects → My Tasks (approved Projects redesign,
 * Sept 2026). Same Tasks engine, records and integrations — only the
 * destination changed. This route stays so existing links (Deal Details,
 * Contact profile, getting-started guide, bookmarks) keep working.
 */
export default async function TasksRedirect({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/projects/tasks`);
}
