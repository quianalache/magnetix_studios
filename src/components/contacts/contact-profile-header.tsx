"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  PhoneOutgoing,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceBadge } from "@/components/contacts/source-badge";
import { LinkContactButton } from "@/components/contacts/link-contact-button";
import { MergeContactButton } from "@/components/contacts/merge-contact-button";
import { ContactForm } from "@/components/contacts/contact-form";
import { SendCallDialog } from "@/components/contacts/send-call-dialog";
import { formatContactDate } from "@/lib/format";
import { contactDisplayName, contactInitials } from "@/lib/contacts/names";
import { useSubAccount } from "@/context/sub-account-context";
import type { Contact, ContactFormData } from "@/types/contacts";

interface ContactBlocker {
  type: string;
  /** Singular noun; pluralized in the UI by appending "s". */
  label: string;
  count: number;
}

/**
 * Contact profile top bar (Contacts redesign, 2026-09-25): identity + every
 * existing contact action and its dialog — AI Call, Google review request,
 * Link (Meta contacts), Merge, Edit, Delete (with the linked-record dry-run
 * check). The details list moved to `ContactInfoCard`; the edit sheet is
 * controlled by the page so the info card's Edit button opens the same form.
 *
 * Email / SMS / WhatsApp sending lives in the Conversations tab (the
 * embedded Conversations workspace composer), which replaced the old
 * header Email / SMS dialogs.
 */
export function ContactProfileHeader({
  contact,
  editOpen,
  onEditOpenChange,
}: {
  contact: Contact;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
}) {
  const { saPath, subAccount, subAccountId, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const router = useRouter();
  const [callOpen, setCallOpen] = useState(false);
  // Show the AI-call button only where the agency has enabled outbound
  // voice. Remaining gates (channel toggle, provisioning, compliance)
  // surface as errors inside the dialog.
  const outboundAvailable = subAccount?.outboundVoiceEnabledByAgency === true;
  // Manual Google review request — only shown once the sub-account has a
  // review link configured (Settings → Google reviews).
  const reviewConfigured = !!subAccount?.googleReviewConfig?.reviewUrl;
  const [reviewSending, setReviewSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<
    | { phase: "checking" }
    | { phase: "blocked"; blockers: ContactBlocker[] }
    | { phase: "confirm" }
  >({ phase: "checking" });

  async function handleSave(data: ContactFormData) {
    // Territory is owned by the contact and fanned out to its
    // deals/quotes/tasks/events via a dedicated admin endpoint, so it's
    // handled separately from the plain field update.
    const { territoryId, ...rest } = data;
    // Server route (not a direct Firestore write) so contact.updated fires.
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(payload.error ?? "Couldn't update contact.");
      return;
    }

    const territoryChanged =
      scopingOn &&
      isAdmin &&
      (territoryId ?? null) !== (contact.territoryId ?? null);
    if (territoryChanged) {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/contacts/${contact.id}/territory`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ territoryId: territoryId ?? null }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(payload.error ?? "Could not move the account's territory.");
        return;
      }
    }

    toast.success("Contact updated");
    onEditOpenChange(false);
  }

  async function handleRequestReview() {
    setReviewSending(true);
    try {
      const res = await fetch("/api/comms/review-request/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: boolean;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't send review request.");
      }
      if (data.sent) {
        toast.success("Google review request sent.");
      } else {
        toast.error(reviewSkipMessage(data.reason));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't send review request.",
      );
    } finally {
      setReviewSending(false);
    }
  }

  const displayName = contactDisplayName(contact);
  const contactName = contact.name || contact.email || "this contact";

  // Open the delete modal and run the dry-run link check. If the contact is
  // linked to anything the modal explains what's blocking it; otherwise it
  // shows a final confirm.
  async function openDeleteModal() {
    setDeleteOpen(true);
    setDeleteState({ phase: "checking" });
    try {
      const res = await fetch(`/api/contacts/${contact.id}?check=1`);
      const data = (await res.json().catch(() => ({}))) as {
        deletable?: boolean;
        blockers?: ContactBlocker[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't check this contact's links.");
        setDeleteOpen(false);
        return;
      }
      if (data.deletable) {
        setDeleteState({ phase: "confirm" });
      } else {
        setDeleteState({ phase: "blocked", blockers: data.blockers ?? [] });
      }
    } catch {
      toast.error("Couldn't check this contact's links.");
      setDeleteOpen(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        blockers?: ContactBlocker[];
      };
      // Something got linked between the check and the delete — re-show the
      // blocked state instead of erroring out.
      if (res.status === 409) {
        setDeleting(false);
        setDeleteState({ phase: "blocked", blockers: data.blockers ?? [] });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Could not delete contact.");
      }
      toast.success(`Deleted ${contactName}.`);
      router.push(saPath("/contacts"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete contact.",
      );
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Link
          href={saPath("/contacts")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to contacts
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary sm:h-14 sm:w-14 sm:text-lg"
            >
              {contactInitials(contact)}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                  {displayName}
                </h1>
                {contact.source && <SourceBadge source={contact.source} />}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Added {formatContactDate(contact.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {outboundAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCallOpen(true)}
                disabled={!contact.phone}
                title={!contact.phone ? "No phone on this contact" : "Call with AI"}
              >
                <PhoneOutgoing className="mr-1 h-3.5 w-3.5" />
                Call
              </Button>
            )}
            {reviewConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestReview}
                disabled={!contact.phone || reviewSending}
                title={!contact.phone ? "No phone on this contact" : "Request a Google review"}
              >
                <Star className="mr-1 h-3.5 w-3.5" />
                Review
              </Button>
            )}
            {/* Self-gates: only renders for a Facebook/Instagram (metaUserId)
                contact, for an admin. */}
            <LinkContactButton contact={contact} />
            {/* Self-gates: admin only. */}
            <MergeContactButton contact={contact} />
            <Button variant="outline" size="sm" onClick={() => onEditOpenChange(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={openDeleteModal}
                disabled={deleteOpen}
                className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                title="Delete this contact"
                aria-label="Delete this contact"
              >
                <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Sheet open={editOpen} onOpenChange={onEditOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Contact</SheetTitle>
            <SheetDescription>
              Update {contact.name || "this contact"}&apos;s details.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            <ContactForm
              initial={contact}
              submitLabel="Save Changes"
              onSubmit={handleSave}
              onCancel={() => onEditOpenChange(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {outboundAvailable && (
        <SendCallDialog contact={contact} open={callOpen} onOpenChange={setCallOpen} />
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteOpen(false);
        }}
      >
        <DialogContent>
          {deleteState.phase === "checking" && (
            <DialogHeader>
              <DialogTitle>Checking…</DialogTitle>
              <DialogDescription>
                Looking for records linked to {contactName}.
              </DialogDescription>
            </DialogHeader>
          )}

          {deleteState.phase === "blocked" && (
            <>
              <DialogHeader>
                <DialogTitle>Can&apos;t delete this contact</DialogTitle>
                <DialogDescription>
                  {contactName} is still linked to other records. Remove or
                  reassign these first, then delete the contact.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-1.5 py-2">
                {deleteState.blockers.map((b) => (
                  <li key={b.type} className="flex items-center gap-2.5 text-sm">
                    <span className="inline-flex min-w-6 justify-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-destructive">
                      {b.count}
                    </span>
                    <span className="capitalize">
                      {b.count === 1 ? b.label : `${b.label}s`}
                    </span>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button onClick={() => setDeleteOpen(false)}>Got it</Button>
              </DialogFooter>
            </>
          )}

          {deleteState.phase === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete contact?</DialogTitle>
                <DialogDescription>
                  This permanently removes {contactName} along with their
                  notes and activity timeline. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete contact"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function reviewSkipMessage(reason?: string): string {
  switch (reason) {
    case "opted_out":
      return "This contact has opted out of that channel.";
    case "no_phone":
      return "This contact has no phone number.";
    case "not_configured":
      return "Set up Google reviews in Settings first.";
    case "whatsapp_not_configured":
    case "whatsapp_gate_off":
      return "WhatsApp isn't fully configured for this sub-account.";
    case "no_template":
    case "template_not_approved":
      return "The WhatsApp review template isn't approved yet.";
    case "window_closed":
      return "WhatsApp's 24h window is closed — the contact hasn't messaged recently. Use it from the inbox after they reply, or switch to a template / SMS.";
    case "sms_not_configured":
      return "SMS isn't configured on this deployment.";
    default:
      return "Couldn't send the review request.";
  }
}
