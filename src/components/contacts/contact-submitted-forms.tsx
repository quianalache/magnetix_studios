"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { subscribeToFormSubmissionsForContact } from "@/lib/firestore/form-submissions";
import { FormSubmissionsList } from "@/components/forms/form-submissions-list";
import type { Contact } from "@/types/contacts";
import type { FormSubmission } from "@/types/forms";

/** Every form this contact has ever submitted, across every form — the reverse view of a form's own Submissions tab. */
export function ContactSubmittedForms({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeToFormSubmissionsForContact(contact.id, (list) => {
      setSubmissions(list);
      setLoading(false);
    });
    return () => unsub();
  }, [contact.id, user]);

  // Nothing submitted and we're done loading — skip the card entirely
  // rather than showing an empty-state box on every contact.
  if (!loading && submissions.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Submitted Forms
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          {loading ? "…" : `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <FormSubmissionsList submissions={submissions} loading={loading} showFormName />
    </div>
  );
}
