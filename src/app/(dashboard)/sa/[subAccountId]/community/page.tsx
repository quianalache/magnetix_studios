"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  GraduationCap,
  Loader2,
  Lock,
  Plus,
  ExternalLink,
  Users,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useResilientFeatureGate } from "@/hooks/use-resilient-feature-gate";
import { buildCommunityGroupUrl } from "@/lib/domains/public-url";
import {
  staffCommunityFeedHref,
  staffCommunityManageHref,
} from "@/lib/community/staff-routes";
import { ABOUT_MAX_CHARS } from "@/config/community";
import { subscribeToCommunityGroups } from "@/lib/firestore/community-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { CommunityGroup } from "@/types/community";
import type { SubAccountDoc } from "@/types";

/**
 * Community groups — staff list + create. Gated by `communityEnabledByAgency`;
 * renders a locked state when the agency hasn't enabled it. A draft group's
 * card opens straight to Manage (its feed page 404s until published); a
 * published group's card opens its feed, with Manage and the public View
 * link both always available too.
 *
 * Gate read via `useResilientFeatureGate` (2026-08-30 false-lock fix), not
 * `subAccount?.communityEnabledByAgency` directly — see that hook's own
 * doc comment for why: the live client value alone left a genuinely
 * enabled sub-account stuck on this locked screen indefinitely.
 */
export default function CommunityPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gate = useResilientFeatureGate({
    field: "communityEnabledByAgency",
    fallbackKey: "communityEnabled",
  });
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const gateOn = gate.known && gate.enabled;

  useEffect(() => {
    if (!gate.known || !gateOn) {
      if (gate.known) setLoaded(true);
      return;
    }
    return subscribeToCommunityGroups(
      subAccountId,
      (list) => {
        setGroups(
          [...list].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId, gate.known, gateOn]);

  if (!gate.known) {
    return (
      <div className="mx-auto flex w-full max-w-5xl justify-center py-16">
        {gate.timedOut ? (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Couldn&apos;t confirm Community&apos;s status. Try refreshing the page.
          </p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (!gateOn) {
    return (
      <div className="momentum-scope mx-auto w-full max-w-5xl rounded-2xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Community is locked</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your agency administrator hasn&apos;t enabled Community for this
            sub-account yet. Ask them to switch it on from Manage in the agency
            sub-accounts list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCap className="h-6 w-6" />
            Community
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skool-style groups — a feed, courses, and a leaderboard your members
            access at a branded public link.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New group
          </Button>
        )}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No groups yet.{" "}
            {isAdmin
              ? "Create your first community group to get started."
              : "Ask an admin to create one."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              subAccountId={subAccountId}
              subAccount={subAccount}
            />
          ))}
        </div>
      )}

      <CreateGroupDialog
        subAccountId={subAccountId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

/** Skool-style group card: cover image (or brand-tinted initial placeholder)
 *  above name + status, description, and a member-count / price / View row. */
function GroupCard({
  group: g,
  subAccountId,
  subAccount,
}: {
  group: CommunityGroup;
  subAccountId: string;
  subAccount: SubAccountDoc | null;
}) {
  const image = g.cardImageUrl ?? g.coverUrl;
  const brand = g.brandColor || "#6b7280";
  const price =
    g.access === "paid"
      ? g.priceCents != null
        ? formatCurrency(g.priceCents / 100, g.currency ?? "USD")
        : "Paid"
      : "Free";

  // A group's feed page (staffCommunityFeedHref) and its public page both
  // 404 for anything that isn't status:"published" — the feed page gates
  // through the SAME requireGroupPageAccess() a member-facing page uses,
  // with no staff bypass for draft. A brand-new group is always a draft
  // (see the create route), so the card's primary open-action has to route
  // to Manage instead until it's published, or a freshly created group
  // would be unreachable from this list entirely. See staff-routes.ts.
  const isPublished = g.status === "published";
  const openHref = isPublished
    ? staffCommunityFeedHref(subAccountId, g.id)
    : staffCommunityManageHref(subAccountId, g.id);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <Link href={openHref} className="block" aria-label={`Open ${g.name}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-video w-full items-center justify-center text-3xl font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            {g.name.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={openHref} className="font-medium hover:underline">
            {g.name}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              isPublished
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
            )}
          >
            {g.status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {g.about || "No description yet."}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {g.memberCount}
          </span>
          <span>{price}</span>
          <Link
            href={staffCommunityManageHref(subAccountId, g.id)}
            className="ml-auto hover:text-foreground"
          >
            Manage
          </Link>
          {isPublished ? (
            <a
              href={buildCommunityGroupUrl({
                subAccount,
                subAccountId,
                groupSlug: g.slug,
              })}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span
              className="flex cursor-not-allowed items-center gap-1 opacity-40"
              title="Publish this group first — the public page isn't reachable while it's a draft"
            >
              View <ExternalLink className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateGroupDialog({
  subAccountId,
  open,
  onOpenChange,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Enter a group name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), about: about.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("Group created as a draft. Publish it when you're ready.");
      setName("");
      setAbout("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New community group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Inner Circle"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-about">About (optional)</Label>
            <Textarea
              id="group-about"
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX_CHARS))}
              maxLength={ABOUT_MAX_CHARS}
              placeholder="What is this community about? You can edit this later."
              rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">
              {about.length}/{ABOUT_MAX_CHARS}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create group"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
