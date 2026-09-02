import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  CommunityShell,
  COMMUNITY_BG,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { ProfileEditor } from "@/components/community/profile-editor";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — profile editor. Close mirror of
 * /c/[saId]/[groupSlug]/profile/page.tsx: same `ProfileEditor` component,
 * same `Member` doc, same `/api/community/[saId]/profile` + `/avatar` +
 * `MemberPasswordManager` endpoints — nothing staff-specific in the form
 * itself. Only the shell + the "Back to community" href are staff-aware.
 * See the Staff Community Integration navigation cleanup report.
 */
export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/profile`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  // Theme parity (2026-08-29 closeout) — same shared resolver as Community
  // Home; see that page's identical comment for the full rationale.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="profile"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
      embedded={false}
    >
      {/* No more -m-4/md:-m-6 bleed here: that existed to cancel out
          CommunityShell's own embedded-mode `py-4` (no horizontal padding)
          so this background reached the rounded card's edges. Full-page
          mode's mainContent already has real padding + a centered
          max-width at every breakpoint, so this is just a plain rounded
          background block sitting inside it. */}
      <div
        style={{ backgroundColor: COMMUNITY_BG }}
        className="rounded-xl p-4 md:p-6"
      >
        <ProfileEditor
          saId={saId}
          staffGroupId={groupId}
          groupSlug={group.slug}
          brand={brand}
          primaryAction={resolvedTheme.primaryAction}
          initial={{
            displayName:
              member.displayName?.trim() || member.email.split("@")[0] || "",
            avatarUrl: member.avatarUrl,
            bio: member.bio ?? "",
            email: member.email,
            hasPassword: Boolean(member.passwordHash),
          }}
        />
      </div>
    </CommunityShell>
  );
}
