import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { listAgencyInboxServerSide } from "@/lib/server/agency-community-dm-service";
import {
  COMMUNITY_BG,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { DmInbox } from "@/components/community/dm/dm-inbox";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — the agency-wide (not group-
 *  scoped) full-page DM inbox, mirroring /c/[saId]/messages/page.tsx.
 *  Owner-only via Firebase has no Person identity and doesn't participate
 *  in Agency Community DMs (see agency-community-dm-service.ts). */
export default async function MyAgencyMessagesInboxPage() {
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent("/my/messages")}`);

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Not found.</div>;
  }

  const items = await listAgencyInboxServerSide({ agencyId, viewerId: person.id });
  const brand = COMMUNITY_DEFAULT_BRAND;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COMMUNITY_BG }}>
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link
            href="/my"
            className="flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-4 w-4" /> Community
          </Link>
          <span className="text-sm font-semibold text-[#202124]">Messages</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <DmInbox saId="" agencyScope brand={brand} initialItems={items} />
      </main>
    </div>
  );
}
