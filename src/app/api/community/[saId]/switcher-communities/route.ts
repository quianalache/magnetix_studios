import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import {
  listPersonMemberships,
  listCommunitiesForPerson,
} from "@/lib/server/mymagnetix-service";

export const dynamic = "force-dynamic";

/**
 * Member: every Community this member's linked Person belongs to, across
 * every Magnetix business — the data source for the Community-name header
 * switcher (2026-09-11). Deliberately the SAME canonical source "My
 * Communities" already uses (`listPersonMemberships` +
 * `listCommunitiesForPerson`, mymagnetix-service.ts), not a second index —
 * the only new thing here is resolving the Person WITHOUT an `mm_session`
 * cookie (the visitor is only holding a tenant-scoped `ls_member_session`
 * while browsing a Community, same as `bridge-from-member`'s own
 * `ensurePersonLinkForMember` call for exactly this reason).
 *
 * Response is trimmed to just what a fast switcher row needs — no
 * `businessName`/`role`/`points`/`pinKey`/`enterHref` (that last one
 * assumes an existing `mm_session` and is the wrong mechanism for
 * switching straight from inside a Community; see
 * lib/community/routes.ts's `communityCrossTenantSwitchHref`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );

  const personId = await ensurePersonLinkForMember(saId, access.member);
  if (!personId) return NextResponse.json({ ok: true, communities: [] });

  const memberships = await listPersonMemberships(personId);
  const communities = await listCommunitiesForPerson(memberships);

  return NextResponse.json({
    ok: true,
    communities: communities.map((c) => ({
      subAccountId: c.subAccountId,
      groupId: c.groupId,
      slug: c.slug,
      name: c.name,
      // Same field the About page/Settings live preview already render as
      // this community's brand mark — see PortalCommunity.logoUrl's doc
      // comment. Null when unset; the switcher row falls back to the
      // generic icon, same convention as those existing call sites.
      logoUrl: c.logoUrl,
      href: c.href,
    })),
  });
}
