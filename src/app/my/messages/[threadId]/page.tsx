import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyThreadOther,
  hasBlocked,
  listAgencyMessagesServerSide,
  memberViewById,
} from "@/lib/server/agency-community-dm-service";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { DmThread } from "@/components/community/dm/dm-thread";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — the agency-wide full-page DM
 *  thread, mirroring /c/[saId]/messages/[threadId]/page.tsx. */
export default async function MyAgencyMessagesThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/my/messages/${threadId}`)}`);

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Not found.</div>;
  }
  const viewerId = person.id;

  // A thread id is `a__b`; if the thread doesn't exist yet (a brand-new
  // chat), derive the other participant from the route — mirrors tenant.
  let other = await getAgencyThreadOther({ agencyId, threadId, viewerId });
  if (!other) {
    const ids = threadId.split("__");
    if (ids.length !== 2 || !ids.includes(viewerId)) {
      return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Not found.</div>;
    }
    const otherId = ids.find((x) => x !== viewerId)!;
    other = await memberViewById(agencyId, otherId);
  }

  const [messages, blockedByMe] = await Promise.all([
    listAgencyMessagesServerSide({ agencyId, threadId, viewerId }),
    hasBlocked(agencyId, viewerId, other.memberId),
  ]);

  return (
    <DmThread
      saId=""
      agencyScope
      threadId={threadId}
      viewerId={viewerId}
      other={other}
      brand={COMMUNITY_DEFAULT_BRAND}
      initialMessages={messages ?? []}
      blockedByMe={blockedByMe}
    />
  );
}
