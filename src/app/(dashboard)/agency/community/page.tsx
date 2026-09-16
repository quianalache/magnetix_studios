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
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 h-6 w-6" />
          Community is managed by the agency owner.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Community</h1>
          <p className="text-sm text-muted-foreground">
            Communities Magnetix Studios itself owns and runs — separate from
            any sub-account&apos;s own Community.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Create community
        </Button>
      </div>

      <section className="rounded-2xl border bg-card p-5">
        {groups === null ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
            No Agency communities yet.{" "}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-primary underline"
            >
              Create one
            </button>{" "}
            to get started — e.g. a Magnetix customer community or an
            affiliate community.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <li key={g.id} className="rounded-xl border bg-background p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.status === "published" ? "Published" : "Draft"}
                      {" · "}
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                      {" · "}
                      {g.access === "paid" ? "Paid" : "Free"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/agency/community/${g.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href={`/agency/community/${g.id}/settings`}
                    className="text-xs font-medium text-muted-foreground hover:underline"
                  >
                    Manage
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
