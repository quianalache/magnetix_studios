"use client";

import { AgencyEmailTemplateProvider } from "@/context/agency-email-template-context";
import { AgencyBroadcastComposer } from "@/components/agency-communications/agency-broadcast-composer";

export default function NewAgencyBroadcastPage() {
  return (
    <AgencyEmailTemplateProvider>
      <AgencyBroadcastComposer />
    </AgencyEmailTemplateProvider>
  );
}
