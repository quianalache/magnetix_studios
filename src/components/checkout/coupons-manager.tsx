"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, MoreHorizontal, Pencil, Plus, Receipt, Tag as TagIcon, TicketPercent, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MultiSelect } from "@/components/ui/multi-select";
import { MetricCard } from "@/components/system/metric-card";
import { SearchField } from "@/components/system/search-field";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { Pagination } from "@/components/system/pagination";
import { OptionSelect } from "@/components/system/option-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useConfirm } from "@/components/system/confirm-dialog";
import { commerceFetch } from "@/lib/client/commerce-api";
import { couponSummary } from "@/lib/checkout/coupons";
import { formatMoney } from "@/lib/checkout/pricing";
import type { Coupon, CouponDisplayStatus } from "@/types/checkout";

/**
 * Coupons — native Magnetix discount codes (Checkout Foundation Phase 1).
 * Lives beside Products and Offers. Every number on this screen comes from
 * paid orders; nothing is estimated.
 */

type Row = Coupon & { displayStatus: CouponDisplayStatus };
type Stats = { activeCount: number; redemptionsThisMonth: number; discountThisMonthCents: Record<string, number>; revenueThisMonthCents: Record<string, number>; expiringSoonCount: number };
type OfferOpt = { id: string; title: string; priceLabel: string; systemManaged: boolean; type: string; recurringInterval: string | null };

const STATUS_LABEL: Record<CouponDisplayStatus, string> = { active: "Active", scheduled: "Scheduled", expired: "Expired", used_up: "Used up", inactive: "Inactive", archived: "Archived" };
const STATUS_TONE: Record<CouponDisplayStatus, "success" | "scheduled" | "neutral" | "warning"> = { active: "success", scheduled: "scheduled", expired: "neutral", used_up: "warning", inactive: "neutral", archived: "neutral" };
const PAGE = 10;

const moneyList = (m: Record<string, number>) => {
  const parts = Object.entries(m).map(([cur, cents]) => formatMoney(cents, cur));
  return parts.length ? parts.join(" + ") : formatMoney(0, "USD");
};
const toDateInput = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
const fromDateInput = (v: string, endOfDay: boolean) => (v ? new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime() : null);

interface FormState {
  code: string;
  name: string;
  active: boolean;
  discountType: "percent" | "fixed";
  amount: string;
  currency: string;
  appliesKind: "all" | "offers";
  offerIds: string[];
  includeOrderBumps: boolean;
  duration: "once" | "forever" | "repeating";
  months: string;
  maxRedemptions: string;
  maxPerCustomer: string;
  minimum: string;
  startsAt: string;
  expiresAt: string;
}

const EMPTY: FormState = { code: "", name: "", active: true, discountType: "percent", amount: "", currency: "USD", appliesKind: "all", offerIds: [], includeOrderBumps: true, duration: "once", months: "3", maxRedemptions: "", maxPerCustomer: "", minimum: "", startsAt: "", expiresAt: "" };

function formFrom(c: Coupon): FormState {
  return {
    code: c.code,
    name: c.name,
    active: c.status === "active",
    discountType: c.discountType,
    amount: c.discountType === "percent" ? String(c.percentOff ?? "") : ((c.amountOffCents ?? 0) / 100).toFixed(2),
    currency: c.currency ?? "USD",
    appliesKind: c.appliesTo.kind,
    offerIds: c.appliesTo.kind === "offers" ? c.appliesTo.offerIds : [],
    includeOrderBumps: c.includeOrderBumps,
    duration: c.recurringDuration.kind,
    months: c.recurringDuration.kind === "repeating" ? String(c.recurringDuration.months) : "3",
    maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : "",
    maxPerCustomer: c.maxPerCustomer ? String(c.maxPerCustomer) : "",
    minimum: c.minimumSubtotalCents ? (c.minimumSubtotalCents / 100).toFixed(2) : "",
    startsAt: toDateInput(c.startsAt),
    expiresAt: toDateInput(c.expiresAt),
  };
}

function bodyFrom(f: FormState) {
  const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
  return {
    code: f.code,
    name: f.name,
    status: f.active ? "active" : "inactive",
    discountType: f.discountType,
    percentOff: f.discountType === "percent" ? (f.amount === "" ? null : Number(f.amount)) : null,
    amountOffCents: f.discountType === "fixed" ? cents(f.amount) : null,
    currency: f.discountType === "fixed" ? f.currency : null,
    appliesTo: f.appliesKind === "offers" ? { kind: "offers", offerIds: f.offerIds } : { kind: "all" },
    includeOrderBumps: f.includeOrderBumps,
    recurringDuration: f.duration === "repeating" ? { kind: "repeating", months: Number(f.months) } : { kind: f.duration },
    maxRedemptions: f.maxRedemptions === "" ? null : Number(f.maxRedemptions),
    maxPerCustomer: f.maxPerCustomer === "" ? null : Number(f.maxPerCustomer),
    minimumSubtotalCents: cents(f.minimum),
    startsAt: fromDateInput(f.startsAt, false),
    expiresAt: fromDateInput(f.expiresAt, true),
  };
}

export function CouponsManager({ subAccountId, isAdmin }: { subAccountId: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [offers, setOffers] = useState<OfferOpt[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CouponDisplayStatus>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => {
    commerceFetch<{ coupons: Row[]; stats: Stats }>(subAccountId, "coupons").then(
      (d) => {
        setRows(d.coupons);
        setStats(d.stats);
      },
      (e: Error) => toast.error(e.message),
    );
  }, [subAccountId]);
  useEffect(load, [load]);
  useEffect(() => {
    commerceFetch<{ offers: OfferOpt[] }>(subAccountId, "offer-options").then((d) => setOffers(d.offers.filter((o) => !o.systemManaged)), () => undefined);
  }, [subAccountId]);

  const offerTitle = useMemo(() => new Map(offers.map((o) => [o.id, o.title])), [offers]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => (status === "all" ? r.displayStatus !== "archived" : r.displayStatus === status) && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
  }, [rows, query, status]);
  useEffect(() => setPage(1), [query, status]);
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);

  function open(row: Row | "new") {
    setEditing(row);
    setForm(row === "new" ? EMPTY : formFrom(row));
    setErrors({});
  }
  const used = editing !== "new" && editing !== null && editing.redemptionCount > 0;
  // "First N payments" maps to Stripe's month-based coupons, so it's only
  // offered when the coupon can reach a monthly plan.
  const monthlyPossible =
    form.appliesKind === "all"
      ? offers.some((o) => o.type === "recurring" && o.recurringInterval === "month") || offers.length === 0
      : form.offerIds.some((id) => offers.find((o) => o.id === id && o.type === "recurring" && o.recurringInterval === "month"));

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      if (editing === "new") await commerceFetch(subAccountId, "coupons", { method: "POST", body: bodyFrom(form) });
      else if (editing) await commerceFetch(subAccountId, `coupons/${editing.id}`, { method: "PATCH", body: bodyFrom(form) });
      toast.success(editing === "new" ? "Coupon created." : "Coupon saved.");
      setEditing(null);
      load();
    } catch (err) {
      const e = err as Error & { fields?: Record<string, string> };
      setErrors(e.fields ?? {});
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    const willArchive = row.redemptionCount > 0;
    const ok = await confirm({
      title: willArchive ? `Archive ${row.code}?` : `Delete ${row.code}?`,
      description: willArchive ? "It has been used, so it's archived instead of deleted: history is kept and the code stops working." : "The code stops working immediately.",
      confirmLabel: willArchive ? "Archive" : "Delete",
      tone: "danger",
    });
    if (!ok) return;
    await commerceFetch(subAccountId, `coupons/${row.id}`, { method: "DELETE" }).then(() => {
      toast.success(willArchive ? "Coupon archived." : "Coupon deleted.");
      load();
    }, (e: Error) => toast.error(e.message));
  }
  async function toggleActive(row: Row) {
    await commerceFetch(subAccountId, `coupons/${row.id}`, { method: "PATCH", body: { status: row.status === "active" ? "inactive" : "active" } }).then(load, (e: Error) => toast.error(e.message));
  }

  const f = form;
  const setF = (patch: Partial<FormState>) => setForm((x) => ({ ...x, ...patch }));
  const err = (k: string) => errors[k] && <p className="text-destructive text-caption">{errors[k]}</p>;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {dialog}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={TicketPercent} tone="violet" label="Active coupons" value={stats?.activeCount ?? "—"} loading={!stats} />
        <MetricCard icon={Receipt} tone="aqua" label="Redemptions this month" value={stats?.redemptionsThisMonth ?? "—"} hint="Paid orders only" loading={!stats} />
        <MetricCard icon={TagIcon} tone="green" label="Coupon sales this month" value={stats ? moneyList(stats.revenueThisMonthCents) : "—"} hint={stats ? `${moneyList(stats.discountThisMonthCents)} discounted` : undefined} loading={!stats} />
        <MetricCard icon={CalendarClock} tone="gold" label="Expiring soon" value={stats?.expiringSoonCount ?? "—"} hint="Within 7 days" loading={!stats} />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <SearchField aria-label="Search coupons" value={query} onChange={setQuery} placeholder="Search by code or name" className="min-w-0 flex-1 sm:max-w-sm" />
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "scheduled", label: "Scheduled" },
            { value: "expired", label: "Expired" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
          ]}
        />
        {isAdmin && (
          <Button className="ms-auto" onClick={() => open("new")}>
            <Plus className="size-4" aria-hidden /> New coupon
          </Button>
        )}
      </div>

      {!rows ? (
        <Card className="text-muted-foreground flex items-center justify-center gap-2 p-10 text-body-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading coupons…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TicketPercent} title={rows.length ? "No coupons match" : "No coupons yet"} description="Create a code like SAVE20 and turn on discount codes in an Offer's or funnel's Checkout Settings." />
      ) : (
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-body-sm">
              <thead className="bg-muted/40 text-muted-foreground text-th">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Discount</th>
                  <th className="px-4 py-2.5 font-medium">Applies to</th>
                  <th className="px-4 py-2.5 font-medium">Order Bumps</th>
                  <th className="px-4 py-2.5 font-medium">Usage</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="relative px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.code}</p>
                      {r.name && <p className="text-muted-foreground text-caption">{r.name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.discountType === "percent" ? `${r.percentOff}%` : formatMoney(r.amountOffCents ?? 0, r.currency ?? "USD")}</p>
                      <p className="text-muted-foreground text-caption">{couponSummary(r).split(" · ")[1]}</p>
                    </td>
                    <td className="px-4 py-3">{r.appliesTo.kind === "all" ? "All checkouts" : r.appliesTo.offerIds.length === 1 ? offerTitle.get(r.appliesTo.offerIds[0]) ?? "1 Offer" : `${r.appliesTo.offerIds.length} Offers`}</td>
                    <td className="px-4 py-3">{r.includeOrderBumps ? "Included" : "Not included"}</td>
                    <td className="px-4 py-3 tabular-nums">{r.redemptionCount}{r.maxRedemptions ? ` / ${r.maxRedemptions}` : ""}</td>
                    <td className="px-4 py-3">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "No expiry"}</td>
                    <td className="px-4 py-3"><StatusPill tone={STATUS_TONE[r.displayStatus]}>{STATUS_LABEL[r.displayStatus]}</StatusPill></td>
                    <td className="px-2 py-3 text-right">
                      {isAdmin && r.status !== "archived" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={`Actions for ${r.code}`} />}>
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => open(r)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(r)}>{r.status === "active" ? "Deactivate" : "Activate"}</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => remove(r)}><Trash2 className="size-4" /> {r.redemptionCount > 0 ? "Archive" : "Delete"}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3">
            <Pagination page={page} pageSize={PAGE} total={filtered.length} onPageChange={setPage} itemLabel="coupons" />
          </div>
        </Card>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Create coupon" : `Edit ${editing ? editing.code : ""}`}</SheetTitle>
            <SheetDescription>Set up a discount code, where it applies, and its limits.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            {used && <p className="bg-status-info-bg text-status-info-fg rounded-lg p-3 text-caption">This coupon has been used {editing && typeof editing === "object" ? editing.redemptionCount : 0} times, so its code and discount are locked. Limits, dates and where it applies can still change.</p>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-code">Coupon code</Label>
              <Input id="cp-code" value={f.code} disabled={used} maxLength={32} placeholder="SAVE20" onChange={(e) => setF({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })} aria-invalid={!!errors.code} />
              <p className="text-muted-foreground text-caption">Letters, numbers and hyphens. Buyers can type it in any case.</p>
              {err("code")}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-name">Internal name (optional)</Label>
              <Input id="cp-name" value={f.name} maxLength={80} placeholder="Spring launch" onChange={(e) => setF({ name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Discount type</Label>
              <SegmentedControl value={f.discountType} onChange={(v) => !used && setF({ discountType: v })} options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Fixed amount" }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-amount">{f.discountType === "percent" ? "Percent off" : "Amount off"}</Label>
                <Input id="cp-amount" inputMode="decimal" disabled={used} value={f.amount} onChange={(e) => setF({ amount: e.target.value })} aria-invalid={!!(errors.percentOff || errors.amountOffCents)} />
                {err("percentOff")}
                {err("amountOffCents")}
              </div>
              {f.discountType === "fixed" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-cur">Currency</Label>
                  <OptionSelect id="cp-cur" disabled={used} value={f.currency} onChange={(v) => v && setF({ currency: v })} options={["USD", "EUR", "GBP", "CAD", "AUD", "NZD"].map((c) => ({ value: c, label: c }))} />
                  {err("currency")}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Applies to</Label>
              <SegmentedControl value={f.appliesKind} onChange={(v) => setF({ appliesKind: v })} options={[{ value: "all", label: "All checkouts" }, { value: "offers", label: "Selected Offers" }]} />
              {f.appliesKind === "offers" && (
                <MultiSelect
                  options={offers.map((o) => ({ value: o.id, label: o.title }))}
                  value={f.offerIds}
                  onChange={(v: string[]) => setF({ offerIds: v })}
                  placeholder="Choose Offers…"
                />
              )}
              <p className="text-muted-foreground text-caption">For selected Offers, the code works when one of them is the checkout&apos;s main Offer.</p>
              {err("appliesTo")}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="cp-bumps">Include Order Bumps</Label>
                <p className="text-muted-foreground text-caption">Discount the whole order, including add-ons.</p>
              </div>
              <Switch id="cp-bumps" checked={f.includeOrderBumps} onCheckedChange={(v) => setF({ includeOrderBumps: v })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-dur">On subscriptions, discount</Label>
              <OptionSelect
                id="cp-dur"
                disabled={used}
                value={f.duration}
                onChange={(v) => v && setF({ duration: v })}
                options={[
                  { value: "once", label: "The first payment" },
                  ...(monthlyPossible || f.duration === "repeating" ? [{ value: "repeating" as const, label: "The first few payments (monthly plans)" }] : []),
                  { value: "forever", label: "Every payment" },
                ]}
              />
              {f.duration === "repeating" && (
                <>
                  <div className="flex items-center gap-2">
                    <Input aria-label="Number of monthly payments" className="w-24" inputMode="numeric" disabled={used} value={f.months} onChange={(e) => setF({ months: e.target.value })} />
                    <span className="text-muted-foreground text-caption">monthly payments</span>
                  </div>
                  <p className="text-muted-foreground text-caption">
                    Only works on monthly plans: buyers on weekly or yearly plans are told the code can&apos;t be used. With a free trial of 4 weeks or more, Stripe counts from signup, so buyers see &quot;about&quot; that many discounted payments.
                  </p>
                  {!monthlyPossible && <p className="text-destructive text-caption">None of the selected Offers is a monthly plan, so this code would never apply. Choose &quot;The first payment&quot; or &quot;Every payment&quot;.</p>}
                </>
              )}
              {err("recurringDuration")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-max">Usage limit</Label>
                <Input id="cp-max" inputMode="numeric" placeholder="No limit" value={f.maxRedemptions} onChange={(e) => setF({ maxRedemptions: e.target.value })} />
                {err("maxRedemptions")}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-per">Per customer</Label>
                <Input id="cp-per" inputMode="numeric" placeholder="No limit" value={f.maxPerCustomer} onChange={(e) => setF({ maxPerCustomer: e.target.value })} />
                {err("maxPerCustomer")}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-start">Start date</Label>
                <Input id="cp-start" type="date" value={f.startsAt} onChange={(e) => setF({ startsAt: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-end">Expiration date</Label>
                <Input id="cp-end" type="date" value={f.expiresAt} onChange={(e) => setF({ expiresAt: e.target.value })} />
                {err("expiresAt")}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-min">Minimum purchase (optional)</Label>
              <Input id="cp-min" inputMode="decimal" placeholder="No minimum" value={f.minimum} onChange={(e) => setF({ minimum: e.target.value })} />
              <p className="text-muted-foreground text-caption">Compared with the order total before discounts.</p>
              {err("minimumSubtotalCents")}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="cp-active">Active</Label>
              <Switch id="cp-active" checked={f.active} onCheckedChange={(v) => setF({ active: v })} />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editing === "new" ? "Create coupon" : "Save coupon"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
