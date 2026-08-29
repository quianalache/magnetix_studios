import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { ProfileEditor } from "@/components/community/profile-editor";
import {
  communityThemeStyle,
  resolveCommunityTheme,
} from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);
  const { group, member } = access;
  // Theme parity (2026-08-29 closeout) — same shared resolver as Community
  // Home; see that page's identical comment for the full rationale.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;

  return (
    <div
      className="community-theme min-h-screen"
      style={communityThemeStyle(group.theme)}
    >
      <ProfileEditor
        saId={saId}
        pretty={pretty}
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
  );
}
