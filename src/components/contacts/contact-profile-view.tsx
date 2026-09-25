"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import { ContactProfileHeader } from "@/components/contacts/contact-profile-header";
import { ContactInfoCard } from "@/components/contacts/contact-info-card";
import { ContactDeals } from "@/components/contacts/contact-deals";
import { ContactQuotes } from "@/components/contacts/contact-quotes";
import { ContactTasks } from "@/components/contacts/contact-tasks";
import { ContactProjects } from "@/components/contacts/contact-projects";
import { ContactSubmittedForms } from "@/components/contacts/contact-submitted-forms";
import { ContactPurchasesAccess } from "@/components/contacts/contact-purchases-access";
import { ContactEnergeticDecoding } from "@/components/contacts/contact-energetic-decoding";
import { ContactPortalAccess } from "@/components/contacts/contact-portal-access";
import { ContactConversationsPanel } from "@/components/contacts/contact-conversations-panel";
import { ContactActivityFeed } from "@/components/contacts/contact-activity-feed";
import { ContactNotesPanel } from "@/components/contacts/contact-notes-panel";
import type { Contact } from "@/types/contacts";

type CenterTab = "conversations" | "activity" | "notes";
/** Phone-width section switcher (≥lg shows every column at once). */
type MobileSection = "details" | CenterTab | "records";

const CENTER_TABS: { id: CenterTab; label: string }[] = [
  { id: "conversations", label: "Conversations" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
];

const MOBILE_SECTIONS: { id: MobileSection; label: string }[] = [
  { id: "conversations", label: "Conversations" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
  { id: "details", label: "Details" },
  { id: "records", label: "Records" },
];

/**
 * Contact profile layout (Contacts redesign, 2026-09-25).
 *
 *   LEFT   — contact information, tags, source, Energetic Decoding link,
 *            Client Portal actions (unchanged).
 *   CENTER — three tabs: Conversations (default) · Activity · Notes.
 *   RIGHT  — compact, collapsible related records: Deals, Tasks, Projects,
 *            Submitted Forms, Purchases & Access, Quotes & invoices. None
 *            of these is repeated as a center tab.
 *
 * ≥xl: three columns. lg: two columns (related records stack under the
 * contact details). Below lg: one column with a section switcher, so the
 * three desktop columns are never squeezed onto a phone.
 *
 * Width: the approved three-column layout doesn't fit the 5xl data-page
 * container, so the Contacts screens use max-w-7xl (the mockup's ~1280px) — see the page-width convention in CLAUDE.md.
 */
export function ContactProfileView({ contact }: { contact: Contact }) {
  const { subAccountId, agencyId } = useSubAccount();
  const [tab, setTab] = useState<CenterTab>("conversations");
  const [mobileSection, setMobileSection] = useState<MobileSection>("conversations");
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Deep link: ?tab=activity|notes|conversations (read once, client-side).
  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get("tab");
      if (requested === "activity" || requested === "notes" || requested === "conversations") {
        setTab(requested);
        setMobileSection(requested);
      }
    } catch {
      // ignore
    }
  }, []);

  const selectTab = useCallback((next: CenterTab) => {
    setTab(next);
    setMobileSection(next);
  }, []);

  const openNote = useCallback(
    (noteId: string) => {
      setFocusNoteId(noteId);
      selectTab("notes");
    },
    [selectTab],
  );

  // Which blocks are visible below lg.
  const show = (section: MobileSection) =>
    cn(mobileSection === section ? "block" : "hidden", "lg:block");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <ContactProfileHeader
        contact={contact}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
      />

      {/* Phone / tablet section switcher. */}
      <nav
        aria-label="Contact sections"
        className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur lg:hidden"
      >
        <div className="flex min-w-max gap-4" role="tablist">
          {MOBILE_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={mobileSection === s.id}
              onClick={() => {
                setMobileSection(s.id);
                if (s.id === "conversations" || s.id === "activity" || s.id === "notes") {
                  setTab(s.id);
                }
              }}
              className={cn(
                "border-b-2 py-2.5 text-sm font-medium transition-colors",
                mobileSection === s.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,330px)]">
        {/* LEFT — contact information */}
        <aside className={cn("space-y-4 lg:col-start-1 lg:row-start-1", show("details"))}>
          <ContactInfoCard contact={contact} onEdit={() => setEditOpen(true)} />
          <ContactEnergeticDecoding contact={contact} />
          <ContactPortalAccess contact={contact} />
        </aside>

        {/* CENTER — Conversations · Activity · Notes */}
        <main
          className={cn(
            "min-w-0 lg:col-start-2 lg:row-span-2 xl:row-span-1",
            mobileSection === "conversations" || mobileSection === "activity" || mobileSection === "notes"
              ? "block"
              : "hidden",
            "lg:block",
          )}
        >
          <div className="rounded-xl border bg-card">
            <div
              role="tablist"
              aria-label="Contact timeline"
              className="hidden gap-6 border-b px-4 lg:flex"
            >
              {CENTER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`contact-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`contact-panel-${t.id}`}
                  onClick={() => selectTab(t.id)}
                  className={cn(
                    "-mb-px border-b-2 py-3 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`contact-panel-${tab}`}
              aria-labelledby={`contact-tab-${tab}`}
              className="p-3 sm:p-4"
            >
              {tab === "conversations" && <ContactConversationsPanel contact={contact} />}
              {tab === "activity" && (
                <ContactActivityFeed contactId={contact.id} onOpenNote={openNote} />
              )}
              {tab === "notes" && (
                <ContactNotesPanel contactId={contact.id} focusNoteId={focusNoteId} />
              )}
            </div>
          </div>
        </main>

        {/* RIGHT — related business records (each appears once) */}
        <aside
          aria-label="Related records"
          className={cn(
            "space-y-3 lg:col-start-1 lg:row-start-2 xl:col-start-3 xl:row-start-1",
            show("records"),
          )}
        >
          <ContactDeals contact={contact} collapsible="deals" />
          <ContactTasks contact={contact} collapsible="tasks" />
          <ContactProjects contact={contact} collapsible="projects" />
          <ContactSubmittedForms contact={contact} collapsible="forms" />
          <ContactPurchasesAccess contact={contact} collapsible="purchases" />
          <ContactQuotes
            contactId={contact.id}
            scope={{ agencyId: agencyId ?? "", subAccountId }}
            collapsible="quotes"
          />
        </aside>
      </div>
    </div>
  );
}
