"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell } from "@/components/community/community-shell";
import { AgencyAboutView } from "@/components/community/agency-about-view";
import type { CommunityGroup } from "@/types/community";

/**
 * Agency Community About page — owner view. Full parity with the tenant
 * About page's real content (media gallery, rich About text, "What You'll
 * Get Inside" benefits — see AgencyAboutView) rather than the previous
 * minimal name+description placeholder. Deliberately does NOT reuse the
 * tenant CommunityAboutView's sidebar card verbatim — that card is a
 * tenant SALES card (JoinButton, tiers, pricing, reviews), none of which
 * apply to Agency Community's owner-invite-only membership model.
 */
export default function AgencyCommunityAboutPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group?: CommunityGroup; brandName?: string }) => {
        setGroup(d.group ?? null);
        setBrandName(d.brandName ?? null);
      })
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
  if (!group) return <div className="mx-auto max-w-7xl p-8" />;

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
      <AgencyAboutView
        link={{ saId: "", pretty: false, agencyGroupId: groupId }}
        group={group}
        brandName={brandName || "Magnetix Studios"}
        isModerator
      />
    </CommunityShell>
  );
}
