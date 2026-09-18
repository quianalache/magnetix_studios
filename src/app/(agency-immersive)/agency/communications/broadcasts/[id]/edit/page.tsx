"use client";

import { use } from "react";
import { AgencyEmailTemplateProvider } from "@/context/agency-email-template-context";
import { AgencyBroadcastComposer } from "@/components/agency-communications/agency-broadcast-composer";

export default function EditAgencyBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AgencyEmailTemplateProvider>
      <AgencyBroadcastComposer existingCommunicationId={id} />
    </AgencyEmailTemplateProvider>
  );
}
