import Link from "next/link";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCommunitiesForPerson,
  listAgencyCommunitiesForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { PinButton } from "@/components/mymagnetix/pin-button";
import { MyMagnetixBackLink } from "@/components/mymagnetix/back-link";

export const dynamic = "force-dynamic";

/**
 * My Communities — the person-centered global index (Part 12), now
 * covering BOTH scopes (Community Product Finish Pass, 2026-09-19):
 * `listCommunitiesForPerson` (tenant, every business relationship) and
 * `listAgencyCommunitiesForPerson` (the platform's Agency-owned
 * communities) return the same `PersonCommunityItem` shape, so this page
 * needs no scope-specific branching of its own — one shared card model,
 * per the Shared-First Architecture rules. Clicking a tenant entry
 * bridges into that Community via `/api/my/enter`; an Agency entry goes
 * straight to `/my/community/[groupId]` (no bridge needed — a Person is
 * already the real identity that route authenticates with).
 */
export default async function MyMagnetixCommunitiesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);
  const [tenantCommunities, agencyCommunities, pinned] = await Promise.all([
    listCommunitiesForPerson(memberships),
    listAgencyCommunitiesForPerson(person.id),
    listPinnedKeys(person.id),
  ]);
  const communities = [...tenantCommunities, ...agencyCommunities];

  const sorted = communities.slice().sort((a, b) => {
    const ap = pinned.has(a.pinKey) ? 0 : 1;
    const bp = pinned.has(b.pinKey) ? 0 : 1;
    return ap - bp;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <MyMagnetixBackLink />
      <PageHeader title="My Communities" description="Every community you belong to, across every Magnetix business." />

      {sorted.length === 0 ? (
        <EmptyState className="mt-6" icon={MessagesSquare} title="No communities yet" description="When you join a community with any Magnetix business, it appears here." />
      ) : (
        <div className="mt-6 flex flex-col gap-2.5">
          {sorted.map((community) => (
            <div
              key={community.pinKey}
              className="flex items-center gap-3 rounded-card border border-border bg-card p-3 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
                <MessagesSquare className="h-5 w-5" />
              </span>
              <Link href={community.enterHref} className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-foreground">
                  {community.name}
                </p>
                <p className="truncate text-micro text-muted-foreground">
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
