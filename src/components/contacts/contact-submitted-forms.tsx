"use client";

import { useState } from "react";
import { AlertCircle, FileText, Inbox, RotateCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useJsonResource } from "@/hooks/use-json-resource";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RelatedCard } from "@/components/contacts/related-card";
import { SubmissionAnswersList } from "@/components/forms/form-submissions-list";
import type { Contact } from "@/types/contacts";
import type {
  ContactSubmissionView,
  ContactSubmissionsResponse,
} from "@/types/contact-feed";

const MAX_SHOWN = 4;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Every form this contact has submitted (Contacts redesign, 2026-09-25).
 *
 * Reads through `GET /api/contacts/[id]/form-submissions` (tenant + territory
 * checked, parent-form re-verified) instead of the old client
 * collection-group query the security rules never allowed — which is what
 * left three loading placeholders on screen indefinitely. Always resolves
 * to content, the empty state, or an error with Retry.
 */
export function ContactSubmittedForms({
  contact,
  collapsible = null,
}: {
  contact: Contact;
  collapsible?: string | null;
}) {
  const { user } = useAuth();
  const { data, error, loading, reload } = useJsonResource<ContactSubmissionsResponse>(
    user ? `/api/contacts/${contact.id}/form-submissions` : null,
  );
  const [viewing, setViewing] = useState<ContactSubmissionView | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const submissions = data?.submissions ?? [];

  const summary = loading && !data
    ? "…"
    : error
      ? "Couldn't load"
      : submissions.length === 0
        ? "None yet"
        : `${submissions.length}${data?.truncated ? "+" : ""} submission${submissions.length === 1 ? "" : "s"}`;

  return (
    <RelatedCard
      title="Submitted forms"
      summary={summary}
      collapsible={collapsible}
      action={
        submissions.length > MAX_SHOWN ? (
          <Button size="sm" variant="ghost" onClick={() => setAllOpen(true)}>
            View all
          </Button>
        ) : undefined
      }
    >
      {loading && !data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading submitted forms">
          <div className="h-9 animate-pulse rounded-lg border bg-muted/40" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">Couldn&apos;t load submitted forms.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={reload} className="h-7 shrink-0">
            <RotateCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-5 text-center text-xs text-muted-foreground">
          <Inbox className="mx-auto mb-1 h-4 w-4" />
          No forms submitted yet.
        </div>
      ) : (
        <SubmissionRows rows={submissions.slice(0, MAX_SHOWN)} onView={setViewing} />
      )}

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submitted forms</DialogTitle>
            <DialogDescription>
              {submissions.length}
              {data?.truncated ? "+" : ""} submissions by {contact.name || contact.email || "this contact"}, newest first.
              {data?.truncated ? " Showing the most recent 100." : ""}
            </DialogDescription>
          </DialogHeader>
          <SubmissionRows
            rows={submissions}
            onView={(s) => {
              setAllOpen(false);
              setViewing(s);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.formName ?? "Submission"}</DialogTitle>
            <DialogDescription>
              Submitted {viewing ? formatDate(viewing.createdAt) : ""}
              {viewing?.legacy ? " · older submission — field names shown as stored" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {viewing && <SubmissionAnswersList answers={viewing.answers} />}
          </div>
        </DialogContent>
      </Dialog>
    </RelatedCard>
  );
}

function SubmissionRows({
  rows,
  onView,
}: {
  rows: ContactSubmissionView[];
  onView: (s: ContactSubmissionView) => void;
}) {
  return (
    <ul className="divide-y rounded-lg border bg-background">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center gap-2 px-3 py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.formName}</p>
            <p className="text-[11px] text-muted-foreground">{formatDate(s.createdAt)}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => onView(s)}>
            View
          </Button>
        </li>
      ))}
    </ul>
  );
}
