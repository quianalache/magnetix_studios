"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MoreHorizontal, PanelRight, Search, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { useConversationTheme } from "@/hooks/use-conversation-theme";
import { subscribeToContacts, subscribeToContact } from "@/lib/firestore/contacts";
import { markConversationRead, subscribeToConversation, subscribeToConversations } from "@/lib/firestore/conversations";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { ConversationComposer } from "./conversation-composer";
import { ConversationAiControls } from "./conversation-ai-controls";
import { ConversationDraftCard } from "./conversation-draft-card";
import { ConversationContactPanel } from "./conversation-contact-panel";
import { CHANNEL_LABELS, ChannelBadge, ContactInitials } from "./channel-badge";
import type { Contact } from "@/types/contacts";
import type { ConversationChannel, ConversationDoc } from "@/types/conversations";

export type ChannelAvailability = { channel: ConversationChannel; available: boolean; reason?: string; notice?: string };
type Capabilities = { channels: ChannelAvailability[]; aiAvailable: boolean; aiReason?: string; members: { uid: string; name: string }[] };

export function ConversationWorkspace() {
  const { contactId } = useParams<{ contactId?: string }>();
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, loading: subLoading, saPath } = useSubAccount();
  const { ready, filter: territoryFilter } = useEffectiveTerritoryFilter();
  const [conversations, setConversations] = useState<ConversationDoc[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [listReady, setListReady] = useState(false);
  const [contactsReady, setContactsReady] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [unread, setUnread] = useState(false);
  const [channel, setChannel] = useState<ConversationChannel | "all">("all");

  useEffect(() => {
    if (authLoading || !user || subLoading || !subAccount || !ready || !agencyId) return;
    setListReady(false); setContactsReady(false); setError(""); setConversations([]); setContacts([]);
    const fail = () => setError("Conversations could not be loaded. Refresh to try again.");
    const timer = window.setTimeout(fail, 12000);
    const offList = safeSubscribe(() => subscribeToConversations(subAccountId, rows => {
      setConversations(rows); setListReady(true);
    }, fail), fail);
    const offContacts = safeSubscribe(() => subscribeToContacts({ subAccountId, agencyId }, { territoryFilter }, rows => {
      setContacts(rows); setContactsReady(true);
    }, fail), fail);
    return () => { clearTimeout(timer); offList?.(); offContacts?.(); };
  }, [authLoading, user, subLoading, subAccount, ready, agencyId, subAccountId, territoryFilter]);

  const allowed = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  // Reuse the existing territory-scoped contact query; no preview from an
  // inaccessible contact is rendered, even though the index is tenant-wide.
  const rows = useMemo(() => conversations.filter(c => allowed.has(c.contactId)).map(c => ({
    ...c, contactName: allowed.get(c.contactId)?.name || c.contactName,
    contactPhone: allowed.get(c.contactId)?.phone || c.contactPhone,
  })), [conversations, allowed]);
  const visible = rows.filter(c => (!unread || c.unreadCount > 0) &&
    (channel === "all" || c.channelsSeen?.includes(channel)) &&
    (!search.trim() || (c.contactName + " " + (c.contactPhone || "")).toLowerCase().includes(search.trim().toLowerCase())));
  const loaded = listReady && contactsReady;
  const unreadCount = rows.filter(c => c.unreadCount > 0).length;

  return <section aria-label="Conversations workspace" className="flex h-full min-h-0 w-full min-w-0 gap-2 lg:gap-3">
    <aside aria-label="Conversation list" className={cn("flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border bg-card md:w-[280px] xl:w-[320px] 2xl:w-[360px]", contactId && "hidden md:flex")}>
      <div className="space-y-3 p-4"><div><h1 className="text-xl font-bold tracking-tight text-primary">Conversations</h1><p className="mt-0.5 text-xs text-muted-foreground">All your messages in one place.</p></div>
        <div className="flex gap-2">{[false, true].map(value => <button key={String(value)} type="button" aria-pressed={unread === value} onClick={() => setUnread(value)} className={cn("min-h-10 rounded-full border px-4 text-xs font-medium", unread === value ? "border-primary bg-primary text-primary-foreground" : "text-primary hover:bg-primary/5")}>{value ? "Unread" : "All"}{loaded ? " (" + (value ? unreadCount : rows.length) + ")" : ""}</button>)}</div>
        <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search conversations by name or phone" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…" className="h-10 rounded-xl pl-9" /></div>
        <select aria-label="Filter conversations by channel" value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className="h-10 w-full rounded-xl border bg-background px-3 text-xs text-foreground"><option value="all">All channels</option>{Object.entries(CHANNEL_LABELS).map(([id, label]) => <option key={id} value={id}>{id === "messenger" ? "Facebook Messenger" : label}</option>)}</select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{!loaded ? <p role={error ? "alert" : "status"} className="p-5 text-sm text-muted-foreground">{error || "Loading conversations…"}</p> : <ConversationList conversations={visible} basePath={saPath("/conversations")} selectedId={contactId} filtered={!!search || unread || channel !== "all"} />}</div>
    </aside>
    {contactId ? <ActiveConversation key={subAccountId + ":" + contactId} contactId={contactId} /> : <div className="hidden min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center md:flex"><MessagesSquare className="mb-4 size-10 text-primary/40" /><h2 className="font-semibold">Select a conversation</h2><p className="mt-2 text-sm text-muted-foreground">Your message history and contact details will appear here.</p></div>}
  </section>;
}

/**
 * One contact's conversation: header controls, status/assignment, AI
 * controls, the merged thread, the pending AI draft and the composer.
 * `embedded` renders it inside the Contact profile's Conversations tab
 * (Contacts redesign) — same data, same availability checks and same
 * send routes; it only drops the workspace chrome (back link, contact
 * details panel, which the profile already shows) and links to the inbox.
 */
export function ActiveConversation({ contactId, embedded = false }: { contactId: string; embedded?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, saPath } = useSubAccount();
  const { theme, setTheme } = useConversationTheme();
  const [contact, setContact] = useState<Contact | null>(null);
  const [conversation, setConversation] = useState<ConversationDoc | null>(null);
  const [error, setError] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshCapabilities = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    try { setDetailsOpen(localStorage.getItem("ls.convo.detailsPanel") !== "0"); } catch {}
  }, []);

  useEffect(() => {
    if (!user || authLoading) return;
    const fail = () => setError("This conversation is unavailable or you do not have access.");
    const timer = window.setTimeout(fail, 12000);
    const offContact = safeSubscribe(() => subscribeToContact(contactId, c => {
      clearTimeout(timer);
      if (!c || c.subAccountId !== subAccountId) { fail(); return; }
      setContact(c); setError("");
    }, fail), fail);
    const offConversation = safeSubscribe(() => subscribeToConversation(contactId, c => {
      if (c && c.subAccountId !== subAccountId) { fail(); return; }
      setConversation(c);
    }, fail), fail);
    return () => { clearTimeout(timer); offContact?.(); offConversation?.(); };
  }, [contactId, subAccountId, user, authLoading]);

  useEffect(() => {
    if (!contact || !user) return;
    const controller = new AbortController();
    let current = true;
    async function load() {
      try {
        const response = await fetch("/api/conversations/" + contactId, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Channel availability could not be checked.");
        if (current) { setCapabilities(data); setCapabilityError(""); }
      } catch (err) {
        if (current) { setCapabilities(null); setCapabilityError(err instanceof Error ? err.message : "Channel availability could not be checked."); }
      }
    }
    void load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => { current = false; controller.abort(); clearInterval(timer); window.removeEventListener("focus", load); };
  }, [contactId, contact, user, refresh]);

  // Mark only an authenticated, accessible, actually selected conversation.
  // Repeating on a new inbound keeps the visible thread's badge consistent.
  useEffect(() => {
    if (contact && conversation && conversation.unreadCount > 0 && user && !error) void markConversationRead(contactId);
  }, [contact, conversation, contactId, user, error]);

  async function manage(patch: { status?: "open" | "closed"; assigneeUid?: string | null }) {
    setSaving(true);
    try {
      const res = await fetch("/api/conversations/" + contactId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversation could not be updated.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Conversation could not be updated."); }
    finally { setSaving(false); }
  }
  function toggleDetails() {
    setDetailsOpen(prev => { try { localStorage.setItem("ls.convo.detailsPanel", prev ? "0" : "1"); } catch {} return !prev; });
  }

  if (error) return <div className="min-w-0 flex-1 rounded-2xl border bg-card p-6">{!embedded && <Link href={saPath("/conversations")} className="text-primary">← Conversations</Link>}<p role="alert" className={cn("text-sm", !embedded && "mt-4")}>{error}</p></div>;
  if (!contact) return <div role="status" className="flex min-w-0 flex-1 items-center justify-center rounded-2xl border bg-card">Loading conversation…</div>;
  const draftAvailability = capabilities?.channels.find(c => c.channel === conversation?.pendingDraft?.channel);
  return <>
    <article aria-label="Active conversation" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3 lg:px-4">
        {embedded ? <div className="flex min-w-0 items-center gap-2">{conversation ? <ChannelBadge channel={conversation.lastChannel} /> : <span className="text-xs text-muted-foreground">No messages yet</span>}</div> : <div className="flex min-w-0 items-center gap-2"><Link href={saPath("/conversations")} aria-label="Back to conversations" className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-muted md:hidden"><ArrowLeft className="size-4" /></Link><ContactInitials name={contact.name || contact.phone || "?"} /><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{contact.name || "Unnamed contact"}</h2><p className="truncate text-xs text-muted-foreground">{contact.phone || contact.email}</p></div></div>}
        <div className="flex shrink-0 items-center gap-1">{!embedded && conversation && <span className="hidden lg:inline-flex"><ChannelBadge channel={conversation.lastChannel} /></span>}
          {embedded ? <Button render={<Link href={saPath("/conversations/" + contactId)} />} variant="ghost" size="sm" className="min-h-10 gap-1 px-2 text-xs">Open in Conversations<ExternalLink className="size-3" /></Button> : <>
          <Button variant="ghost" size="icon" className="hidden size-10 2xl:inline-flex" aria-label={detailsOpen ? "Hide contact details" : "Show contact details"} onClick={toggleDetails}><PanelRight className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-10 2xl:hidden" aria-label="Show contact details" onClick={() => setMobileDetails(true)}><PanelRight className="size-4" /></Button></>}
          <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10" aria-label="Conversation options" />}><MoreHorizontal className="size-5" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setTheme(theme === "native" ? "standard" : "native")}>Channel Styling: {theme === "native" ? "On" : "Off"}</DropdownMenuItem>
            {conversation && <DropdownMenuItem disabled={saving} onClick={() => void manage({ status: conversation.status === "open" ? "closed" : "open" })}>{conversation.status === "open" ? "Close conversation" : "Reopen conversation"}</DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu>
        </div>
      </header>
      {conversation && <><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs"><span className="capitalize text-muted-foreground">{conversation.status || "open"}</span><label className="flex items-center gap-2">Assigned to<select aria-label="Assign conversation" disabled={saving || !capabilities} value={conversation.assigneeUid || ""} onChange={e => void manage({ assigneeUid: e.target.value || null })} className="h-10 max-w-44 rounded-lg border bg-background px-2 text-xs"><option value="">Unassigned</option>{conversation.assigneeUid && !capabilities?.members.some(m => m.uid === conversation.assigneeUid) && <option value={conversation.assigneeUid}>Unavailable member</option>}{capabilities?.members.map(m => <option key={m.uid} value={m.uid}>{m.name}</option>)}</select></label></div>
      <ConversationAiControls conversation={conversation} available={capabilities?.aiAvailable ?? false} unavailableReason={capabilities?.aiReason || capabilityError || "Checking AI availability…"} /></>}
      <ConversationThread key={contactId} contactId={contactId} theme={theme} />
      {conversation?.pendingDraft && <ConversationDraftCard key={conversation.pendingDraft.body} contact={contact} draft={conversation.pendingDraft} disabledReason={draftAvailability?.available ? undefined : draftAvailability?.reason || "Channel availability has not been confirmed."} onSent={refreshCapabilities} />}
      {capabilityError && <p role="alert" className="px-4 py-2 text-xs text-destructive">{capabilityError} <button type="button" onClick={refreshCapabilities} className="underline">Retry</button></p>}
      <ConversationComposer key={contactId} contact={contact} availability={capabilities?.channels ?? []} defaultChannel={conversation?.lastChannel ?? "sms"} loading={!capabilities} onSent={refreshCapabilities} />
    </article>
    {!embedded && detailsOpen && <aside aria-label="Contact information" className="hidden min-h-0 w-[300px] shrink-0 overflow-hidden rounded-2xl border bg-card 2xl:block"><ConversationContactPanel contact={contact} availability={capabilities?.channels ?? []} onClose={toggleDetails} /></aside>}
    {!embedded && <Dialog open={mobileDetails} onOpenChange={setMobileDetails}><DialogContent className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-md"><DialogTitle className="sr-only">Contact details</DialogTitle><ConversationContactPanel contact={contact} availability={capabilities?.channels ?? []} onClose={() => setMobileDetails(false)} /></DialogContent></Dialog>}
  </>;
}
