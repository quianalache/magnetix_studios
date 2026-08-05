"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Lock,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sub-account custom-domain settings panel — public pages ONLY (booking,
 * the Energetic Decoder tool, course/offer sales pages, the client portal).
 * Separate feature from the email sending domain above it on this page (see
 * `SubAccountEmailDomainSection`) — different Firestore field
 * (`customDomain`, not `resendConfig`), different provider (Vercel, not
 * Resend), different gate (`customDomainEnabledByAgency`).
 *
 * Flow:
 *   1. Operator enters their domain (root or subdomain — unlike the email
 *      flow, a root domain like "yourdomain.com" is expected here).
 *   2. POST /api/sub-accounts/[id]/custom-domain registers it with Vercel and
 *      returns the DNS records to add at the registrar.
 *   3. Operator adds the records, clicks Verify → POST .../custom-domain/verify.
 *   4. Once verified: /booking/{slug}, /decoder, /courses/{slug}, and /portal
 *      resolve on the domain, and every share-link builder in the app starts
 *      generating URLs on it instead of the shared platform domain. The bare
 *      root ("/") redirects to whatever "Root redirect" is set to below —
 *      handy for a domain that already points somewhere (a community, an
 *      existing site) that should keep working until a real homepage exists.
 */

function StatusBadge({ status }: { status: "pending" | "verified" | "error" }) {
  const tone =
    status === "verified"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "error"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  const label =
    status === "verified" ? "Verified" : status === "error" ? "Misconfigured" : "Pending verification";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>
  );
}

function CopyValue({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function SubAccountCustomDomainSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const cfg = subAccount?.customDomain ?? null;
  const gateOpen = subAccount?.customDomainEnabledByAgency === true;

  const [domain, setDomain] = useState("");
  const [rootRedirect, setRootRedirect] = useState(cfg?.rootRedirectUrl ?? "");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [savingRedirect, setSavingRedirect] = useState(false);

  if (!isAdmin) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to add the domain.");
      toast.success("Domain registered with Vercel. Add the DNS records, then verify.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add domain.");
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/custom-domain/verify`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        customDomain?: { status?: string };
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Verification failed.");
      if (data.customDomain?.status === "verified") {
        toast.success("Domain verified. Public links now use it.");
      } else {
        toast.info(
          "Not verified yet — DNS can take a few minutes (sometimes longer) to propagate. Try again shortly.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "Remove this custom domain? Public links (booking, decoder, courses, portal) revert to the shared platform domain immediately.",
      )
    ) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/custom-domain`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to remove the domain.");
      setDomain("");
      setRootRedirect("");
      toast.success("Custom domain removed. Links reverted to the shared platform domain.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove.");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveRedirect(e: FormEvent) {
    e.preventDefault();
    setSavingRedirect(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/custom-domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootRedirectUrl: rootRedirect.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save.");
      toast.success("Root redirect saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingRedirect(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Globe className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Custom domain</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Put your booking page, Energetic Decoder tool, course/offer pages,
            and client portal on your own domain instead of the shared
            platform domain. URLs become human-readable — e.g.{" "}
            <code className="text-[11px]">yourdomain.com/booking/discovery-call</code>.
          </p>
        </div>
      </header>

      {!gateOpen ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">Disabled by your agency</p>
            <p className="mt-1">
              Ask your agency owner to enable the custom domain feature for
              this sub-account.
            </p>
          </div>
        </div>
      ) : !cfg ? (
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-domain-input">Domain</Label>
            <Input
              id="custom-domain-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourdomain.com"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              A root domain (yourdomain.com) or a subdomain — whichever you
              want your public pages on.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Registering…
                </>
              ) : (
                "Add domain & get DNS records"
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
            <p className="truncate text-sm font-medium">{cfg.domain}</p>
            <StatusBadge status={cfg.status} />
          </div>

          {cfg.status === "verified" ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Verified. Public links now generate on {cfg.domain}.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Add these records at your registrar&apos;s DNS panel, then
                    click Verify. If this domain currently forwards somewhere
                    else (a registrar-level redirect, not a DNS record), turn
                    that off first — a forwarding rule overrides DNS and will
                    keep sending visitors to the old destination.
                  </span>
                </p>
              </div>

              {cfg.verificationRecords.length > 0 && (
                <div className="space-y-3">
                  {cfg.verificationRecords.map((r, i) => (
                    <div
                      key={`${r.type}-${r.domain}-${i}`}
                      className="space-y-2 rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span className="rounded bg-background px-1.5 py-0.5 uppercase tracking-wide">
                          {r.type}
                        </span>
                        {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Name</p>
                        <CopyValue value={r.domain} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Value</p>
                        <CopyValue value={r.value} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={removing || verifying}
              onClick={handleRemove}
            >
              {removing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Remove
            </Button>
            {cfg.status !== "verified" && (
              <Button type="button" size="sm" disabled={verifying} onClick={handleVerify}>
                {verifying ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Checking…
                  </>
                ) : (
                  "Verify domain"
                )}
              </Button>
            )}
          </div>

          <form onSubmit={handleSaveRedirect} className="space-y-1.5 border-t pt-4">
            <Label htmlFor="custom-domain-root-redirect">
              Root redirect (optional)
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-domain-root-redirect"
                value={rootRedirect}
                onChange={(e) => setRootRedirect(e.target.value)}
                placeholder="https://example.com/wherever-your-homepage-is"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" size="sm" variant="outline" disabled={savingRedirect}>
                {savingRedirect ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Where {cfg.domain} (the bare address, no path) sends visitors.
              Leave blank to show a simple placeholder instead. Doesn&apos;t
              affect /booking, /decoder, /courses, or /portal — those work
              regardless.
            </p>
          </form>
        </div>
      )}
    </section>
  );
}
