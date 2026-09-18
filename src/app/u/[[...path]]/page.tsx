import { notFound } from "next/navigation";
import UnsubscribePage from "@/lib/unsubscribe-pages/tenant";
import AgencyUnsubscribePage from "@/lib/unsubscribe-pages/agency";

export const dynamic = "force-dynamic";

export default async function UnsubscribeRoute({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path ?? [];
  if (path.length === 1) return <UnsubscribePage token={path[0]} />;
  if (path.length === 2 && path[0] === "agency") {
    return <AgencyUnsubscribePage token={path[1]} />;
  }
  notFound();
}
