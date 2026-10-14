import type { ReactNode } from "react";
import { CrmScope } from "@/components/theme/crm-scope";

/**
 * Agency immersive pages (Courses, Course Offers, Communications, Agency
 * Community) are part of the internal CRM, so they use the one fixed Magnetix
 * system like every other agency page (design-system Phase 1).
 */
export default function AgencyImmersiveLayout({ children }: { children: ReactNode }) {
  return <CrmScope>{children}</CrmScope>;
}
