"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, Tag } from "@/components/system/status-pill";
import type { CommunityGroup } from "@/types/community";

/**
 * Agency → Community (2026-09-16) — the Agency owner's community
 * management index. Owner-only, matching every other real Agency control.
 * Lists Agency-owned communities (agencies/{agencyId}/communityGroups —
 * NOT the tenant subAccounts/{id}/communityGroups tree), via the
 * owner-only /api/agency/community route (Firestore rules for this path
 * are fully closed — no client read at all, see firestore.rules).
 */
export default function AgencyCommunityPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [groups, setGroups] = useState<CommunityGroup[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    void fetch("/api/agency/community")
      .then((r) => r.json())
      .then((d: { groups?: CommunityGroup[] }) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]));
  }

  useEffect(() => {
    if (isOwner) refresh();
  }, [isOwner]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agency/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, about }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: CommunityGroup;
        error?: string;
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't create community");
      toast.success(`${d.group?.name ?? "Community"} created.`);
      setCreateOpen(false);
      setName("");
      setAbout("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create community");
    } finally {
      setCreating(false);
    }
  }

  if (authLoading) {
    return <PageShellLoading width="data" />;
  }

  if (!isOwner) {
    return (
      <PageShell width="data">
        <EmptyState icon={Users} title="Owner only" description="Community is managed by the agency owner." />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        title="Community"
        description="Communities Magnetix Studios itself owns and runs — separate from any sub-account's own Community."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create community
          </Button>
        }
      />

      {groups === null ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Agency communities yet"
          description="Create one to get started — e.g. a Magnetix customer community or an affiliate community."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Create community
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id} className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg">
                  <Users className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-section font-semibold text-foreground">{g.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
                    <StatusPill status={g.status === "published" ? "published" : "draft"}>
                      {g.status === "published" ? "Published" : "Draft"}
                    </StatusPill>
                    <Tag color={g.access === "paid" ? "gold" : "gray"}>{g.access === "paid" ? "Paid" : "Free"}</Tag>
                    <span>
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" render={<Link href={`/agency/community/${g.id}`} />}>
                  Open
                  <ArrowRight />
                </Button>
                <Button size="sm" variant="outline" render={<Link href={`/agency/community/${g.id}/settings`} />}>
                  Manage
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create community</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="community-name">Community name</Label>
              <Input
                id="community-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Magnetix Community"
                maxLength={80}
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="community-about">Description (optional)</Label>
              <Textarea
                id="community-about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={3}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
