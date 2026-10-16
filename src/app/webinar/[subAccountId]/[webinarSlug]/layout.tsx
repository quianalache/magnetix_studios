import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getWebinarBySlugServerSide } from "@/lib/server/webinar-service";
import { getSubAccountPublicName, publicTitle } from "@/lib/server/public-identity";

/** Browser title for the public registration page (the page itself is a client component). */
export async function generateMetadata({ params }: { params: Promise<{ subAccountId: string; webinarSlug: string }> }): Promise<Metadata> {
  try {
    const { subAccountId, webinarSlug } = await params;
    const webinar = await getWebinarBySlugServerSide(subAccountId, webinarSlug);
    if (!webinar) return {};
    return { title: publicTitle(webinar.title, await getSubAccountPublicName(subAccountId)) };
  } catch {
    return {};
  }
}

export default function WebinarRegistrationLayout({ children }: { children: ReactNode }) {
  return children;
}
