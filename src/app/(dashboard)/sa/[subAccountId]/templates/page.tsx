"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { toDate } from "@/lib/format";
import type { MessageTemplateDoc } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";

/**
 * SMS Templates (2026-09-10) — this surface used to be a generic
 * Email+SMS "Templates" page; Email Templates now has its own canonical
 * library under Email, so this narrows to what's left: SMS. Same
 * `message_templates` collection and records as before, just filtered to
 * `type === "sms"` — no data moved, nothing else about SMS changed.
 */
export default function SmsTemplatesListPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const [templates, setTemplates] = useState<MessageTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm: confirmDialog, dialog } = useConfirm();

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const q = query(
      collection(getFirebaseDb(), "message_templates"),
      where("subAccountId", "==", subAccountId),
      where("type", "==", "sms"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MessageTemplateDoc);
        list.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0),
        );
        setTemplates(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleDelete(t: MessageTemplateDoc) {
    const ok = await confirmDialog({ title: `Delete template "${t.name}"?`, description: "Automations that use it will need a new template.", confirmLabel: "Delete template", tone: "danger" });
    if (!ok) return;
    try {
      await deleteDoc(doc(getFirebaseDb(), "message_templates", t.id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="SMS Templates"
        description="Reusable text message bodies, with merge tags resolved at send-time."
        actions={
          isAdmin ? (
            <Button render={<Link href={saPath("/templates/new")} />}>
              <Plus className="size-4" aria-hidden="true" />
              New template
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <SystemEmptyState
          icon={MessageSquare}
          title="No SMS templates yet"
          description={
            <>
              Create a text message template to use in an automation. Tags like <code>{"{{contact.firstName}}"}</code> get
              filled in at send-time.
            </>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-card transition-[border-color,box-shadow] hover:border-border-strong"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg">
                  <MessageSquare className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <Link
                    href={saPath(`/templates/${t.id}`)}
                    className="block truncate text-body-sm font-semibold text-foreground hover:text-link hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="truncate text-caption text-muted-foreground">
                    {t.body.slice(0, 80) + (t.body.length > 80 ? "…" : "")}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(t)}
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete template ${t.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </PageShell>
  );
}
