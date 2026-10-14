import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrmScope } from "@/components/theme/crm-scope";
import { DesignSystemShowcase } from "./showcase";

/**
 * Internal design-system verification surface (design-system Phase 1) — every
 * shared primitive and system composite in one place, for visual QA and drift
 * prevention (CLAUDE.md → "Magnetix design system"). Development/QA only: a
 * 404 in production unless DESIGN_SYSTEM_DOCS=on. No data, no auth needed.
 */
export const metadata: Metadata = {
  title: "Magnetix design system",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production" && process.env.DESIGN_SYSTEM_DOCS !== "on") notFound();
  return (
    <CrmScope>
      <div className="min-h-dvh bg-background text-foreground">
        <DesignSystemShowcase />
      </div>
    </CrmScope>
  );
}
