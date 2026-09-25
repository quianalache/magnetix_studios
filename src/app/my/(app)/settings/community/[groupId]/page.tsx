import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCommunitiesForPerson,
  listAgencyCommunitiesForPerson,
} from "@/lib/server/mymagnetix-service";
import { CommunityNotificationSettings } from "@/components/mymagnetix/settings-view";

export const dynamic = "force-dynamic";

export default async function MyCommunityNotificationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ subAccountId?: string }>;
}) {
  const { groupId } = await params;
  const { subAccountId } = await searchParams;
  const person = await getCurrentPerson();
  if (!person)
    redirect(
      `/my/login?next=${encodeURIComponent(`/my/settings/community/${groupId}`)}`
    );
  const memberships = await listPersonMemberships(person.id);
  const [tenant, agency] = await Promise.all([
    listCommunitiesForPerson(memberships),
    listAgencyCommunitiesForPerson(person.id),
  ]);
  const community = [...tenant, ...agency].find(
    (item) =>
      item.groupId === groupId &&
      (!subAccountId || item.subAccountId === subAccountId)
  );
  if (!community) redirect("/my/settings");
  return <CommunityNotificationSettings community={community} />;
}
