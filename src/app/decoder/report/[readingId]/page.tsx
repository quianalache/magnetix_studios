import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import EnergeticDecoderReportPage from "@/app/decoder/[saId]/report/[readingId]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain report URL: yourdomain.com/decoder/report/{id}.
 * Same pretty-URL-mirror pattern as `src/app/decoder/page.tsx` — delegates
 * to the opaque `/decoder/[saId]/report/[readingId]` page instead of
 * duplicating its render logic. Built host-aware from day one this time
 * (buildDecoderReportUrl in public-url.ts), not bolted on after the fact
 * like the Portal's URL leak had to be.
 */
export default async function CustomDomainDecoderReportPage({
  params,
}: {
  params: Promise<{ readingId: string }>;
}) {
  const { readingId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  return EnergeticDecoderReportPage({ params: Promise.resolve({ saId: sub.id, readingId }) });
}
