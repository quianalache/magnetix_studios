import { NextResponse } from "next/server";
import { clearMemberSessionCookie } from "@/lib/community/member-session";
import { resolveCommunityRequestOrigin } from "@/lib/community/domain";
import { communityLoginHref } from "@/lib/community/routes";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  await clearMemberSessionCookie();
  const { pretty } = await resolveCommunityRequestOrigin(
    saId,
    request.headers.get("host"),
  );
  return NextResponse.redirect(
    new URL(communityLoginHref({ saId, pretty }), request.url),
  );
}
