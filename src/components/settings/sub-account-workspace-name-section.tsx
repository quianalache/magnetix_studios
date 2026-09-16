"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Self-service workspace/business name — lets a sub-account ADMIN (not just
 * the agency) rename their own workspace. Saves through the same
 * PATCH /api/agency/sub-accounts/[id] route the Agency-side rename dialog
 * uses (that route already accepts either an agency owner or a sub-account
 * admin via requireSubAccountAdmin), and the route's own membership-sync
 * keeps every userMemberships/{uid}/subAccounts/{id} copy — the sidebar
 * switcher's data source — in step. Canonical field stays SubAccountDoc.name;
 * this never touches the public Space slug.
 */
export function SubAccountWorkspaceNameSection() {
  const { subAccount, subAccountId, isAdmin } = useSubAccount();
  const savedName = subAccount?.name ?? "";

  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);

  // Re-sync local input whenever the live doc's name changes underneath us
  // (another tab, the agency's own dialog, or this save itself landing).
  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  if (!isAdmin) return null;

  const trimmed = name.trim();
  const dirty = trimmed !== savedName;
  const canSave = !saving && dirty && trimmed.length > 0;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) {
      toast.error("Workspace name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save.");
      }
      setName(trimmed);
      toast.success("Workspace name updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Store className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Workspace / business name</h2>
          <p className="text-muted-foreground text-xs">
            Shown across your dashboard, sidebar, and customer-facing pages.
            Doesn&apos;t change your Space URL.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="workspace-name">Name</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            maxLength={120}
            placeholder="Your business name"
          />
          {subAccount?.slug && (
            <p className="text-muted-foreground text-[11px]">
              Your public Space URL (
              <code className="bg-muted rounded px-1">
                /portal/{subAccount.slug}
              </code>
              ) stays the same either way.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!canSave}>
            {saving ? "Saving…" : "Save name"}
          </Button>
        </div>
      </form>
    </section>
  );
}
