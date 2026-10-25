import type { ReactNode } from "react";
import { AgencyCoursesChrome } from "@/components/agency/agency-courses-chrome";

export default function Layout({ children }: { children: ReactNode }) {
  return <AgencyCoursesChrome>{children}</AgencyCoursesChrome>;
}
