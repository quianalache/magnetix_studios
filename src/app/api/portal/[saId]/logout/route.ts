import { NextResponse } from "next/server";
import { clearMemberSessionCookie } from "@/lib/community/member-session";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  await clearMemberSessionCookie();

  // Land back on the pretty /portal/login when the request came in on this
  // sub-account's own verified custom domain — otherwise the sign-out
  // button would silently bounce a client off their coach's branded domain.
  const host = request.headers.get("host");
  const sub = await getSubAccountByCustomDomain(host);
  const loginPath = sub?.id === saId ? "/portal/login" : `/portal/${saId}/login`;

  return NextResponse.redirect(new URL(loginPath, request.url));
}
