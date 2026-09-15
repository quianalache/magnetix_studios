"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, Mail, Phone, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccessStatus = "active" | "pending" | "none";

/** Small, deliberately unopinionated status line — never auto-fires
 *  anything on its own. Matches getClientOwnerAccessStatus's own three
 *  states exactly, so the UI and the server can never disagree about what
 *  "provisioned" means. */
function AccessStatusBadge({ status }: { status: AccessStatus }) {
  const styles: Record<AccessStatus, string> = {
    active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    none: "bg-muted text-muted-foreground",
  };
  const labels: Record<AccessStatus, string> = {
    active: "Active",
    pending: "Invite pending",
    none: "Not provisioned",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function SubAccountContactSection() {
  const { subAccount, subAccountId, isAdmin } = useSubAccount();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Business Center access status for the SAVED account-contact email —
  // deliberately independent of the (possibly unsaved) form fields above,
  // since this reflects real provisioning state in Firestore, not whatever
  // is currently typed into the form.
  const savedEmail = subAccount?.accountContact?.email ?? null;
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    setName(subAccount?.accountContact?.name ?? "");
    setEmail(subAccount?.accountContact?.email ?? "");
    setPhone(subAccount?.accountContact?.phone ?? "");
  }, [subAccount]);

  useEffect(() => {
    if (!isAdmin || !savedEmail) {
      setAccessStatus(null);
      return;
    }
    let cancelled = false;
    setCheckingAccess(true);
    fetch(`/api/agency/sub-accounts/${subAccountId}/client-owner-access`)
      .then((res) => res.json())
      .then((data: { status?: AccessStatus }) => {
        if (!cancelled && data.status) setAccessStatus(data.status);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, savedEmail, subAccountId]);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.trim();
      const payload =
        !trimmedName && !trimmedEmail && !trimmedPhone
          ? null
          : { name: trimmedName, email: trimmedEmail, phone: trimmedPhone };
      const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountContact: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      toast.success(
        payload ? "Account contact saved." : "Account contact cleared."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  // The ONLY place this ever fires — a deliberate click, never on save,
  // never automatically. Provisions/re-provisions access for whatever
  // email is currently SAVED as the account contact (the server reads it
  // fresh, not from anything this form sends).
  async function handleGrantAccess() {
    setGranting(true);
    try {
      const res = await fetch(
        `/api/agency/sub-accounts/${subAccountId}/client-owner-access`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: AccessStatus;
        mailed?: boolean;
        added?: boolean;
        alreadyMember?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not grant access.");
      if (data.status) setAccessStatus(data.status);
      if (data.alreadyMember) {
        toast.success("Already has active Business Center access.");
      } else if (data.added) {
        toast.success("Existing CRM account added to this workspace.");
      } else if (data.mailed) {
        toast.success("Invite/setup email sent.");
      } else {
        toast.success("Access provisioned.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not grant access."
      );
    } finally {
      setGranting(false);
    }
  }

  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Account contact</h2>
          <p className="text-muted-foreground text-xs">
            Primary point of contact at the client. Shown on the dashboard.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <div className="relative">
            <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="pl-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Email</Label>
          <div className="relative">
            <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acme.com"
              className="pl-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Phone</Label>
          <div className="relative">
            <Phone className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              id="contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="pl-8"
            />
          </div>
          <p className="text-muted-foreground text-[11px]">
            E.164 format recommended. Leave any field blank to omit it.
          </p>
        </div>

        {savedEmail && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Business Center access:
              </span>
              {checkingAccess || accessStatus === null ? (
                <span className="text-muted-foreground text-[11px]">
                  Checking…
                </span>
              ) : (
                <AccessStatusBadge status={accessStatus} />
              )}
            </div>
            {accessStatus === "none" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={granting}
                onClick={() => void handleGrantAccess()}
              >
                {granting ? "Granting…" : "Grant Business Center access"}
              </Button>
            )}
            {accessStatus === "pending" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={granting}
                onClick={() => void handleGrantAccess()}
              >
                {granting ? "Resending…" : "Resend invite"}
              </Button>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
