"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubAccount } from "@/context/sub-account-context";
import {
  AFFILIATE_CATEGORIES,
  AFFILIATE_COMMISSION_TYPES,
  AFFILIATE_PAYOUT_STRUCTURES,
} from "@/types/assets";
import type { AffiliateLink, AffiliateLinkStatus } from "@/types/assets";
import { cn } from "@/lib/utils";

type LinkSubTab = "basic" | "links" | "commission" | "usage";
const TABS: { id: LinkSubTab; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "links", label: "Links" },
  { id: "commission", label: "Commission" },
  { id: "usage", label: "Usage" },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface AffiliateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link?: AffiliateLink | null;
}

export function AffiliateLinkDialog({ open, onOpenChange, link }: AffiliateLinkDialogProps) {
  const { subAccountId } = useSubAccount();
  const isEdit = !!link;
  const [tab, setTab] = useState<LinkSubTab>("basic");

  const [programName, setProgramName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(AFFILIATE_CATEGORIES[0]);
  const [status, setStatus] = useState<AffiliateLinkStatus>("active");

  const [affiliateLink, setAffiliateLink] = useState("");
  const [publicLandingLink, setPublicLandingLink] = useState("");
  const [loginDashboardLink, setLoginDashboardLink] = useState("");
  const [notes, setNotes] = useState("");

  const [commissionType, setCommissionType] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [payoutStructure, setPayoutStructure] = useState("");
  const [payoutPlatform, setPayoutPlatform] = useState("");
  const [payoutThreshold, setPayoutThreshold] = useState("");
  const [payoutFrequency, setPayoutFrequency] = useState("");
  const [cookieWindow, setCookieWindow] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [wherePromoted, setWherePromoted] = useState("");
  const [bestFitAudience, setBestFitAudience] = useState("");
  const [promoNotes, setPromoNotes] = useState("");
  const [contentIdeas, setContentIdeas] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    if (link) {
      setProgramName(link.programName);
      setCompanyName(link.companyName);
      setDescription(link.description);
      setCategory(link.category || AFFILIATE_CATEGORIES[0]);
      setStatus(link.status);
      setAffiliateLink(link.affiliateLink);
      setPublicLandingLink(link.publicLandingLink);
      setLoginDashboardLink(link.loginDashboardLink);
      setNotes(link.notes);
      setCommissionType(link.commissionType);
      setCommissionAmount(link.commissionAmount != null ? String(link.commissionAmount) : "");
      setPayoutStructure(link.payoutStructure);
      setPayoutPlatform(link.payoutPlatform);
      setPayoutThreshold(link.payoutThreshold != null ? String(link.payoutThreshold) : "");
      setPayoutFrequency(link.payoutFrequency);
      setCookieWindow(link.cookieWindow);
      setPaymentNotes(link.paymentNotes);
      setWherePromoted(link.wherePromoted);
      setBestFitAudience(link.bestFitAudience);
      setPromoNotes(link.promoNotes);
      setContentIdeas(link.contentIdeas);
    } else {
      setProgramName(""); setCompanyName(""); setDescription(""); setCategory(AFFILIATE_CATEGORIES[0]); setStatus("active");
      setAffiliateLink(""); setPublicLandingLink(""); setLoginDashboardLink(""); setNotes("");
      setCommissionType(""); setCommissionAmount(""); setPayoutStructure(""); setPayoutPlatform("");
      setPayoutThreshold(""); setPayoutFrequency(""); setCookieWindow(""); setPaymentNotes("");
      setWherePromoted(""); setBestFitAudience(""); setPromoNotes(""); setContentIdeas("");
    }
  }, [open, link]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!programName.trim() || !affiliateLink.trim()) {
      setTab(!programName.trim() ? "basic" : "links");
      return;
    }
    const payload = {
      programName: programName.trim(),
      companyName: companyName.trim(),
      description: description.trim(),
      category,
      status,
      affiliateLink: affiliateLink.trim(),
      publicLandingLink: publicLandingLink.trim(),
      loginDashboardLink: loginDashboardLink.trim(),
      notes: notes.trim(),
      commissionType,
      commissionAmount: commissionAmount ? Number(commissionAmount) : null,
      payoutStructure,
      payoutPlatform: payoutPlatform.trim(),
      payoutThreshold: payoutThreshold ? Number(payoutThreshold) : null,
      payoutFrequency: payoutFrequency.trim(),
      cookieWindow: cookieWindow.trim(),
      paymentNotes: paymentNotes.trim(),
      wherePromoted: wherePromoted.trim(),
      bestFitAudience: bestFitAudience.trim(),
      promoNotes: promoNotes.trim(),
      contentIdeas: contentIdeas.trim(),
    };
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/sub-accounts/${subAccountId}/affiliate-links/${link!.id}`
        : `/api/sub-accounts/${subAccountId}/affiliate-links`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Affiliate link updated" : "Affiliate link added");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save this affiliate link. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!link) return;
    if (!confirm(`Delete affiliate link "${link.programName}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/affiliate-links/${link.id}`, { method: "DELETE" });
      toast.success("Affiliate link deleted");
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Affiliate Link" : "New Affiliate Link"}</SheetTitle>
          <SheetDescription>Tools and products you promote and earn commission on — separate from your own students/affiliates.</SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 rounded-lg bg-muted/30 p-1 mx-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all",
                tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form className="space-y-4 p-4 pt-3" onSubmit={handleSubmit}>
          {tab === "basic" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aff-name">Program / Product Name <span className="text-destructive">*</span></Label>
                <Input id="aff-name" value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g. ConvertKit, Kajabi Affiliate" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aff-company">Company / Brand Name</Label>
                <Input id="aff-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. ConvertKit Inc." />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aff-desc">Description</Label>
                <Textarea id="aff-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this product / program?" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-category">Category</Label>
                <select id="aff-category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                  {AFFILIATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-status">Status</Label>
                <select id="aff-status" value={status} onChange={(e) => setStatus(e.target.value as AffiliateLinkStatus)} className={selectClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}

          {tab === "links" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="aff-link">Affiliate Link <span className="text-destructive">*</span></Label>
                <Input id="aff-link" value={affiliateLink} onChange={(e) => setAffiliateLink(e.target.value)} placeholder="https://yourlink.com/ref=..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-public">Public Landing Page Link</Label>
                <Input id="aff-public" value={publicLandingLink} onChange={(e) => setPublicLandingLink(e.target.value)} placeholder="https://product-landing-page.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-dash">Login / Admin Dashboard Link</Label>
                <Input id="aff-dash" value={loginDashboardLink} onChange={(e) => setLoginDashboardLink(e.target.value)} placeholder="https://dashboard.program.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-notes">Notes</Label>
                <Textarea id="aff-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this affiliate program..." rows={3} />
              </div>
            </div>
          )}

          {tab === "commission" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aff-ctype">Commission Type</Label>
                <select id="aff-ctype" value={commissionType} onChange={(e) => setCommissionType(e.target.value)} className={selectClass}>
                  <option value="">Select type</option>
                  {AFFILIATE_COMMISSION_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-amount">Amount ($)</Label>
                <Input id="aff-amount" type="number" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} placeholder="50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-structure">Payout Structure</Label>
                <select id="aff-structure" value={payoutStructure} onChange={(e) => setPayoutStructure(e.target.value)} className={selectClass}>
                  <option value="">Select structure</option>
                  {AFFILIATE_PAYOUT_STRUCTURES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-platform">Payout Platform</Label>
                <Input id="aff-platform" value={payoutPlatform} onChange={(e) => setPayoutPlatform(e.target.value)} placeholder="e.g. PayPal, Stripe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-threshold">Payout Threshold ($)</Label>
                <Input id="aff-threshold" type="number" value={payoutThreshold} onChange={(e) => setPayoutThreshold(e.target.value)} placeholder="e.g. 50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-freq">Payout Frequency</Label>
                <Input id="aff-freq" value={payoutFrequency} onChange={(e) => setPayoutFrequency(e.target.value)} placeholder="e.g. Monthly, Net-30" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-cookie">Cookie Window</Label>
                <Input id="aff-cookie" value={cookieWindow} onChange={(e) => setCookieWindow(e.target.value)} placeholder="e.g. 30 days" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aff-paynotes">Payment Notes</Label>
                <Textarea id="aff-paynotes" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Any notes about payments..." rows={2} />
              </div>
            </div>
          )}

          {tab === "usage" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="aff-where">Where I Promote This</Label>
                <Textarea id="aff-where" value={wherePromoted} onChange={(e) => setWherePromoted(e.target.value)} placeholder="e.g. YouTube descriptions, email list, blog posts..." rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-audience">Best-Fit Audience</Label>
                <Input id="aff-audience" value={bestFitAudience} onChange={(e) => setBestFitAudience(e.target.value)} placeholder="Who is this best for?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-promo">Promo Notes</Label>
                <Textarea id="aff-promo" value={promoNotes} onChange={(e) => setPromoNotes(e.target.value)} placeholder="Talking points, angles, specific promotions..." rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-ideas">Content Ideas</Label>
                <Textarea id="aff-ideas" value={contentIdeas} onChange={(e) => setContentIdeas(e.target.value)} placeholder="Content ideas that naturally feature this affiliate..." rows={2} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            {isEdit ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving || deleting}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Affiliate Link"}</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
