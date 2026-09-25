"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Grant {
  personId: string;
  email: string;
  displayName: string | null;
  grantedAt: string | null;
  alsoPaid: boolean;
}

/**
 * Agency course → Complimentary access (owner-approved 2026-09-25). Grant
 * by email (resolves the person's MyMagnetix identity, same as adding an
 * Agency Community member) and revoke with confirmation. Server:
 * /api/agency/standalone-courses/[courseId]/complimentary.
 */
export function AgencyCourseComplimentarySection({
  courseId,
  paid,
}: {
  courseId: string;
  paid: boolean;
}) {
  const api = `/api/agency/standalone-courses/${courseId}/complimentary`;
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(() => {
    fetch(api)
      .then((r) => r.json())
      .then((d: { grants?: Grant[] }) => setGrants(d.grants ?? []))
      .catch(() => setGrants([]));
  }, [api]);
  useEffect(load, [load]);

  async function grant(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't grant access.");
      toast.success(data.message ?? "Access granted.");
      setEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't grant access.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      const res = await fetch(api, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: revoking.personId }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't revoke access.");
      toast.success(data.message ?? "Access revoked.");
      setRevoking(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke access.");
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Gift className="h-4 w-4" aria-hidden="true" /> Complimentary access
        </h2>
        <p className="text-sm text-muted-foreground">
          {paid
            ? "Give someone access without payment. No purchase is created and the course price is unchanged."
            : "This course is free — granting enrolls the person."}
        </p>
      </div>
      <form onSubmit={grant} className="flex flex-wrap gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          aria-label="Email to grant access to"
          className="h-9 max-w-xs"
        />
        <Button type="submit" size="sm" disabled={busy || !email.trim()}>
          {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Grant access
        </Button>
      </form>
      {paid &&
        (!grants ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complimentary grants.</p>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {grants.map((g) => (
              <div key={g.personId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.displayName?.trim() || g.email || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.email}
                    {g.grantedAt && ` · since ${new Date(g.grantedAt).toLocaleDateString()}`}
                    {g.alsoPaid && " · also has paid access"}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setRevoking(g)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        ))}

      <Dialog open={!!revoking} onOpenChange={(o) => !o && !revokeBusy && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke complimentary access?</DialogTitle>
            <DialogDescription>
              This removes the complimentary access for {revoking?.email}. If they also bought this
              course, their paid access stays in place. Their progress is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={revokeBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={revoke} disabled={revokeBusy}>
              {revokeBusy ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
