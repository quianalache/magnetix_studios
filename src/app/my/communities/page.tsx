import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listPersonMemberships, listCommunitiesForPerson, listPinnedKeys } from "@/lib/server/mymagnetix-service";
import { PinButton } from "@/components/mymagnetix/pin-button";

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
      <h1 className="font-serif text-[20px] font-semibold text-[#202124]">My Communities</h1>
      <p className="mt-1 text-[13px] text-[#909090]">Every community you belong to, across every Magnetix business.</p>

      {sorted.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#909090]">No communities yet.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {sorted.map((community) => (
            <div
              key={`${community.subAccountId}:${community.groupId}`}
              className="flex items-center gap-3 rounded-xl border border-[#E4E4E4] p-3 transition-colors hover:border-[#5E2574]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F3E4F0] text-[#5E2574]">
                <MessagesSquare className="h-5 w-5" />
              </span>
              <Link href={community.enterHref} className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#202124]">{community.name}</p>
                <p className="truncate text-[11px] text-[#909090]">
                  {community.businessName} · Level {community.level}
                </p>
              </Link>
              <PinButton pinKey={community.pinKey} initialPinned={pinned.has(community.pinKey)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
