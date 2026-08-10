import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import EnergeticDecoderReportDesignPage from "@/app/decoder/[saId]/report/[readingId]/design/[reportId]/page";

export const dynamic = "force-dynamic";

/** Custom-domain mirror of /decoder/[saId]/report/[readingId]/design/[reportId] — same delegation pattern as the plain report page's own custom-domain route. */
export default async function CustomDomainDecoderReportDesignPage({
  params,
}: {
  params: Promise<{ readingId: string; reportId: string }>;
}) {
  const { readingId, reportId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  return EnergeticDecoderReportDesignPage({ params: Promise.resolve({ saId: sub.id, readingId, reportId }) });
}
