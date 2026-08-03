"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Inbox, User } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { toDate } from "@/lib/format";
import type { FormSubmission } from "@/types/forms";

/**
 * Renders a list of `FormSubmission`s with an expandable row per entry.
 * Shared by the form builder's Submissions tab (one form, `showFormName`
 * off) and the contact profile's Submitted Forms section (many forms,
 * `showFormName` on).
 */
export function FormSubmissionsList({
  submissions,
  loading,
  showFormName = false,
  emptyLabel = "No submissions yet.",
}: {
  submissions: FormSubmission[];
  loading: boolean;
  showFormName?: boolean;
  emptyLabel?: string;
}) {
  const { saPath } = useSubAccount();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
        <Inbox className="mx-auto mb-1 h-4 w-4" />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {submissions.map((s) => {
        const isOpen = expanded.has(s.id);
        const preview =
          s.mapped?.name || s.mapped?.email || s.mapped?.phone || "Anonymous submission";
        const date = toDate(s.createdAt);
        return (
          <div key={s.id} className="overflow-hidden rounded-lg border bg-background">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{preview}</p>
                {showFormName && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.formName || "Form"}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {date
                  ? date.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-2 border-t bg-muted/20 px-3 py-3">
                {(s.answers ?? legacyAnswersFrom(s)).map((a) => (
                  <div key={a.fieldId} className="text-xs">
                    <p className="font-medium text-muted-foreground">{a.label}</p>
                    <p className="mt-0.5 whitespace-pre-wrap">{a.value || "—"}</p>
                  </div>
                ))}
                {s.contactId && (
                  <Link
                    href={saPath(`/contacts/${s.contactId}`)}
                    className="inline-flex items-center gap-1 pt-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <User className="h-3 w-3" />
                    View contact
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Fallback for submissions written before `answers` was denormalized — field ids stand in for labels since the original form fields aren't snapshotted. */
function legacyAnswersFrom(s: FormSubmission): { fieldId: string; label: string; value: string }[] {
  return Object.entries(s.values ?? {}).map(([fieldId, value]) => ({
    fieldId,
    label: fieldId,
    value,
  }));
}
