"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RosterEntry {
  id: string;
  email: string;
  displayName: string | null;
  source: "manual" | "customer" | "affiliate" | "plan_cohort";
  status: "pending" | "active" | "removed";
}

/**
 * Agency Community membership (2026-09-17) — real member access. Adding
 * someone here resolves/creates their global MyMagnetix Person identity,
 * sends them a real sign-in invite email, and — once they use it — lets
 * them enter this exact community at `/my/community/[groupId]` (never
 * `/agency/community/...`, and never as a member of any sub-account). See
 * community-agency-service.ts's module comment.
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
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (!confirm("Revoke this person's access to the community?")) return;
    const res = await fetch(`/api/agency/community/${groupId}/members/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Couldn't revoke access");
      return;
    }
    toast.success("Access revoked");
    refresh();
  }

  async function handleResend(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/community/${groupId}/members/${id}/resend`, {
        method: "POST",
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't resend");
      toast.success("Invite resent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend");
    } finally {
      setBusyId(null);
    }
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
        <h1 className="text-xl font-bold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Invite someone by email — they&apos;ll get a sign-in link to enter
          this community at{" "}
          <span className="font-mono text-xs">/my/community/{groupId}</span>.
          They never become a member of any other business.
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
        ) : members.filter((m) => m.status !== "removed").length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No members yet.
          </p>
        ) : (
          <ul className="divide-y">
            {members
              .filter((m) => m.status !== "removed")
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {m.displayName || m.email}
                      </p>
                      <span
                        className={
                          m.status === "pending"
                            ? "shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
                            : "shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700"
                        }
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.email} · {m.source}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleResend(m.id)}
                        disabled={busyId === m.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label="Resend invite"
                        title="Resend invite"
                      >
                        {busyId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(m.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Revoke access"
                      title="Revoke access"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
