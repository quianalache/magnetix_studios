"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createUsePuck } from "@puckeditor/core";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/system/option-select";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { subscribeToPages } from "@/lib/firestore/pages-funnels";
import {
  isSafeActionUrl,
  isValidEmailAddress,
  normalizePhoneNumber,
  normalizeStoredAction,
} from "@/lib/pages-funnels/puck/action";
import type { PageAction } from "@/types/pages-funnels-puck";

const useTypedPuck = createUsePuck();

type LiveType = "none" | "url" | "page" | "purchase" | "scroll" | "call" | "email" | "sms";

const ACTION_OPTIONS: { value: LiveType; label: string }[] = [
  { value: "none", label: "No action" },
  { value: "url", label: "Go to URL" },
  { value: "page", label: "Go to page" },
  { value: "purchase", label: "Go to Offer (checkout)" },
  { value: "scroll", label: "Scroll to section" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "Text message (SMS)" },
];

function blank(type: LiveType): PageAction {
  switch (type) {
    case "url": return { type: "url", url: "", openInNewTab: false };
    case "page": return { type: "page", pageId: "", openInNewTab: false };
    case "purchase": return { type: "purchase", offerId: "" };
    case "scroll": return { type: "scroll", targetElementId: "" };
    case "call": return { type: "call", phoneNumber: "" };
    case "sms": return { type: "sms", phoneNumber: "" };
    case "email": return { type: "email", emailAddress: "" };
    default: return { type: "none" };
  }
}

/**
 * Button / Image "Action" (2026-10-26) — pick what the click does, then fill
 * in only that action's fields. Objects Magnetix already owns (pages,
 * Offers, sections on this page) are chosen from lists and stored by id;
 * their public links are resolved when the page renders, so a renamed Offer
 * or a new custom domain never leaves a stale URL behind.
 */
export function ActionFieldEditor({ value, onChange }: { value: unknown; onChange: (value: PageAction) => void }) {
  const action = normalizeStoredAction(value);
  const type = (ACTION_OPTIONS.some((o) => o.value === action.type) ? action.type : "none") as LiveType;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Action</Label>
        <OptionSelect
          aria-label="Action"
          value={type}
          onChange={(next) => onChange(blank((next ?? "none") as LiveType))}
          options={ACTION_OPTIONS}
          className="w-full"
        />
      </div>
      {action.type === "url" && <UrlFields action={action} onChange={onChange} />}
      {action.type === "page" && <PageFields action={action} onChange={onChange} />}
      {action.type === "purchase" && <OfferFields action={action} onChange={onChange} />}
      {action.type === "scroll" && <SectionFields action={action} onChange={onChange} />}
      {(action.type === "call" || action.type === "sms") && <PhoneFields action={action} onChange={onChange} />}
      {action.type === "email" && <EmailFields action={action} onChange={onChange} />}
    </div>
  );
}

function Hint({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warning" }) {
  return tone === "warning" ? (
    <p className="text-status-warning-fg flex items-start gap-1.5 text-xs">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  ) : (
    <p className="text-muted-foreground text-xs leading-snug">{children}</p>
  );
}

function NewTab({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="text-foreground flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5" />
      Open in a new tab
    </label>
  );
}

function UrlFields({ action, onChange }: { action: Extract<PageAction, { type: "url" }>; onChange: (a: PageAction) => void }) {
  const unsafe = action.url.trim() !== "" && !isSafeActionUrl(action.url.trim());
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="action-url" className="text-xs font-semibold">URL</Label>
        <Input id="action-url" value={action.url} placeholder="https://…" onChange={(e) => onChange({ ...action, url: e.target.value })} className="h-8 text-caption" />
        {unsafe && <Hint tone="warning">This link type isn&apos;t allowed. Use a web address starting with https://.</Hint>}
      </div>
      <NewTab checked={!!action.openInNewTab} onChange={(v) => onChange({ ...action, openInNewTab: v })} />
    </>
  );
}

function PageFields({ action, onChange }: { action: Extract<PageAction, { type: "page" }>; onChange: (a: PageAction) => void }) {
  const sub = useOptionalSubAccount();
  const params = useParams<{ pageId?: string }>();
  const [pages, setPages] = useState<{ id: string; name: string; published: boolean }[] | null>(null);
  useEffect(() => {
    if (!sub?.subAccountId || !sub.agencyId) return;
    return subscribeToPages({ subAccountId: sub.subAccountId, agencyId: sub.agencyId }, (list) =>
      setPages(list.filter((p) => p.id !== params?.pageId).map((p) => ({ id: p.id, name: p.name || "Untitled page", published: p.status === "published" }))),
    () => setPages([]));
  }, [sub?.subAccountId, sub?.agencyId, params?.pageId]);
  const selected = pages?.find((p) => p.id === action.pageId);
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Page</Label>
        {pages === null ? (
          <Loading what="pages" />
        ) : pages.length === 0 ? (
          <Hint>No other pages yet. Create one in Pages &amp; Funnels.</Hint>
        ) : (
          <OptionSelect
            aria-label="Page"
            value={action.pageId || null}
            onChange={(pageId) => onChange({ ...action, pageId: pageId ?? "" })}
            options={pages.map((p) => ({ value: p.id, label: p.published ? p.name : `${p.name} (Draft)` }))}
            placeholder="Choose a page…"
            className="w-full"
          />
        )}
        {pages && action.pageId && !selected && <Hint tone="warning">That page no longer exists. Choose another.</Hint>}
        {selected && !selected.published && <Hint tone="warning">Visitors only get this link once that page is published.</Hint>}
      </div>
      <NewTab checked={!!action.openInNewTab} onChange={(v) => onChange({ ...action, openInNewTab: v })} />
    </>
  );
}

function OfferFields({ action, onChange }: { action: Extract<PageAction, { type: "purchase" }>; onChange: (a: PageAction) => void }) {
  const sub = useOptionalSubAccount();
  const [offers, setOffers] = useState<{ id: string; title: string; published: boolean }[] | null>(null);
  useEffect(() => {
    if (!sub?.subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${sub.subAccountId}/energetic-decoder/featured-offers`)
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((d) => !cancelled && setOffers(d.offers ?? []))
      .catch(() => !cancelled && setOffers([]));
    return () => {
      cancelled = true;
    };
  }, [sub?.subAccountId]);
  const selected = offers?.find((o) => o.id === action.offerId);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Offer</Label>
      {offers === null ? (
        <Loading what="Offers" />
      ) : offers.length === 0 ? (
        <Hint>No Offers yet. Create one in Offers first.</Hint>
      ) : (
        <OptionSelect
          aria-label="Offer"
          value={action.offerId || null}
          onChange={(offerId) => onChange({ ...action, offerId: offerId ?? "" })}
          options={offers.map((o) => ({ value: o.id, label: o.published ? o.title : `${o.title} (Draft)` }))}
          placeholder="Choose an Offer…"
          className="w-full"
        />
      )}
      {offers && action.offerId && !selected && <Hint tone="warning">That Offer no longer exists. Choose another.</Hint>}
      {selected && !selected.published && <Hint tone="warning">Visitors only get this link once the Offer is published.</Hint>}
      <Hint>Opens the Offer&apos;s own checkout page — price and terms always come from the Offer.</Hint>
    </div>
  );
}

function SectionFields({ action, onChange }: { action: Extract<PageAction, { type: "scroll" }>; onChange: (a: PageAction) => void }) {
  const data = useTypedPuck((s) => s.appState.data);
  const sections = useMemo(() => listSections(data?.content ?? []), [data]);
  const missing = action.targetElementId && !sections.some((s) => s.id === action.targetElementId);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Section</Label>
      {sections.length === 0 ? (
        <Hint>Add a Section to this page first.</Hint>
      ) : (
        <OptionSelect
          aria-label="Section"
          value={action.targetElementId || null}
          onChange={(id) => onChange({ type: "scroll", targetElementId: id ?? "" })}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
          placeholder="Choose a section…"
          className="w-full"
        />
      )}
      {missing && <Hint tone="warning">That section was removed. Choose another.</Hint>}
    </div>
  );
}

function PhoneFields({ action, onChange }: { action: Extract<PageAction, { type: "call" | "sms" }>; onChange: (a: PageAction) => void }) {
  const invalid = action.phoneNumber.trim() !== "" && !normalizePhoneNumber(action.phoneNumber);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="action-phone" className="text-xs font-semibold">Phone number</Label>
      <Input id="action-phone" type="tel" value={action.phoneNumber} placeholder="+1 555 123 4567" onChange={(e) => onChange({ ...action, phoneNumber: e.target.value })} className="h-8 text-caption" />
      {invalid ? <Hint tone="warning">Enter a phone number with 6–15 digits, ideally with the country code (+1…).</Hint> : <Hint>{action.type === "sms" ? "Opens the visitor's messages app on phones." : "Starts a call on phones."}</Hint>}
    </div>
  );
}

function EmailFields({ action, onChange }: { action: Extract<PageAction, { type: "email" }>; onChange: (a: PageAction) => void }) {
  const invalid = action.emailAddress.trim() !== "" && !isValidEmailAddress(action.emailAddress);
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="action-email" className="text-xs font-semibold">Email address</Label>
        <Input id="action-email" type="email" value={action.emailAddress} placeholder="hello@yourbusiness.com" onChange={(e) => onChange({ ...action, emailAddress: e.target.value })} className="h-8 text-caption" />
        {invalid && <Hint tone="warning">Enter a valid email address.</Hint>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="action-subject" className="text-xs font-semibold">Subject (optional)</Label>
        <Input id="action-subject" value={action.subject ?? ""} onChange={(e) => onChange({ ...action, subject: e.target.value })} className="h-8 text-caption" />
      </div>
    </>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
      <Loader2 className="size-3.5 animate-spin" /> Loading {what}…
    </div>
  );
}

/** Top-level Sections/Heros with a readable label: "Section 2 · <first heading>". The stored value is the stable Puck id. */
function listSections(content: unknown[]): { id: string; label: string }[] {
  const firstHeading = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = firstHeading(child);
        if (found) return found;
      }
      return null;
    }
    const n = node as { type?: string; props?: Record<string, unknown> };
    if (n.type === "Heading" && typeof n.props?.text === "string" && n.props.text.trim()) return n.props.text.trim();
    for (const v of Object.values(n.props ?? {})) {
      if (Array.isArray(v)) {
        const found = firstHeading(v);
        if (found) return found;
      }
    }
    return null;
  };
  const out: { id: string; label: string }[] = [];
  content.forEach((node) => {
    const n = node as { type?: string; props?: { id?: string } };
    if ((n.type === "Section" || n.type === "Hero") && n.props?.id) {
      const heading = firstHeading(node);
      const index = out.length + 1;
      out.push({ id: n.props.id, label: heading ? `Section ${index} · ${heading.length > 40 ? `${heading.slice(0, 40)}…` : heading}` : `Section ${index}` });
    }
  });
  return out;
}
