import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { normalizeNavigation } from "@/lib/community/community-navigation";
import type { CommunityGroup } from "@/types/community";

/** The group's own label for its Classroom tab (admins can rename it). */
export function communityClassroomLabel(group: Pick<CommunityGroup, "navigation">): string {
  return normalizeNavigation(group.navigation).find((item) => item.key === "classroom")?.label || "Classroom";
}

/**
 * The single back control for a course opened inside a Community: a course
 * homepage links back to the Classroom catalog, a lesson links back to THAT
 * course's homepage. Shared by every tenant + Agency Community course surface
 * so the destinations can't drift apart.
 */
export function CommunityCourseBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
