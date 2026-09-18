"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell } from "@/components/community/community-shell";
import { AboutEditPage } from "@/components/community/about-edit-page";
import type { CommunityGroup } from "@/types/community";

/** Agency Community Edit About — owner view. Reuses the exact tenant
 *  AboutEditPage (tagline, join card image, rich About text, media
 *  gallery, "What You'll Get Inside" benefits) with agencyGroupId set —
 *  only the save PATCH URL and image-upload URL branch differently inside
 *  that component; the agency group PATCH route already accepts every
 *  field it saves (see updateAgencyGroupServerSide). */
export default function AgencyCommunityAboutEditPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group: CommunityGroup }) => setGroup(d.group))
      .catch(() => setNotFound(true));
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (notFound) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }
  if (!group) return <div className="mx-auto max-w-3xl p-8" />;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="about"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <AboutEditPage
        saId=""
        pretty={false}
        agencyGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        initial={{
          tagline: group.tagline,
          aboutHtml: group.aboutHtml,
          about: group.about,
          aboutMedia: group.aboutMedia,
          cardImageUrl: group.cardImageUrl,
          aboutBenefits: group.aboutBenefits,
          showAboutBenefits: group.showAboutBenefits,
        }}
      />
    </CommunityShell>
  );
}
