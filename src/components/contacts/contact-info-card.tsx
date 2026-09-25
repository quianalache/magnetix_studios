"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Building2,
  CircleDot,
  Mail,
  MailCheck,
  MailX,
  MapPin,
  MapPinned,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  Tag,
  UserRound,
  X,
} from "lucide-react";
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
import { SourceBadge } from "@/components/contacts/source-badge";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { useSubAccount } from "@/context/sub-account-context";
import type { Contact } from "@/types/contacts";
import { composeName } from "@/lib/contacts/names";
import type { TerritoryDoc } from "@/types";

/**
 * Contact profile → left panel "Contact information" (Contacts redesign,
 * 2026-09-25). The details list that used to live inside
 * ContactProfileHeader, unchanged in behavior (email marketing status +
 * staff unsubscribe/resubscribe, territory), plus the new structured fields
 * and inline tag add/remove. Every write goes through the existing server
 * routes (PATCH /api/contacts/[id], /marketing-email) so webhooks and
 * workflow triggers fire exactly as before.
 */
export function ContactInfoCard({
  contact,
  onEdit,
}: {
  contact: Contact;
  onEdit: () => void;
}) {
  const { subAccount, subAccountId } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [marketingAction, setMarketingAction] = useState<"unsubscribe" | "resubscribe" | null>(null);
  const [marketingActionSaving, setMarketingActionSaving] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = safeSubscribe(
      () => subscribeToTerritories(subAccountId, (list) => setTerritories(list)),
      () => setTerritories([]),
    );
    return () => unsub?.();
  }, [scopingOn, subAccountId]);

  const territoryName = (() => {
    if (!contact.territoryId) return null;
    const match = territories.find((t) => t.id === contact.territoryId);
    if (!match) return null;
    return match.status === "archived" ? `${match.name} (archived)` : match.name;
  })();

  // Staff marketing-email control (2026-08-28) — never infer "consented"
  // from emailOptedOut being false; emailOptedOut:true DOES mean
  // unsubscribed even without a structured record.
  const marketingStatus: "consented" | "unsubscribed" | "unknown" =
    contact.emailConsent?.status === "consented"
      ? "consented"
      : contact.emailConsent?.status === "unsubscribed"
        ? "unsubscribed"
        : contact.emailOptedOut
          ? "unsubscribed"
          : "unknown";
  const deliverabilitySuppressed = !!contact.deliverabilitySuppressed;
  const contactName = contact.name || contact.email || "this contact";

  async function handleMarketingAction(action: "unsubscribe" | "resubscribe") {
    setMarketingActionSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/marketing-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't update marketing email status.");
        return;
      }
      toast.success(
        action === "resubscribe"
          ? "Marked as consented to marketing email."
          : "Marked as unsubscribed from marketing email.",
      );
      setMarketingAction(null);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setMarketingActionSaving(false);
    }
  }

  async function saveTags(tags: string[]) {
    setTagSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't update tags.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update tags.");
      return false;
    } finally {
      setTagSaving(false);
    }
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    const tag = tagDraft.trim();
    if (!tag) return;
    const current = contact.tags ?? [];
    if (current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      toast.message("That tag is already on this contact.");
      return;
    }
    if (await saveTags([...current, tag])) {
      setTagDraft("");
      setAddingTag(false);
    }
  }

  const location = [contact.city, contact.state, contact.postalCode, contact.country]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(", ");
  // Only worth showing when the parts say something the heading doesn't
  // (e.g. a display name like "Dr. Jo Smith" with first "Jo").
  const hasParts =
    !!(contact.firstName?.trim() || contact.lastName?.trim()) &&
    composeName(contact.firstName, contact.lastName) !== (contact.name ?? "").trim();

  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Contact information">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          Contact information
        </h2>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </div>

      <dl className="space-y-3 text-sm">
        {hasParts && (
          <Row icon={<UserRound className="h-4 w-4" />} label="First / last name">
            <span className="text-foreground">
              {contact.firstName?.trim() || "—"} / {contact.lastName?.trim() || "—"}
            </span>
          </Row>
        )}
        <Row icon={<Mail className="h-4 w-4" />} label="Email">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="break-all text-foreground hover:text-primary hover:underline">
              {contact.email}
            </a>
          ) : (
            <Empty />
          )}
        </Row>
        {contact.email && (
          <Row icon={<MailCheck className="h-4 w-4" />} label="Email marketing">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={
                  marketingStatus === "consented"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    : "border-muted-foreground/30 text-muted-foreground"
                }
              >
                {marketingStatus === "consented"
                  ? "Consented"
                  : marketingStatus === "unsubscribed"
                    ? "Unsubscribed"
                    : "Unknown"}
              </Badge>
              {deliverabilitySuppressed && (
                <Badge
                  variant="outline"
                  className="gap-1 border-destructive/40 text-destructive"
                  title={
                    contact.deliverabilitySuppressedReason === "complaint"
                      ? "Marked as spam by this address"
                      : contact.deliverabilitySuppressedReason === "hard_bounce"
                        ? "This address hard-bounced"
                        : "Deliverability-suppressed"
                  }
                >
                  <ShieldAlert className="h-3 w-3" />
                  Suppressed
                </Badge>
              )}
              {marketingStatus !== "unsubscribed" && (
                <button
                  type="button"
                  onClick={() => setMarketingAction("unsubscribe")}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MailX className="h-3 w-3" /> Mark unsubscribed
                </button>
              )}
              {marketingStatus !== "consented" && (
                <button
                  type="button"
                  onClick={() => setMarketingAction("resubscribe")}
                  disabled={deliverabilitySuppressed}
                  title={
                    deliverabilitySuppressed
                      ? "Can't resubscribe — this address is deliverability-suppressed"
                      : undefined
                  }
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <MailCheck className="h-3 w-3" /> Resubscribe
                </button>
              )}
            </div>
          </Row>
        )}
        <Row icon={<Phone className="h-4 w-4" />} label="Phone">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="text-foreground hover:text-primary hover:underline">
              {contact.phone}
            </a>
          ) : (
            <Empty />
          )}
        </Row>
        <Row icon={<Building2 className="h-4 w-4" />} label="Company">
          {contact.company ? <span className="text-foreground">{contact.company}</span> : <Empty />}
        </Row>
        {(contact.address?.trim() || location) && (
          <Row icon={<MapPin className="h-4 w-4" />} label="Address">
            {contact.address?.trim() && (
              <span className="block whitespace-pre-line text-foreground">{contact.address}</span>
            )}
            {location && <span className="block text-xs text-muted-foreground">{location}</span>}
          </Row>
        )}
        {scopingOn && (
          <Row icon={<MapPinned className="h-4 w-4" />} label="Territory">
            {/* No explicit territory resolves to Global — the shared floor. */}
            <Badge variant="outline">{territoryName || "Global"}</Badge>
          </Row>
        )}
      </dl>

      <div className="mt-4 space-y-3 border-t pt-4 text-sm">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Tags
            </p>
            {!addingTag && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                onClick={() => setAddingTag(true)}
              >
                <Plus className="mr-0.5 h-3 w-3" /> Add tag
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(contact.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  disabled={tagSaving}
                  onClick={() => void saveTags((contact.tags ?? []).filter((t) => t !== tag))}
                  className="rounded-sm text-muted-foreground hover:text-destructive"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {(contact.tags ?? []).length === 0 && !addingTag && (
              <span className="text-xs text-muted-foreground">No tags</span>
            )}
          </div>
          {addingTag && (
            <form onSubmit={addTag} className="mt-2 flex items-center gap-1.5">
              <input
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingTag(false);
                    setTagDraft("");
                  }
                }}
                placeholder="New tag"
                maxLength={60}
                aria-label="New tag"
                className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={tagSaving || !tagDraft.trim()}>
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setAddingTag(false);
                  setTagDraft("");
                }}
              >
                Cancel
              </Button>
            </form>
          )}
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CircleDot className="h-3.5 w-3.5" /> Source
          </p>
          {contact.source ? <SourceBadge source={contact.source} /> : <Empty />}
        </div>
      </div>

      {/* Staff marketing-email control (2026-08-28). */}
      <Dialog
        open={marketingAction !== null}
        onOpenChange={(o) => {
          if (!o && !marketingActionSaving) setMarketingAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {marketingAction === "resubscribe"
                ? "Resubscribe to marketing email?"
                : "Mark unsubscribed from marketing email?"}
            </DialogTitle>
            <DialogDescription>
              {marketingAction === "resubscribe"
                ? `Confirm this contact has permission to receive marketing email. This will be recorded as a manual staff action, not as the contact's own opt-in.`
                : `${contactName} will no longer receive Broadcast or Workflow marketing email. Their booking confirmations and other transactional email are unaffected.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarketingAction(null)} disabled={marketingActionSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => marketingAction && handleMarketingAction(marketingAction)}
              disabled={marketingActionSaving}
            >
              {marketingActionSaving
                ? "Saving…"
                : marketingAction === "resubscribe"
                  ? "Confirm & resubscribe"
                  : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 min-w-0 break-words">{children}</dd>
      </div>
    </div>
  );
}
