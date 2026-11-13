"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Info, Loader2, Play, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchField } from "@/components/system/search-field";
import { cn } from "@/lib/utils";
import type { ContactRow, ContactSearchResponse } from "@/types/contact-search";

const SHEET_ON_MOBILE =
  "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]";

const MAY_HAPPEN = [
  "Emails may be sent",
  "SMS or WhatsApp messages may be sent — messaging charges may apply",
  "Webhooks may be called",
  "Tasks, deals and other records may be created or changed",
  "Tags and contact fields may change",
  "Other workflows may start",
];

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Workflow Test (CRM Foundations Batch B). The Test button runs the REAL
 * engine on a real contact — nothing is simulated. So: search the whole
 * workspace (server-side), pick a contact (picking only selects), review
 * what may happen, tick the confirmation, then start. Waits run their full
 * length; results appear in Runs.
 */
export function TestDialog({
  saId,
  workflowId,
  open,
  onOpenChange,
}: {
  saId: string;
  workflowId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ContactRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQInput("");
    setQ("");
    setSelected(null);
    setUnderstood(false);
    setStartError(null);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!open || selected) return;
    let cancelled = false;
    setResults(null);
    setSearchError(null);
    fetch(`/api/sub-accounts/${saId}/contacts/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, search: q, group: { match: "all", all: [] }, sort: { field: "name", dir: "asc" } }),
    })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as ContactSearchResponse & { error?: string };
        if (!r.ok) throw new Error(b.error ?? "Couldn't search contacts.");
        if (!cancelled) {
          setResults(b.contacts ?? []);
          setTotal(b.total ?? 0);
        }
      })
      .catch((e) => !cancelled && setSearchError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [open, saId, q, selected]);

  async function start() {
    if (!selected || !understood) return;
    setBusy(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/workflows/${workflowId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selected.id, confirmRealRun: true }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; runId?: string | null };
      if (!res.ok) throw new Error(d.error ?? "Couldn't start the test.");
      const runsHref = `/sa/${saId}/workflows/${workflowId}/runs${d.runId ? `?run=${encodeURIComponent(d.runId)}` : ""}`;
      toast.success(`Real test started for ${selected.name || selected.email}.`, {
        action: { label: "View run", onClick: () => router.push(runsHref) },
      });
      onOpenChange(false);
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn("flex max-h-[min(90dvh,780px)] flex-col sm:max-w-lg", SHEET_ON_MOBILE)}>
        <DialogHeader>
          <DialogTitle>Test workflow</DialogTitle>
          <DialogDescription className="sr-only">Run the saved workflow for one contact, for real.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4">
          <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-status-danger-bg p-3 text-sm" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger-fg" aria-hidden="true" />
            <div>
              <p className="font-semibold text-status-danger-fg">This is a real test.</p>
              <p>
                Magnetix runs the <strong>saved</strong> workflow for this contact — even a draft. Configured actions may send real messages,
                update contact records, call webhooks or start other workflows. Messaging charges may apply. Waits run their full length.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold" id="test-contact-label">Contact</p>
            {selected ? (
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3" aria-labelledby="test-contact-label">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-sm font-semibold text-tag-violet-fg">
                  {initials(selected.name || selected.email || "?")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{selected.name || "Unnamed contact"}</span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {[selected.email, selected.phone].filter(Boolean).join(" · ") || "No email or phone"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Choose a different contact"
                  onClick={() => {
                    setSelected(null);
                    setUnderstood(false);
                  }}
                  disabled={busy}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <>
                <SearchField value={qInput} onChange={setQInput} placeholder="Search by name, email or phone…" aria-label="Search contacts" />
                <div className="max-h-64 overflow-y-auto rounded-lg border" aria-live="polite">
                  {searchError ? (
                    <p className="p-4 text-center text-sm text-destructive" role="alert">{searchError}</p>
                  ) : results === null ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" aria-label="Searching" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">No contacts match.</p>
                  ) : (
                    <ul className="flex flex-col p-1">
                      {results.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-micro font-semibold text-tag-violet-fg">
                              {initials(c.name || c.email || "?")}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{c.name || "Unnamed contact"}</span>
                              <span className="block truncate text-caption text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {total > results.length ? (
                        <li className="px-2.5 py-2 text-caption text-muted-foreground">
                          Showing {results.length} of {total.toLocaleString()} — keep typing to narrow it down.
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {selected ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">What may happen</p>
                <ul className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-sm">
                  {MAY_HAPPEN.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-link" aria-hidden="true" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <label htmlFor="test-understood" className="flex items-start gap-2.5 text-sm">
                <Checkbox id="test-understood" checked={understood} onCheckedChange={(c) => setUnderstood(c === true)} />
                <span>I understand this starts a real test run.</span>
              </label>
            </>
          ) : null}

          <p className="flex items-center gap-2 rounded-lg bg-tint-violet px-3 py-2 text-caption text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" /> Results appear in Runs for this workflow, marked Test.
          </p>
          {startError ? (
            <p className="text-sm text-destructive" role="alert">{startError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!selected || !understood || busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {busy ? "Starting…" : "Start real test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
