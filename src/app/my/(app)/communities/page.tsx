import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCommunitiesForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { PinButton } from "@/components/mymagnetix/pin-button";
import { MyMagnetixBackLink } from "@/components/mymagnetix/back-link";

export const dynamic = "force-dynamic";

/**
 * My Communities — the person-centered global index (Part 12). Reuses
 * portal-service.ts's listPortalCommunities across every business
 * relationship; clicking opens the same Community group experience Client
 * Portal already links to. One Community object, one more discovery path.
 */
export default async function MyMagnetixCommunitiesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);
  const [communities, pinned] = await Promise.all([
    listCommunitiesForPerson(memberships),
    listPinnedKeys(person.id),
  ]);

  const sorted = communities.slice().sort((a, b) => {
    const ap = pinned.has(a.pinKey) ? 0 : 1;
    const bp = pinned.has(b.pinKey) ? 0 : 1;
    return ap - bp;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <MyMagnetixBackLink />
      <h1 className="text-[20px] font-bold text-[#1D1B27]">My Communities</h1>
      <p className="mt-1 text-[13px] text-[#84809A]">
        Every community you belong to, across every Magnetix business.
      </p>

      {sorted.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#909090]">No communities yet.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {sorted.map((community) => (
            <div
              key={`${community.subAccountId}:${community.groupId}`}
              className="flex items-center gap-3 rounded-xl border border-[#ECE9F5] bg-white p-3 transition-shadow hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EDE9FE] text-[#6D28D9]">
                <MessagesSquare className="h-5 w-5" />
              </span>
              <Link href={community.enterHref} className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#1D1B27]">
                  {community.name}
                </p>
                <p className="truncate text-[11px] text-[#8A87A0]">
                  {community.businessName} · Level {community.level}
                </p>
              </Link>
              <PinButton
                pinKey={community.pinKey}
                initialPinned={pinned.has(community.pinKey)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
