import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import PublicDecoderPage from "@/app/decoder/[saId]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain Energetic Decoder URL: yourdomain.com/decoder.
 * No per-item slug needed — the tool is one-per-sub-account, so the domain
 * itself is the whole identifier (unlike booking/courses, which need a
 * slug segment to pick one item out of many). Only reachable via a Host
 * that resolves to a verified custom domain; see
 * `src/app/booking/[slug]/page.tsx` for the fuller rationale, which this
 * mirrors — delegates to the existing opaque `/decoder/[saId]` page rather
 * than duplicating its render logic.
 */
export default async function CustomDomainDecoderPage() {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  return PublicDecoderPage({ params: Promise.resolve({ saId: sub.id }) });
}
