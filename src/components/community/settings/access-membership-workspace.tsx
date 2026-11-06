"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Crown,
  Hash,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/system/confirm-dialog";
import { cn } from "@/lib/utils";
import type { AccessRule, LevelAccess, MembershipLevel } from "@/types/community-membership";
import type { GroupJoinPolicy } from "@/types/community";

type OfferSummary = { id: string; title: string; priceLabel: string; visibility: string; warning: string | null } | null;
type LevelRow = MembershipLevel & { memberCount: number; offer: OfferSummary };
type OfferOption = {
  id: string;
  title: string;
  visibility: string;
  type: string;
  priceCents: number | null;
  currency: string | null;
  recurringInterval: string | null;
  priceTextOverride: string | null;
};
interface Payload {
  joinPolicy: GroupJoinPolicy;
  levels: LevelRow[];
  offers: OfferOption[];
  channels: { id: string; name: string; private: boolean }[];
  courses: { id: string; title: string; published: boolean }[];
}

const ACCESS_OPTIONS: { value: GroupJoinPolicy; title: string; body: string }[] = [
  { value: "open", title: "Open", body: "Anyone can join immediately." },
  { value: "approval", title: "Approval Required", body: "People request access and you approve." },
  { value: "invite", title: "Invite Only", body: "Only people you add (or who buy access) can join." },
];

function offerPrice(o: OfferOption): string {
  if (o.priceTextOverride) return o.priceTextOverride;
  if (o.type === "free") return "Free";
  const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: o.currency || "USD" }).format((o.priceCents ?? 0) / 100);
  return o.type === "recurring" ? `${amount}/${o.recurringInterval ?? "month"}` : amount;
}

function summary(rule: AccessRule, noun: string, total: number): string {
  if (rule.mode === "all") return `All ${noun}`;
  return `${rule.ids.length} of ${total} ${noun}`;
}

export function AccessMembershipWorkspace({
  saId,
  pretty = false,
  staffGroupId,
  groupId,
  groupSlug,
  brand,
}: {
  saId: string;
  pretty?: boolean;
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  brand: string;
}) {
  const api = `/api/community/${saId}/${groupId}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [savingAccess, setSavingAccess] = useState(false);
  const [editing, setEditing] = useState<LevelRow | "new" | null>(null);
  const [managing, setManaging] = useState<LevelRow | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch(`${api}/membership-levels`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Couldn't load membership levels.");
      return;
    }
    setData(json as Payload);
    setJoinPolicy((json as Payload).joinPolicy);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const accessDirty = data !== null && joinPolicy !== data.joinPolicy;

  async function saveAccess() {
    setSavingAccess(true);
    const res = await fetch(`${api}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joinPolicy }) });
    setSavingAccess(false);
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't save community access.");
      return;
    }
    toast.success("Community access saved");
    await load();
  }

  async function makeBase(level: LevelRow) {
    const ok = await confirm({
      title: `Make “${level.name}” the Base Membership?`,
      description: "Every member without another active membership level will get this level’s access instead of the current Base Membership. Members on other levels keep their access.",
      confirmLabel: "Make Base Membership",
    });
    if (!ok) return;
    const res = await fetch(`${api}/membership-levels/${level.id}/make-base`, { method: "POST" });
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't change the Base Membership.");
    toast.success(`${level.name} is now the Base Membership`);
    await load();
  }

  async function remove(level: LevelRow) {
    const ok = await confirm({
      title: `Delete “${level.name}”?`,
      description: "This can't be undone. Levels that members have ever held can't be deleted — set them to Inactive instead.",
      confirmLabel: "Delete level",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`${api}/membership-levels/${level.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete the level.");
    toast.success("Level deleted");
    await load();
  }

  return (
    <div className="space-y-6" data-access-membership="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${brand}14`, color: brand }}>
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Community Settings</h1>
            <p className="text-sm text-muted-foreground">Manage who can join, membership levels, and what each level can access.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => data && setJoinPolicy(data.joinPolicy)}
            disabled={!accessDirty || savingAccess}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            onClick={saveAccess}
            disabled={!accessDirty || savingAccess}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {savingAccess && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {savingAccess ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav brand={brand} active="access" link={{ saId, pretty, staffGroupId }} groupSlug={groupSlug} />

        <section className="min-w-0 rounded-xl border border-border bg-white p-5">
          <h2 className="text-base font-semibold text-foreground">Access &amp; Membership</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Control who can join, manage membership levels, and set access for each level.</p>

          {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!data && !error && (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {data && (
            <>
              <div className="mt-5 grid gap-3 lg:grid-cols-[180px_1fr]">
                <div>
                  <p className="text-sm font-semibold text-foreground">Community Access</p>
                  <p className="text-xs text-muted-foreground">Who can join your community?</p>
                </div>
                <div role="radiogroup" aria-label="Community access" className="grid gap-2 sm:grid-cols-3">
                  {ACCESS_OPTIONS.map((o) => {
                    const active = joinPolicy === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setJoinPolicy(o.value)}
                        className={cn("flex items-start gap-2 rounded-lg border p-3 text-left transition-colors", active ? "bg-white" : "border-border hover:bg-muted")}
                        style={active ? { borderColor: brand, backgroundColor: `${brand}0D` } : undefined}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: active ? brand : "var(--border)" }}>
                          {active && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand }} />}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{o.title}</span>
                          <span className="block text-xs text-muted-foreground">{o.body}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Membership Levels</p>
                  <p className="text-xs text-muted-foreground">Create membership levels, connect paid Offers, and set the access each level includes.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing("new")}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold"
                  style={{ borderColor: brand, color: brand }}
                >
                  <Plus className="h-4 w-4" /> Add Membership Level
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {data.levels.map((l) => (
                  <div
                    key={l.id}
                    data-level-row={l.id}
                    className="grid items-center gap-4 rounded-xl border border-border p-4 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_150px_32px]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${brand}14`, color: brand }}>
                        {l.isBase ? <Users className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                          <span className="truncate">{l.name}</span>
                          {l.isBase && (
                            <span className="rounded-full px-2 py-0.5 text-micro font-semibold" style={{ backgroundColor: `${brand}14`, color: brand }}>
                              Base Membership
                            </span>
                          )}
                        </p>
                        {l.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>}
                      </div>
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">{l.offerId ? "Paid" : "Free"}</p>
                      {l.offer && <p className="text-xs text-muted-foreground">{l.offer.priceLabel}</p>}
                      {l.offer && <p className="truncate text-micro text-muted-foreground" title={l.offer.title}>{l.offer.title}</p>}
                      {l.offer?.warning && <p className="mt-1 text-micro font-medium text-amber-700">{l.offer.visibility === "missing" ? "Offer missing" : l.offer.visibility === "archived" ? "Offer archived" : "Offer is a draft"}</p>}
                    </div>
                    <ul className="space-y-0.5 text-xs text-foreground">
                      <li className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-muted-foreground" /> Channels: {summary(l.access.channels, "channels", data.channels.length)}</li>
                      <li className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-muted-foreground" /> Courses: {summary(l.access.courses, "courses", data.courses.length)}</li>
                    </ul>
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-sm text-foreground"><Users className="h-4 w-4 text-muted-foreground" /> {l.memberCount} {l.memberCount === 1 ? "member" : "members"}</p>
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-micro font-semibold", l.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                        {l.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<button type="button" aria-label={`Actions for ${l.name}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted" />}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(l)}>
                          <Pencil /> Edit membership level
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setManaging(l)}>
                          <Users /> Manage members
                        </DropdownMenuItem>
                        {!l.isBase && (
                          <DropdownMenuItem onClick={() => void makeBase(l)}>
                            <Star /> Make Base Membership
                          </DropdownMenuItem>
                        )}
                        {!l.isBase && (
                          <DropdownMenuItem variant="destructive" onClick={() => void remove(l)}>
                            <Trash2 /> Delete level
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: brand }} />
                Every member gets the Base Membership. A paid level is granted when someone buys its connected Offer and ends when that purchase or subscription ends — they then fall back to the Base Membership. Access adds up: if any of a member’s levels includes something, they can open it.
              </p>
            </>
          )}
        </section>
      </div>

      {data && editing && (
        <LevelDrawer
          key={editing === "new" ? "new" : editing.id}
          api={api}
          brand={brand}
          level={editing === "new" ? null : editing}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {managing && (
        <ManageMembersDialog
          api={api}
          brand={brand}
          level={managing}
          onClose={async () => {
            setManaging(null);
            await load();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function AccessPicker({
  label,
  hint,
  noun,
  rule,
  options,
  brand,
  onChange,
}: {
  label: string;
  hint: string;
  noun: string;
  rule: AccessRule;
  options: { id: string; label: string; sub?: string }[];
  brand: string;
  onChange: (r: AccessRule) => void;
}) {
  const name = `access-${noun}`;
  return (
    <fieldset className="border-t border-border pt-4">
      <legend className="text-sm font-semibold text-foreground">{label}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex gap-5">
        {(["all", "selected"] as const).map((mode) => (
          <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              checked={rule.mode === mode}
              onChange={() => onChange({ mode, ids: mode === "all" ? [] : rule.ids })}
              style={{ accentColor: brand }}
            />
            {mode === "all" ? `All ${noun}` : `Selected ${noun}`}
          </label>
        ))}
      </div>
      {rule.mode === "selected" && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {options.length === 0 && <p className="p-1 text-xs text-muted-foreground">No {noun} yet.</p>}
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rule.ids.includes(o.id)}
                onChange={(e) => onChange({ mode: "selected", ids: e.target.checked ? [...rule.ids, o.id] : rule.ids.filter((x) => x !== o.id) })}
                style={{ accentColor: brand }}
              />
              <span>
                <span className="text-foreground">{o.label}</span>
                {o.sub && <span className="block text-micro text-muted-foreground">{o.sub}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function LevelDrawer({
  api,
  brand,
  level,
  data,
  onClose,
  onSaved,
}: {
  api: string;
  brand: string;
  level: LevelRow | null;
  data: Payload;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(level?.name ?? "");
  const [description, setDescription] = useState(level?.description ?? "");
  const [offerId, setOfferId] = useState<string>(level?.offerId ?? "");
  const [active, setActive] = useState(level ? level.status === "active" : true);
  const [access, setAccess] = useState<LevelAccess>(
    level?.access ?? { channels: { mode: "all", ids: [] }, courses: { mode: "all", ids: [] } }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isBase = level?.isBase === true;
  const offerItems = [
    { value: "", label: "Free — no Offer" },
    ...data.offers.map((o) => ({ value: o.id, label: `${o.title} – ${offerPrice(o)}${o.visibility !== "published" ? ` (${o.visibility})` : ""}` })),
    ...(level?.offerId && !data.offers.some((o) => o.id === level.offerId) ? [{ value: level.offerId, label: "Missing Offer" }] : []),
  ];
  const selectedOffer = data.offers.find((o) => o.id === offerId) ?? null;
  const offerWarning =
    offerId && !selectedOffer
      ? "This Offer no longer exists — choose another so people can buy this level."
      : selectedOffer?.visibility === "archived"
        ? "This Offer is archived — nobody new can buy this level. Existing members keep it."
        : selectedOffer?.visibility === "draft"
          ? "This Offer is a draft — publish it so people can buy this level."
          : null;

  async function save() {
    setSaving(true);
    setErr(null);
    const body = { name, description, offerId: offerId || null, status: active ? "active" : "inactive", access };
    const res = await fetch(level ? `${api}/membership-levels/${level.id}` : `${api}/membership-levels`, {
      method: level ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Couldn't save this level.");
      return;
    }
    toast.success(level ? "Membership level saved" : "Membership level created");
    await onSaved();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-level-drawer="">
        <SheetHeader>
          <SheetTitle>{level ? "Edit Membership Level" : "Add Membership Level"}</SheetTitle>
          <SheetDescription>Update the details, access, and status for this membership level.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {level && (
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: `${brand}10` }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white" style={{ color: brand }}>
                {isBase ? <Users className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
              </span>
              <div>
                <p className="font-semibold text-foreground">{level.name}</p>
                <p className="text-xs text-muted-foreground">{level.offerId ? "Paid" : "Free"} · {level.memberCount} members{isBase ? " · Base Membership" : ""}</p>
              </div>
            </div>
          )}
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Level name <span className="text-red-600">*</span></span>
            <input id="level-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Description</span>
            <textarea id="level-description" value={description} maxLength={200} rows={3} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" />
            <span className="block text-right text-micro text-muted-foreground">{description.length} / 200</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Pricing / Offer connection</span>
            <span className="block text-xs text-muted-foreground">{isBase ? "The Base Membership is always free." : "Connect a paid Offer — buying it grants this level. The Offer sets the price and billing."}</span>
            <Select
              value={offerId}
              disabled={isBase}
              onValueChange={(v) => setOfferId(typeof v === "string" ? v : "")}
              items={offerItems}
            >
              <SelectTrigger id="level-offer" aria-label="Pricing / Offer connection" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offerItems.map((i) => (
                  <SelectItem key={i.value || "free"} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {offerWarning && <span className="mt-1 block rounded-md bg-amber-50 p-2 text-xs text-amber-800">{offerWarning}</span>}
          </label>
          <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Status</p>
              <p className="text-xs text-muted-foreground">
                {isBase ? "The Base Membership is always active." : active ? "Active levels give their members access." : "Inactive: members on this level fall back to the Base Membership."}
              </p>
            </div>
            <Switch id="level-status" checked={active} disabled={isBase} onCheckedChange={(v) => setActive(v === true)} aria-label="Active" />
          </div>
          <AccessPicker
            label="Channels access"
            hint="Choose which channels this level can access."
            noun="channels"
            brand={brand}
            rule={access.channels}
            options={data.channels.map((c) => ({ id: c.id, label: c.name, sub: c.private ? "Private — moderators only" : undefined }))}
            onChange={(r) => setAccess((a) => ({ ...a, channels: r }))}
          />
          <AccessPicker
            label="Courses access"
            hint="Choose which courses already added to this Community’s Classroom this level can access. A course’s own price still applies."
            noun="Classroom courses"
            brand={brand}
            rule={access.courses}
            options={data.courses.map((c) => ({ id: c.id, label: c.title, sub: c.published ? undefined : "Unpublished" }))}
            onChange={(r) => setAccess((a) => ({ ...a, courses: r }))}
          />
          <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" style={{ color: brand }} /> Access changes apply to all members on this level.
          </p>
          {err && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type MemberRow = { memberId: string; name: string; email: string; source: "base" | "offer" | "manual"; grantId: string | null };

function ManageMembersDialog({ api, brand, level, onClose }: { api: string; brand: string; level: LevelRow; onClose: () => void }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [candidates, setCandidates] = useState<{ memberId: string; name: string; email: string }[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${api}/membership-levels/${level.id}/members`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? "Couldn't load members.");
    setRows(json.members);
    setCandidates(json.candidates);
  }, [api, level.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [rows, q]);

  async function add() {
    if (!adding) return;
    setBusy(true);
    const res = await fetch(`${api}/membership-levels/${level.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: adding }) });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't add this member.");
    setAdding("");
    toast.success("Member added (complimentary)");
    await load();
  }

  async function removeGrant(r: MemberRow) {
    if (!r.grantId) return;
    setBusy(true);
    const res = await fetch(`${api}/membership-levels/${level.id}/members?memberId=${encodeURIComponent(r.memberId)}&grantId=${encodeURIComponent(r.grantId)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't remove this member.");
    toast.success("Removed — they fall back to the Base Membership");
    await load();
  }

  const candidateItems = [
    { value: "", label: "Add a member…" },
    ...candidates.map((c) => ({ value: c.memberId, label: c.name ? `${c.name} · ${c.email}` : c.email })),
  ];
  const SOURCE: Record<MemberRow["source"], string> = { base: "Base", offer: "Offer purchase", manual: "Complimentary" };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-manage-members="">
        <DialogHeader>
          <DialogTitle>Manage members — {level.name}</DialogTitle>
          <DialogDescription>
            {level.isBase
              ? "Everyone without another active membership level. Add people to other levels to move them off the Base Membership."
              : "People who bought this level’s Offer, plus anyone you add for free (complimentary)."}
          </DialogDescription>
        </DialogHeader>
        {!level.isBase && (
          <div className="flex gap-2">
            <Select value={adding} onValueChange={(v) => setAdding(typeof v === "string" ? v : "")} items={candidateItems}>
              <SelectTrigger aria-label="Member to add" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidateItems.map((i) => (
                  <SelectItem key={i.value || "none"} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button type="button" onClick={add} disabled={!adding || busy} className="rounded-md px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: brand }}>
              Add
            </button>
          </div>
        )}
        <label className="relative block">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="h-9 w-full rounded-md border border-border pr-2 pl-8 text-sm" />
        </label>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {rows === null && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />}
          {rows !== null && filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No members on this level.</p>}
          {filtered.map((r) => (
            <div key={`${r.memberId}-${r.grantId ?? "base"}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.name || r.email}</p>
                <p className="truncate text-xs text-muted-foreground">{r.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-foreground">{SOURCE[r.source]}</span>
                {r.source === "manual" && (
                  <button type="button" onClick={() => void removeGrant(r)} disabled={busy} aria-label={`Remove ${r.name || r.email}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
