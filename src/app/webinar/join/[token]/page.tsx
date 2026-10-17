import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import WebinarRoomClient from "@/components/webinar/webinar-room-client";
import { PublicStateShell } from "@/components/public/public-shell";
import { verifyWebinarRegistrantToken } from "@/lib/server/webinar-token";
import { getWebinarServerSide } from "@/lib/server/webinar-service";
import { getSubAccountPublicName, publicTitle } from "@/lib/server/public-identity";

/**
 * Who a join link belongs to — read-only. The access logic itself (registrant
 * status, live session, LiveKit grant) stays in POST /api/webinar/access.
 */
async function resolveJoinLink(token: string) {
  let verified: ReturnType<typeof verifyWebinarRegistrantToken> = null;
  try {
    verified = verifyWebinarRegistrantToken(token);
  } catch {
    return null; // signing secret not configured — no link can verify
  }
  if (!verified) return null;
  const [webinar, businessName] = await Promise.all([
    getWebinarServerSide(verified.subAccountId, verified.webinarId).catch(() => null),
    getSubAccountPublicName(verified.subAccountId).catch(() => null),
  ]);
  return { webinarTitle: webinar?.title ?? null, businessName };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const link = await resolveJoinLink((await params).token);
  if (!link) return { title: "Webinar link not valid" };
  return { title: publicTitle(link.webinarTitle ?? "Webinar", link.businessName) };
}

export default async function WebinarJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveJoinLink(token);
  if (!link) {
    return (
      <PublicStateShell
        variant={{ kind: "magnetix" }}
        icon={Link2Off}
        title="This webinar link isn't valid"
        description="Check that you opened the whole link from your registration email, or ask the host to send it again."
      />
    );
  }
  return <WebinarRoomClient token={token} businessName={link.businessName} />;
}
