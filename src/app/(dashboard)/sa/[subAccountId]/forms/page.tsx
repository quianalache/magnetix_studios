"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  ExternalLink,
  Pencil,
  Copy,
  Trash2,
  MessageSquare,
  Inbox,
  ListChecks,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToForms, createForm, deleteForm } from "@/lib/firestore/forms";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { LeadForm } from "@/types/forms";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { RecordCard } from "@/components/system/record-card";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";

export default function FormsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToForms(
      { agencyId, subAccountId },
      (list) => {
        setForms(list);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleCreate() {
    if (!user || !agencyId || !newName.trim()) return;
    setCreating(true);
    try {
      const id = await createForm(
        { agencyId, subAccountId },
        user.uid,
        newName.trim(),
      );
      toast.success("Form created");
      setCreateOpen(false);
      setNewName("");
      window.location.href = saPath(`/forms/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create form. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateContact() {
    if (!user || !agencyId || creating) return;
    setCreating(true);
    try {
      const id = await createForm(
        { agencyId, subAccountId },
        user.uid,
        "Contact us",
        "contact",
      );
      toast.success("Contact form created");
      window.location.href = saPath(`/forms/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create contact form. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(form: LeadForm) {
    const ok = await confirm({
      title: `Delete form "${form.name}"?`,
      description: "Its public link stops working. Contacts already created from it are kept.",
      confirmLabel: "Delete form",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteForm(form.id);
      toast.success("Form deleted");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete form.");
    }
  }

  function copyLink(form: LeadForm) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/f/${form.id}`);
    toast.success("Public link copied");
  }

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="Forms"
        description="Public lead-capture forms. Every submission becomes a contact."
        actions={
        <>
          {/* Community Polls (2026-08-20) — a separate, poll-specific
              response experience, not a LeadForm — see that page's own
              comment for why. Linked from here so it's discoverable
              "under Forms & Quizzes" per the explicit product instruction,
              without merging its data or UI into the forms list below. */}
          <Button variant="outline" render={<Link href={saPath("/forms/community-polls")} />}>
            <ListChecks className="size-4" aria-hidden="true" />
            Community Polls
          </Button>
          <Button
            variant="outline"
            onClick={handleCreateContact}
            disabled={creating}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            Contact form
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={creating}>
            <Plus className="size-4" aria-hidden="true" />
            New Form
          </Button>
        </>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : forms.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          onCreateContact={handleCreateContact}
          creating={creating}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              editHref={saPath(`/forms/${form.id}`)}
              submissionsHref={saPath(`/forms/${form.id}?tab=submissions`)}
              onCopy={() => copyLink(form)}
              onDelete={() => handleDelete(form)}
            />
          ))}
        </div>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Form</SheetTitle>
            <SheetDescription>
              Give your form a name. You can customize fields next.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="form-name">Form name</Label>
              <Input
                id="form-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contact us, Demo request, Newsletter…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? "Creating…" : "Create & edit"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {dialog}
    </PageShell>
  );
}

function FormCard({
  form,
  editHref,
  submissionsHref,
  onCopy,
  onDelete,
}: {
  form: LeadForm;
  editHref: string;
  submissionsHref: string;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const created = toDate(form.createdAt);
  const unread = form.unreadSubmissionCount ?? 0;
  return (
    <RecordCard
      icon={FileText}
      tone="violet"
      title={form.name}
      status={<StatusPill tone={form.enabled ? "success" : "neutral"}>{form.enabled ? "Live" : "Paused"}</StatusPill>}
      meta={
        <>
          <p>
            {form.fields.length} fields · {form.submissionCount ?? 0} submissions
          </p>
          {created && (
            <p className="text-ink-tertiary">
              Created{" "}
              {created.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </>
      }
      actions={
        <>
          <Button size="sm" render={<Link href={editHref} />}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button size="sm" variant="outline" className="relative" render={<Link href={submissionsHref} />}>
            <Inbox className="size-3.5" aria-hidden="true" />
            Submissions
            {unread > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-micro font-semibold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy className="size-3.5" aria-hidden="true" />
            Copy link
          </Button>
          <Button size="sm" variant="outline" render={<a href={`/f/${form.id}`} target="_blank" rel="noreferrer" />}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            aria-label={`Delete ${form.name}`}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </>
      }
    />
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-card" />
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  onCreateContact,
  creating,
}: {
  onCreate: () => void;
  onCreateContact: () => void;
  creating: boolean;
}) {
  return (
    <SystemEmptyState
      icon={FileText}
      title="Create your first lead form"
      description="Drop a public form on your site. Submissions land as contacts in your pipeline automatically."
      action={
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={onCreateContact} disabled={creating}>
              <MessageSquare className="size-4" aria-hidden="true" />
              Quick contact form
            </Button>
            <Button onClick={onCreate} disabled={creating}>
              <Plus className="size-4" aria-hidden="true" />
              New form
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Quick contact form pre-fills Name, Email, Phone, and Message.
          </p>
        </div>
      }
    />
  );
}
