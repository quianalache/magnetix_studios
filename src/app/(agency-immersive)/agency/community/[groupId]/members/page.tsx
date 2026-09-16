"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RosterEntry {
  id: string;
  email: string;
  displayName: string | null;
  source: "manual" | "customer" | "affiliate" | "plan_cohort";
  status: "active" | "removed";
}

/**
 * Agency Community membership roster (2026-09-16) — see
 * community-agency-service.ts's module comment for why this is a ROSTER,
 * not a working login/access grant: agency communities have no Member/
 * session identity system yet (the existing one is hard-bound to a
 * subAccountId). Adding someone here records that they're eligible for a
 * FUTURE access system; it does not currently let them sign in or post.
 */
export default function AgencyCommunityMembersPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [members, setMembers] = useState<RosterEntry[] | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);

  function refresh() {
    void fetch(`/api/agency/community/${groupId}/members`)
      .then((r) => r.json())
      .then((d: { members?: RosterEntry[] }) => setMembers(d.members ?? []))
      .catch(() => setMembers([]));
  }

  useEffect(() => {
    if (isOwner) refresh();
  }, [isOwner, groupId]);

  async function handleAdd() {
    if (!email.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/agency/community/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: displayName || null }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't add");
      toast.success("Added to the roster.");
      setEmail("");
      setDisplayName("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/agency/community/${groupId}/members/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Couldn't remove");
      return;
    }
    setMembers((prev) => prev?.filter((m) => m.id !== id) ?? null);
  }

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/agency/community/${groupId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to community
      </Link>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Membership roster</h1>
        <p className="text-sm text-muted-foreground">
          Eligible people for this community — a roster for a future
          login/access system, not a live access grant. Only you can post
          here today.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            disabled={adding}
            className="flex-1"
          />
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name (optional)"
            disabled={adding}
            className="sm:max-w-[180px]"
          />
          <Button onClick={handleAdd} disabled={adding || !email.trim()}>
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {members === null ? (
          <div className="h-12 animate-pulse rounded-lg bg-muted/50" />
        ) : members.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No one on the roster yet.
          </p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.displayName || m.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · {m.source}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(m.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
