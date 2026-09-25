import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCommunitiesForPerson,
  listAgencyCommunitiesForPerson,
} from "@/lib/server/mymagnetix-service";
import { MyMagnetixSettingsView } from "@/components/mymagnetix/settings-view";

export const dynamic = "force-dynamic";

export default async function MyMagnetixSettingsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login?next=%2Fmy%2Fsettings");
  const memberships = await listPersonMemberships(person.id);
  const [tenant, agency] = await Promise.all([
    listCommunitiesForPerson(memberships),
    listAgencyCommunitiesForPerson(person.id),
  ]);
  return <MyMagnetixSettingsView communities={[...tenant, ...agency]} />;
}
