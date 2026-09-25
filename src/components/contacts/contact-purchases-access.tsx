"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BookOpen,
  Gift,
  Loader2,
  Package,
  Plus,
  RotateCw,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useJsonResource } from "@/hooks/use-json-resource";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { RelatedCard } from "@/components/contacts/related-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Contact } from "@/types/contacts";
import type {
  AccessCatalog,
  AccessCatalogItem,
  AccessSourceLabel,
  ContactAccessSummary,
  ContactAccessView,
  ContactPurchaseView,
} from "@/types/contact-access";

const SOURCE_LABEL: Record<AccessSourceLabel, string> = {
  purchase: "Paid",
  complimentary: "Complimentary",
  product: "Included with a product",
  joined: "Joined",
  staff: "Added by staff",
  imported: "Imported",
  free: "Free",
};

const SOURCE_TONE: Record<AccessSourceLabel, string> = {
  purchase: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  complimentary: "border-violet-500/40 text-violet-700 dark:text-violet-300",
  product: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  joined: "border-muted-foreground/30 text-muted-foreground",
  staff: "border-muted-foreground/30 text-muted-foreground",
  imported: "border-muted-foreground/30 text-muted-foreground",
  free: "border-muted-foreground/30 text-muted-foreground",
};

function kindIcon(kind: ContactAccessView["kind"]) {
  if (kind === "community") return <Users className="h-3.5 w-3.5" aria-hidden="true" />;
  if (kind === "course") return <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Package className="h-3.5 w-3.5" aria-hidden="true" />;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const MAX_ACCESS = 4;
const MAX_PURCHASES = 3;

/**
 * Contact profile → Purchases & Access (Contacts redesign, 2026-09-25).
 * Shows what this contact bought and what they can access (distinguishing
 * paid from complimentary / product-included / self-joined access), and
 * lets admins grant complimentary access or revoke it — through the
 * existing entitlement services, never by creating a purchase. See
 * src/lib/server/contact-access-service.ts for the rules.
 */
export function ContactPurchasesAccess({
  contact,
  collapsible = null,
}: {
  contact: Contact;
  collapsible?: string | null;
}) {
  const { user } = useAuth();
  const { subAccountId } = useSubAccount();
  const { data, error, loading, reload } = useJsonResource<
    ContactAccessSummary & { canManage: boolean }
  >(user ? `/api/contacts/${contact.id}/access` : null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [revoking, setRevoking] = useState<ContactAccessView | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const access = data?.access ?? [];
  const purchases = (data?.purchases ?? []).filter((p) => !p.offerMarker);
  const activeCount = access.filter((a) => a.status === "active" || a.status === "enrolled" || a.status === "completed").length;
  const canManage = data?.canManage === true;

  const summary =
    loading && !data
      ? "…"
      : error
        ? "Couldn't load"
        : access.length === 0 && purchases.length === 0
          ? "None yet"
          : `${activeCount} active · ${purchases.length} purchase${purchases.length === 1 ? "" : "s"}`;

  async function doRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/access/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: revoking.key }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't revoke access.");
      toast.success(body.message ?? "Access revoked.");
      setRevoking(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke access.");
    } finally {
      setRevokeBusy(false);
    }
  }

  const tooMany = access.length > MAX_ACCESS || purchases.length > MAX_PURCHASES;

  return (
    <RelatedCard
      title="Purchases & access"
      summary={summary}
      collapsible={collapsible}
      action={
        canManage ? (
          <Button size="sm" variant="outline" onClick={() => setGrantOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Grant
          </Button>
        ) : undefined
      }
    >
      {loading && !data ? (
        <div className="h-10 animate-pulse rounded-lg border bg-muted/40" aria-busy="true" />
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" className="h-7" onClick={reload}>
            <RotateCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      ) : access.length === 0 && purchases.length === 0 ? (
        <div className="rounded-lg border border-dashed py-5 text-center text-xs text-muted-foreground">
          <ShoppingBag className="mx-auto mb-1 h-4 w-4" />
          No purchases or access yet.
        </div>
      ) : (
        <div className="space-y-3">
          {access.length > 0 && (
            <AccessList
              rows={access.slice(0, MAX_ACCESS)}
              canManage={canManage}
              onRevoke={setRevoking}
            />
          )}
          {purchases.length > 0 && <PurchaseList rows={purchases.slice(0, MAX_PURCHASES)} />}
          {tooMany && (
            <button
              type="button"
              onClick={() => setAllOpen(true)}
              className="block w-full text-center text-xs font-medium text-primary hover:underline"
            >
              View all
            </button>
          )}
        </div>
      )}

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Purchases & access</DialogTitle>
            <DialogDescription>
              Everything {contact.name || contact.email || "this contact"} has bought or can access.
            </DialogDescription>
          </DialogHeader>
          {access.length > 0 && (
            <AccessList
              rows={access}
              canManage={canManage}
              onRevoke={(a) => {
                setAllOpen(false);
                setRevoking(a);
              }}
            />
          )}
          {purchases.length > 0 && <PurchaseList rows={purchases} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!revoking} onOpenChange={(o) => !o && !revokeBusy && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke complimentary access?</DialogTitle>
            <DialogDescription>
              This removes the complimentary access to &ldquo;{revoking?.name}&rdquo; that was
              granted from Contacts. If they also have access through a purchase or a product
              they bought, that access stays in place.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={revokeBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doRevoke} disabled={revokeBusy}>
              {revokeBusy ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage && (
        <GrantAccessDialog
          open={grantOpen}
          onOpenChange={setGrantOpen}
          contact={contact}
          subAccountId={subAccountId}
          hasMember={(data?.members.length ?? 0) > 0}
          current={access}
          onGranted={reload}
        />
      )}
    </RelatedCard>
  );
}

function AccessList({
  rows,
  canManage,
  onRevoke,
}: {
  rows: ContactAccessView[];
  canManage: boolean;
  onRevoke: (a: ContactAccessView) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Access
      </p>
      <ul className="divide-y rounded-lg border bg-background">
        {rows.map((a) => (
          <li key={a.key} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-muted-foreground">{kindIcon(a.kind)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                    {a.status}
                  </Badge>
                  {a.sources.map((s) => (
                    <Badge key={s} variant="outline" className={cn("h-5 px-1.5 text-[10px]", SOURCE_TONE[s])}>
                      {SOURCE_LABEL[s]}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {a.complimentary
                    ? `Granted ${shortDate(a.complimentary.grantedAt)}${
                        a.complimentary.grantedByName ? ` by ${a.complimentary.grantedByName}` : ""
                      }`
                    : a.since
                      ? `Since ${shortDate(a.since)}`
                      : ""}
                  {a.managedNote && !a.revocable ? `${a.since || a.complimentary ? " · " : ""}${a.managedNote}` : ""}
                </p>
              </div>
              {canManage && a.revocable && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => onRevoke(a)}
                >
                  Revoke
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PurchaseList({ rows }: { rows: ContactPurchaseView[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Purchases
      </p>
      <ul className="divide-y rounded-lg border bg-background">
        {rows.map((p) => (
          <li key={`${p.scope}-${p.id}`} className="flex items-center gap-2 px-3 py-2">
            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.targetName}</p>
              <p className="text-[11px] text-muted-foreground">
                {shortDate(p.paidAt ?? p.requestedAt)}
                {p.markedPaidByStaff ? " · marked paid by staff" : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium tabular-nums">{money(p.amountCents, p.currency)}</p>
              <p
                className={cn(
                  "text-[10px] capitalize",
                  p.status === "paid" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                {p.status}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrantAccessDialog({
  open,
  onOpenChange,
  contact,
  subAccountId,
  hasMember,
  current,
  onGranted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: Contact;
  subAccountId: string;
  hasMember: boolean;
  current: ContactAccessView[];
  onGranted: () => void;
}) {
  const { data: catalog, error, loading, reload } = useJsonResource<AccessCatalog>(
    open ? `/api/sub-accounts/${subAccountId}/access-catalog` : null,
  );
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const activeKeys = useMemo(
    () => new Set(current.filter((a) => a.status !== "removed").map((a) => a.key)),
    [current],
  );

  const groups: { label: string; items: AccessCatalogItem[] }[] = catalog
    ? [
        { label: "Communities", items: catalog.communities },
        { label: "Courses", items: catalog.courses },
        { label: "Offers", items: catalog.offers },
      ].filter((g) => g.items.length > 0)
    : [];
  const selectedItem = groups.flatMap((g) => g.items).find((i) => i.key === selected) ?? null;

  async function grant() {
    if (!selectedItem) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/access/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selectedItem.key }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string; status?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't grant access.");
      if (body.status === "already") toast.message(body.message ?? "They already have access.");
      else toast.success(body.message ?? "Access granted.");
      onOpenChange(false);
      setSelected("");
      onGranted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't grant access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4" /> Grant complimentary access
          </DialogTitle>
          <DialogDescription>
            Gives {contact.name || contact.email || "this contact"} access without recording a
            purchase or payment. You can revoke complimentary community access later.
          </DialogDescription>
        </DialogHeader>

        {loading && !catalog ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : error ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This workspace has no communities, courses or offers yet.
          </p>
        ) : (
          <div className="space-y-3" role="radiogroup" aria-label="What to grant">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                <ul className="divide-y rounded-lg border">
                  {g.items.map((item) => {
                    const already = activeKeys.has(item.key);
                    const disabled = !item.grantable || already;
                    return (
                      <li key={item.key}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                            disabled && "cursor-not-allowed opacity-60",
                            selected === item.key && "bg-muted/50",
                          )}
                        >
                          <input
                            type="radio"
                            name="grant-item"
                            className="mt-1"
                            value={item.key}
                            checked={selected === item.key}
                            disabled={disabled}
                            onChange={() => setSelected(item.key)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {item.name}
                              {!item.published && (
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(draft)</span>
                              )}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {already
                                ? "Already has access."
                                : item.grantable
                                  ? item.kind === "community"
                                    ? item.paid
                                      ? "Paid community — grants access without payment."
                                      : "Adds them as an active member."
                                    : item.kind === "course"
                                      ? "Enrolls them in this open course."
                                      : "Grants this free offer's courses and extras."
                                  : item.grantBlockedReason}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {!hasMember && (
          <p className="rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            {contact.email
              ? `This contact doesn't have a member account yet. One will be created for ${contact.email}, linked to this contact, so they can sign in to the portal with an email sign-in link.`
              : "This contact needs an email address before access can be granted — member accounts are identified by email."}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          They&apos;ll get the usual &ldquo;access granted&rdquo; notification — in the app, and by
          email if their notification settings allow it.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={grant} disabled={busy || !selectedItem || (!hasMember && !contact.email)}>
            {busy ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
