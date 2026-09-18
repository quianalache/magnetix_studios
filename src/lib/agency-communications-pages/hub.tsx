"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Mail, FileText, ArrowRight } from "lucide-react";

/**
 * Agency → Communications hub — Magnetix Studios' own Broadcasts + Email
 * Templates, reusing the tenant Broadcast system's block editor/renderer/
 * fan-out (see agency-communications-service.ts). Owner-only, matching
 * every other real Agency control. Belongs to Magnetix Studios, never a
 * sub-account.
 */
export default function AgencyCommunicationsHubPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
          Communications is managed by the agency owner.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
        <p className="text-sm text-muted-foreground">
          Reach Magnetix customers, Agency Community members, and course/offer buyers — sent as Magnetix Studios.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/agency/communications/broadcasts" className="group rounded-2xl border bg-card p-5 transition hover:border-primary/50 hover:bg-accent/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Broadcasts</h2>
              <p className="text-xs text-muted-foreground">Compose and send email to a real Agency audience.</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </div>
        </Link>
        <Link href="/agency/communications/templates" className="group rounded-2xl border bg-card p-5 transition hover:border-primary/50 hover:bg-accent/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Email Templates</h2>
              <p className="text-xs text-muted-foreground">Reusable Magnetix-branded templates for announcements.</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </div>
        </Link>
      </div>
    </div>
  );
}
