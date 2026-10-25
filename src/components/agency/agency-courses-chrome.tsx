"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";

/**
 * Agency Courses + Course Offers render inside the normal CRM chrome, like
 * their sub-account siblings (/sa/[id]/courses lives in the dashboard). Only
 * the theme editors stay full-screen — the same split as the sub-account
 * side, where theme pages are the (builder) group. Same fix Agency
 * Communications got in its parity pass.
 */
export function AgencyCoursesChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (/\/theme\/?$/.test(pathname ?? "")) return <>{children}</>;
  return <DashboardLayout>{children}</DashboardLayout>;
}
