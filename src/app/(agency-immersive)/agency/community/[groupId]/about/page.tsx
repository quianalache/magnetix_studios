"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { CommunityGroup } from "@/types/community";

/**
 * Agency Community About page — minimal, since "about" is a mandatory nav
 * tab (MANDATORY_NAV_KEYS in community-navigation.ts) that can't be hidden
 * via the same Settings → Navigation config the other unbuilt tabs use.
 * The rich tenant About page (media gallery, benefits cards, reviews,
 * "What You'll Get Inside") isn't wired for agency scope — see the Agency
 * Community task's remaining-work notes.
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

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => r.json())
      .then((d: { group?: CommunityGroup; brandName?: string }) => {
        setGroup(d.group ?? null);
        setBrandName(d.brandName ?? null);
      });
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (!group) return <div className="mx-auto max-w-2xl p-8" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/agency/community/${groupId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to community
      </Link>

      <div className="rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-bold tracking-tight">{group.name}</h1>
        {brandName && (
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Presented by {brandName}
          </p>
        )}
        {group.about ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {group.about}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No description yet.
          </p>
        )}
        <Link
          href={`/agency/community/${groupId}/settings`}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Settings className="h-3 w-3" />
          Edit in settings
        </Link>
      </div>
    </div>
  );
}
