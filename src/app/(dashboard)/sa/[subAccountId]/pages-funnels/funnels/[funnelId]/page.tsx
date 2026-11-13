"use client";

import { useParams } from "next/navigation";
import { FunnelHub } from "@/components/funnels/funnel-hub";

/** One funnel: its status, actions and ordered steps (Funnel Phase 2 hub). */
export default function FunnelDetailPage() {
  const { subAccountId, funnelId } = useParams<{ subAccountId: string; funnelId: string }>();
  return <FunnelHub key={funnelId} subAccountId={subAccountId} funnelId={funnelId} />;
}
