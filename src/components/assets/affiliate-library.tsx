"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  BarChart3,
  CircleCheck,
  Coins,
  Copy,
  ExternalLink,
  FileText,
  LayoutGrid,
  Link2,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Repeat,
  Search,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { assetsCall, copyText } from "@/lib/client/assets-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AFFILIATE_LIBRARY_CATEGORIES,
  affiliateCategoryOf,
  affiliatePayoutSummary,
  affiliateRecurrenceOf,
  type AffiliateLink,
} from "@/types/assets";
import { EmptyPanel, FilterSelect, formatDay, Pager, StatTile, StatusPill, TagPill } from "./assets-ui";

const PAGE_SIZE = 10;

export interface AffiliateRow extends Omit<AffiliateLink, "createdAt" | "updatedAt"> {
  createdAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

type SheetTab = "basic" | "links" | "commission" | "usage";

interface Draft {
  programName: string;
  companyName: string;
  category: string;
  status: "active" | "inactive" | "archived";
  affiliateLink: string;
  publicLandingLink: string;
  loginDashboardLink: string;
  promoNotes: string;
  notes: string;
  description: string;
  commissionRecurrence: "" | "recurring" | "one_time";
  commissionAmount: string;
  commissionUnit: "percent" | "flat";
  cookieWindow: string;
  payoutThreshold: string;
  payoutPlatform: string;
  payoutFrequency: string;
  paymentNotes: string;
  wherePromoted: string;
  contentIdeas: string;
}

function blank(): Draft {
  return {
    programName: "", companyName: "", category: "", status: "active", affiliateLink: "", publicLandingLink: "",
    loginDashboardLink: "", promoNotes: "", notes: "", description: "", commissionRecurrence: "", commissionAmount: "",
    commissionUnit: "percent", cookieWindow: "", payoutThreshold: "", payoutPlatform: "", payoutFrequency: "",
    paymentNotes: "", wherePromoted: "", contentIdeas: "",
  };
}

function fromRow(r: AffiliateRow): Draft {
  return {
    programName: r.programName, companyName: r.companyName ?? "", category: affiliateCategoryOf(r) === "Other" && !r.category ? "" : affiliateCategoryOf(r),
    status: r.status, affiliateLink: r.affiliateLink ?? "", publicLandingLink: r.publicLandingLink ?? "", loginDashboardLink: r.loginDashboardLink ?? "",
    promoNotes: r.promoNotes ?? "", notes: r.notes ?? "", description: r.description ?? "", commissionRecurrence: affiliateRecurrenceOf(r) ?? "",
    commissionAmount: r.commissionAmount != null ? String(r.commissionAmount) : "",
    commissionUnit: r.commissionUnit ?? (r.commissionType === "Flat Fee" ? "flat" : "percent"), cookieWindow: r.cookieWindow ?? "",
    payoutThreshold: r.payoutThreshold != null ? String(r.payoutThreshold) : "", payoutPlatform: r.payoutPlatform ?? "",
    payoutFrequency: r.payoutFrequency ?? "", paymentNotes: r.paymentNotes ?? "", wherePromoted: r.wherePromoted ?? "", contentIdeas: r.contentIdeas ?? "",
  };
}

const inputCls = "h-11";
const selectCls = "border-input bg-background focus-visible:ring-ring/40 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";

function ProgramMark({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tones = ["from-violet-500 to-fuchsia-500", "from-sky-500 to-indigo-500", "from-rose-500 to-orange-400", "from-emerald-500 to-teal-500", "from-amber-500 to-pink-500"];
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white", tones[h % tones.length])} aria-hidden>
      {letter}
    </span>
  );
}

function AffiliateSheet({
  subAccountId,
  open,
  onOpenChange,
  program,
  onSaved,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: AffiliateRow | null;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<SheetTab>("basic");
  const [d, setD] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setD(program ? fromRow(program) : blank());
    setTab("basic");
  }, [open, program]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const missing = !d.programName.trim()
    ? { tab: "basic" as const, msg: "Add the program name." }
    : !d.companyName.trim()
      ? { tab: "basic" as const, msg: "Add the brand." }
      : !d.category
        ? { tab: "basic" as const, msg: "Choose a category." }
        : !/^https?:\/\/\S+\.\S+/.test(d.affiliateLink.trim())
          ? { tab: "basic" as const, msg: "Add your affiliate link (starting with https://)." }
          : null;

  async function save() {
    if (missing) {
      setTab(missing.tab);
      toast.error(missing.msg);
      return;
    }
    setSaving(true);
    const amount = d.commissionAmount.trim() === "" ? null : Number(d.commissionAmount);
    const threshold = d.payoutThreshold.trim() === "" ? null : Number(d.payoutThreshold);
    const body = {
      programName: d.programName.trim(),
      companyName: d.companyName.trim(),
      category: d.category,
      status: d.status,
      affiliateLink: d.affiliateLink.trim(),
      publicLandingLink: d.publicLandingLink.trim(),
      loginDashboardLink: d.loginDashboardLink.trim(),
      promoNotes: d.promoNotes,
      notes: d.notes,
      description: d.description,
      commissionRecurrence: d.commissionRecurrence || null,
      commissionAmount: amount !== null && Number.isFinite(amount) ? amount : null,
      commissionUnit: d.commissionUnit,
      cookieWindow: d.cookieWindow.trim(),
      payoutThreshold: threshold !== null && Number.isFinite(threshold) ? threshold : null,
      payoutPlatform: d.payoutPlatform.trim(),
      payoutFrequency: d.payoutFrequency.trim(),
      paymentNotes: d.paymentNotes,
      wherePromoted: d.wherePromoted,
      contentIdeas: d.contentIdeas,
    };
    try {
      if (program) await assetsCall(`/api/sub-accounts/${subAccountId}/affiliate-links/${program.id}`, { method: "PATCH", json: body });
      else await assetsCall(`/api/sub-accounts/${subAccountId}/affiliate-links`, { method: "POST", json: body });
      toast.success(program ? "Affiliate program updated" : "Affiliate program created");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: SheetTab; label: string; icon: typeof FileText }[] = [
    { id: "basic", label: "Basic", icon: FileText },
    { id: "links", label: "Links", icon: Link2 },
    { id: "commission", label: "Commission", icon: Coins },
    { id: "usage", label: "Usage", icon: BarChart3 },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <header className="flex items-start gap-3 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-2xl font-bold">{program ? "Edit Affiliate Program" : "New Affiliate Program"}</SheetTitle>
            <SheetDescription className="mt-0.5">Add an external affiliate program you promote.</SheetDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div role="tablist" aria-label="Program sections" className="bg-muted/50 mx-5 grid grid-cols-4 gap-1 rounded-xl p-1 sm:mx-6">
          {tabs.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium", tab === t.id ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="hidden h-4 w-4 sm:block" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {tab === "basic" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="aff-name">Program Name <span className="text-destructive">*</span></Label>
                <Input id="aff-name" className={inputCls} value={d.programName} maxLength={200} placeholder="e.g. ConvertKit" onChange={(e) => set("programName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-brand">Brand <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Store className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input id="aff-brand" className={cn(inputCls, "pl-9")} value={d.companyName} maxLength={200} placeholder="e.g. ConvertKit" onChange={(e) => set("companyName", e.target.value)} />
                </div>
                <p className="text-muted-foreground text-xs">Enter the company or brand name.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="aff-category">Category <span className="text-destructive">*</span></Label>
                  <select id="aff-category" className={selectCls} value={d.category} onChange={(e) => set("category", e.target.value)}>
                    <option value="">Select a category</option>
                    {[...AFFILIATE_LIBRARY_CATEGORIES, ...(d.category && !(AFFILIATE_LIBRARY_CATEGORIES as readonly string[]).includes(d.category) ? [d.category] : [])].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aff-status">Status</Label>
                  <select id="aff-status" className={selectCls} value={d.status} onChange={(e) => set("status", e.target.value as Draft["status"])}>
                    <option value="active">Active</option>
                    <option value="inactive">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aff-link">Affiliate Link <span className="text-destructive">*</span></Label>
                  <Input id="aff-link" type="url" inputMode="url" className={inputCls} value={d.affiliateLink} placeholder="https://…" onChange={(e) => set("affiliateLink", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aff-landing">Landing Page Link</Label>
                  <Input id="aff-landing" type="url" inputMode="url" className={inputCls} value={d.publicLandingLink} placeholder="https://…" onChange={(e) => set("publicLandingLink", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-promo">Promo Notes</Label>
                <Textarea id="aff-promo" rows={4} maxLength={5000} value={d.promoNotes} placeholder="Notes on how you use this, key benefits, or promo ideas…" onChange={(e) => set("promoNotes", e.target.value)} />
                <p className="text-muted-foreground text-xs">Internal notes to help you remember how to promote this.</p>
              </div>
            </>
          )}

          {tab === "links" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="aff-dashboard">Affiliate dashboard / login</Label>
                <Input id="aff-dashboard" type="url" inputMode="url" className={inputCls} value={d.loginDashboardLink} placeholder="https://…" onChange={(e) => set("loginDashboardLink", e.target.value)} />
                <p className="text-muted-foreground text-xs">Where you check your stats and payouts.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-notes">Link notes</Label>
                <Textarea id="aff-notes" rows={4} maxLength={5000} value={d.notes} placeholder="Coupon codes, deep links, UTM conventions…" onChange={(e) => set("notes", e.target.value)} />
              </div>
            </>
          )}

          {tab === "commission" && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Commission type</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["recurring", "Recurring"],
                      ["one_time", "One-time"],
                    ] as const
                  ).map(([v, l]) => (
                    <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm", d.commissionRecurrence === v ? "border-primary/60 bg-primary/5" : "hover:bg-muted/50")}>
                      <input type="radio" name="aff-recurrence" className="accent-primary h-4 w-4" checked={d.commissionRecurrence === v} onChange={() => set("commissionRecurrence", v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aff-amount">Commission</Label>
                  <div className="flex gap-2">
                    <Input id="aff-amount" inputMode="decimal" className={inputCls} value={d.commissionAmount} placeholder="30" onChange={(e) => set("commissionAmount", e.target.value.replace(/[^0-9.]/g, ""))} />
                    <select aria-label="Commission unit" className={cn(selectCls, "w-24")} value={d.commissionUnit} onChange={(e) => set("commissionUnit", e.target.value as Draft["commissionUnit"])}>
                      <option value="percent">%</option>
                      <option value="flat">$ flat</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aff-cookie">Cookie window</Label>
                  <Input id="aff-cookie" className={inputCls} value={d.cookieWindow} maxLength={80} placeholder="e.g. 30 days" onChange={(e) => set("cookieWindow", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aff-threshold">Payment threshold ($)</Label>
                  <Input id="aff-threshold" inputMode="decimal" className={inputCls} value={d.payoutThreshold} placeholder="e.g. 50" onChange={(e) => set("payoutThreshold", e.target.value.replace(/[^0-9.]/g, ""))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aff-frequency">Payout frequency</Label>
                  <Input id="aff-frequency" className={inputCls} value={d.payoutFrequency} maxLength={80} placeholder="e.g. Monthly" onChange={(e) => set("payoutFrequency", e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="aff-platform">Paid through</Label>
                  <Input id="aff-platform" className={inputCls} value={d.payoutPlatform} maxLength={80} placeholder="e.g. PayPal, Impact, PartnerStack" onChange={(e) => set("payoutPlatform", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-payment-notes">Payment notes</Label>
                <Textarea id="aff-payment-notes" rows={3} maxLength={5000} value={d.paymentNotes} onChange={(e) => set("paymentNotes", e.target.value)} />
              </div>
            </>
          )}

          {tab === "usage" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="aff-desc">About this program</Label>
                <Textarea id="aff-desc" rows={3} maxLength={5000} value={d.description} placeholder="What it is and why you recommend it" onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-where">Where you promote it</Label>
                <Textarea id="aff-where" rows={3} maxLength={2000} value={d.wherePromoted} placeholder="e.g. YouTube descriptions, resources page, onboarding emails" onChange={(e) => set("wherePromoted", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aff-ideas">Content ideas &amp; strategy</Label>
                <Textarea id="aff-ideas" rows={4} maxLength={5000} value={d.contentIdeas} placeholder="Tutorials, comparisons, launch tie-ins…" onChange={(e) => set("contentIdeas", e.target.value)} />
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t px-5 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {program ? "Save Program" : "Create Affiliate Program"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

/** Affiliate Library — EXTERNAL programs the owner promotes. Separate from Magnetix's own affiliate program. */
export function AffiliateLibrary({ createSignal }: { createSignal: number }) {
  const { subAccountId } = useSubAccount();
  const [rows, setRows] = useState<AffiliateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [commission, setCommission] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AffiliateRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<AffiliateRow | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await assetsCall<{ links: AffiliateRow[] }>(`/api/sub-accounts/${subAccountId}/affiliate-links`);
      setRows(r.links);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subAccountId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (createSignal > 0) {
      setEditing(null);
      setSheetOpen(true);
    }
  }, [createSignal]);
  useEffect(() => setPage(1), [q, category, status, commission, sort]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      active: list.filter((r) => r.status === "active").length,
      software: list.filter((r) => affiliateCategoryOf(r) === "Software").length,
      services: list.filter((r) => affiliateCategoryOf(r) === "Services").length,
      recurring: list.filter((r) => affiliateRecurrenceOf(r) === "recurring").length,
    };
  }, [rows]);

  const categories = useMemo(() => [...new Set([...AFFILIATE_LIBRARY_CATEGORIES, ...(rows ?? []).map(affiliateCategoryOf)])], [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (category !== "all" && affiliateCategoryOf(r) !== category) return false;
      if (status !== "all" && r.status !== status) return false;
      if (commission !== "all" && affiliateRecurrenceOf(r) !== commission) return false;
      return !s || [r.programName, r.companyName, r.category, r.promoNotes, r.description].some((x) => (x ?? "").toLowerCase().includes(s));
    });
    return list.sort((a, b) => (sort === "name" ? a.programName.localeCompare(b.programName) : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")));
  }, [rows, q, category, status, commission, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await assetsCall(`/api/sub-accounts/${subAccountId}/affiliate-links/${deleting.id}`, { method: "DELETE" });
      toast.success("Affiliate program deleted");
      setDeleting(null);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function statusPill(r: AffiliateRow) {
    return r.status === "active" ? <StatusPill tone="green">Active</StatusPill> : r.status === "inactive" ? <StatusPill tone="amber">Paused</StatusPill> : <StatusPill tone="gray">Archived</StatusPill>;
  }
  function recurrencePill(r: AffiliateRow) {
    const rec = affiliateRecurrenceOf(r);
    return rec ? <TagPill label={rec === "recurring" ? "Recurring" : "One-time"} /> : <span className="text-muted-foreground">—</span>;
  }

  function Menu({ r }: { r: AffiliateRow }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${r.programName} actions`} />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => window.open(r.affiliateLink, "_blank", "noopener,noreferrer")} disabled={!r.affiliateLink}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open affiliate link
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!r.affiliateLink}
            onClick={async () => {
              if (await copyText(r.affiliateLink)) toast.success("Affiliate link copied");
              else toast.error("Couldn't copy the link");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copy affiliate link
          </DropdownMenuItem>
          {r.loginDashboardLink && (
            <DropdownMenuItem onClick={() => window.open(r.loginDashboardLink, "_blank", "noopener,noreferrer")}>
              <BarChart3 className="mr-2 h-4 w-4" /> Open dashboard
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => { setEditing(r); setSheetOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon={Link2} tone="violet" value={rows ? stats.active : "–"} label="Active Programs" active={status === "active"} onClick={() => setStatus(status === "active" ? "all" : "active")} />
        <StatTile icon={LayoutGrid} tone="teal" value={rows ? stats.software : "–"} label="Software Tools" active={category === "Software"} onClick={() => setCategory(category === "Software" ? "all" : "Software")} />
        <StatTile icon={Monitor} tone="pink" value={rows ? stats.services : "–"} label="Services" active={category === "Services"} onClick={() => setCategory(category === "Services" ? "all" : "Services")} />
        <StatTile icon={Repeat} tone="amber" value={rows ? stats.recurring : "–"} label="Recurring Programs" active={commission === "recurring"} onClick={() => setCommission(commission === "recurring" ? "all" : "recurring")} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative block lg:w-80">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input id="aff-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search affiliate programs by name, brand, or keyword…" className="bg-card h-10 pl-9" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterSelect id="aff-f-category" icon={LayoutGrid} label="Category" value={category} onChange={setCategory} options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <FilterSelect id="aff-f-status" icon={CircleCheck} label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Paused" }, { value: "archived", label: "Archived" }]} />
          <FilterSelect id="aff-f-commission" icon={Tag} label="Commission type" value={commission} onChange={setCommission} options={[{ value: "all", label: "All Commission Types" }, { value: "recurring", label: "Recurring" }, { value: "one_time", label: "One-time" }]} />
          <FilterSelect id="aff-f-sort" icon={ArrowUpDown} label="Sort" value={sort} onChange={setSort} options={[{ value: "updated", label: "Sort: Last updated" }, { value: "name", label: "Sort: Name" }]} />
        </div>
      </div>

      <h2 className="text-xl font-bold">
        Affiliate Programs <span className="text-muted-foreground font-semibold">({filtered.length})</span>
      </h2>

      {error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load affiliate programs: {error}</p>
      ) : !rows ? (
        <div className="bg-muted/40 h-64 animate-pulse rounded-2xl border" aria-busy />
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={Link2}
          title={rows.length ? "No programs match" : "Track the programs you promote"}
          body={rows.length ? "Try another search or filter." : "Keep every external affiliate link, commission and cookie window in one place."}
          action={!rows.length && <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>New Affiliate Program</Button>}
        />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {shown.map((r) => (
              <li key={r.id} className="bg-card flex items-start gap-3 rounded-2xl border p-4">
                <ProgramMark name={r.programName} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.programName}</p>
                  <p className="text-muted-foreground text-sm">{r.companyName || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <TagPill label={affiliateCategoryOf(r)} />
                    {statusPill(r)}
                    {recurrencePill(r)}
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {affiliatePayoutSummary(r) ?? "No commission recorded"}
                    {r.cookieWindow ? ` · ${r.cookieWindow} cookie` : ""}
                  </p>
                </div>
                <Menu r={r} />
              </li>
            ))}
          </ul>
          <div className="bg-card hidden overflow-x-auto rounded-2xl border md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="px-4 py-3 font-semibold">Program</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Commission Type</th>
                  <th className="px-3 py-3 font-semibold">Payout Structure</th>
                  <th className="px-3 py-3 font-semibold">Cookie Window</th>
                  <th className="px-3 py-3 font-semibold">Last Updated</th>
                  <th className="w-12 px-3 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProgramMark name={r.programName} />
                        <button type="button" onClick={() => { setEditing(r); setSheetOpen(true); }} className="min-w-0 text-left">
                          <span className="block truncate font-semibold hover:underline">{r.programName}</span>
                          <span className="text-muted-foreground block truncate text-xs">{r.companyName || "—"}</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3"><TagPill label={affiliateCategoryOf(r)} /></td>
                    <td className="px-3 py-3">{statusPill(r)}</td>
                    <td className="px-3 py-3">{recurrencePill(r)}</td>
                    <td className="px-3 py-3">{affiliatePayoutSummary(r) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3">{r.cookieWindow || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="block">{formatDay(r.updatedAt)}</span>
                      {r.updatedByName && <span className="text-muted-foreground block text-xs">by {r.updatedByName}</span>}
                    </td>
                    <td className="px-3 py-3 text-right"><Menu r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} noun="affiliate programs" onPage={setPage} />
      <p className="text-muted-foreground text-xs">
        This library is for programs you promote. Commissions are tracked by each program — Magnetix doesn&apos;t estimate or pay them.
      </p>

      <AffiliateSheet subAccountId={subAccountId} open={sheetOpen} onOpenChange={setSheetOpen} program={editing} onSaved={() => void load()} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.programName}”?</DialogTitle>
            <DialogDescription>This removes the program and its notes from your library. Your account with the program isn&apos;t affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
