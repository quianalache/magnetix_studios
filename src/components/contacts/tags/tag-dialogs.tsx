"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { SearchField } from "@/components/system/search-field";
import { OptionSelect } from "@/components/system/option-select";
import { cn } from "@/lib/utils";
import {
  contactsWithTagHref,
  MAX_TAG_NAME_LENGTH,
  tagKey,
  validateTagName,
} from "@/lib/contacts/tag-names";
import {
  TAG_USAGE_SECTION_LABELS,
  type ContactTagDoc,
  type TagDetailResponse,
  type TagDuplicateGroup,
  type TagSummary,
  type TagUsageSection,
} from "@/types/contact-tags";
import {
  contactsLabel,
  SHEET_ON_MOBILE,
  TagApiError,
  tagsFetch,
  USAGE_ICONS,
} from "./tags-client";

/* ------------------------------- New tag ------------------------------- */

export function NewTagDialog({
  subAccountId,
  open,
  onOpenChange,
  onCreated,
  onOpenExisting,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tag: ContactTagDoc) => void;
  onOpenExisting: (tagId: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setExisting(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateTagName(name);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    setExisting(null);
    try {
      const { tag } = await tagsFetch<{ tag: ContactTagDoc }>(subAccountId, "", { method: "POST", body: { name: check.name } });
      toast.success(`Tag “${tag.name}” created.`);
      onCreated(tag);
      onOpenChange(false);
    } catch (err) {
      const e2 = err as TagApiError;
      setError(e2.message);
      if (e2.code === "exists" && typeof e2.extra.tagId === "string") {
        setExisting({ id: e2.extra.tagId, name: String(e2.extra.name ?? "") });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", SHEET_ON_MOBILE)}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>Create a tag to use on contacts, forms, checkouts and workflows.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-tag-name">Tag name</Label>
            <Input
              id="new-tag-name"
              value={name}
              maxLength={MAX_TAG_NAME_LENGTH}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby="new-tag-help"
            />
            <p id="new-tag-help" className={cn("text-caption", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
              {error ?? `Up to ${MAX_TAG_NAME_LENGTH} characters. Capitals and extra spaces don't make a different tag.`}
            </p>
            {existing ? (
              <Button
                type="button"
                variant="link"
                className="h-auto self-start p-0"
                onClick={() => {
                  onOpenChange(false);
                  onOpenExisting(existing.id);
                }}
              >
                Open “{existing.name}”
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Create tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Rename -------------------------------- */

export function RenameTagDialog({
  subAccountId,
  tag,
  open,
  onOpenChange,
  onRenamed,
  onMergeInstead,
}: {
  subAccountId: string;
  tag: TagSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (tagId: string) => void;
  onMergeInstead: (existingTagId: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  useEffect(() => {
    if (open && tag) {
      setName(tag.name);
      setError(null);
      setClash(null);
    }
  }, [open, tag]);
  if (!tag) return null;
  const unchanged = name.trim() === tag.name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tag) return;
    const check = validateTagName(name);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    setClash(null);
    try {
      const res = await tagsFetch<{ tag: ContactTagDoc; contactsUpdated: number; referencesUpdated: number }>(
        subAccountId,
        `/${encodeURIComponent(tag.id)}`,
        { method: "PATCH", body: { name: check.name } },
      );
      toast.success(
        `Renamed to “${res.tag.name}”. Updated ${contactsLabel(res.contactsUpdated)} and ${res.referencesUpdated} ${res.referencesUpdated === 1 ? "setting" : "settings"}.`,
      );
      onRenamed(res.tag.id);
      onOpenChange(false);
    } catch (err) {
      const e2 = err as TagApiError;
      setError(e2.message);
      if (e2.code === "name_taken" && typeof e2.extra.tagId === "string") setClash(e2.extra.tagId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn("sm:max-w-md", SHEET_ON_MOBILE)}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename tag</DialogTitle>
            <DialogDescription>
              It stays on the same {contactsLabel(tag.contactCount)}. Workflows, forms, checkouts and lists that use it are updated too.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-tag-name">Tag name</Label>
            <Input
              id="rename-tag-name"
              value={name}
              maxLength={MAX_TAG_NAME_LENGTH}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setClash(null);
              }}
              aria-invalid={!!error}
            />
            {error ? (
              <p className="text-caption text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {clash ? (
              <Button
                type="button"
                variant="link"
                className="h-auto self-start p-0"
                onClick={() => {
                  onOpenChange(false);
                  onMergeInstead(clash);
                }}
              >
                Merge the two tags instead
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || unchanged || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {busy ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Merge --------------------------------- */

export function MergeTagsDialog({
  subAccountId,
  tags,
  open,
  onOpenChange,
  initialTargetId,
  initialSourceIds,
  onMerged,
}: {
  subAccountId: string;
  tags: TagSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTargetId: string | null;
  initialSourceIds: string[];
  onMerged: (keptId: string) => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTargetId(initialTargetId);
      setSourceIds(initialSourceIds.filter((id) => id !== initialTargetId));
      setQ("");
      setError(null);
    }
  }, [open, initialTargetId, initialSourceIds]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const target = targetId ? byId.get(targetId) ?? null : null;
  const sources = sourceIds.map((id) => byId.get(id)).filter((t): t is TagSummary => !!t);
  const candidates = tags
    .filter((t) => t.id !== targetId)
    .filter((t) => !q.trim() || tagKey(t.name).includes(tagKey(q)));
  const variantCount = target?.variants.length ?? 0;
  const canMerge = !!target && !target.legacyOnly && (sources.length > 0 || variantCount > 0);
  const contactsAffected = sources.reduce((n, s) => n + s.contactCount, 0) + (target?.variants.reduce((n, v) => n + v.contactCount, 0) ?? 0);
  const settingsAffected = sources.reduce((n, s) => n + s.usageCount, 0);

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await tagsFetch<{ tag: ContactTagDoc; contactsUpdated: number; referencesUpdated: number }>(subAccountId, "/merge", {
        method: "POST",
        body: { targetId: target.id, sourceIds },
      });
      toast.success(
        `Merged into “${res.tag.name}”. Updated ${contactsLabel(res.contactsUpdated)} and ${res.referencesUpdated} ${res.referencesUpdated === 1 ? "setting" : "settings"}.`,
      );
      onMerged(res.tag.id);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn("flex max-h-[min(88dvh,760px)] flex-col sm:max-w-lg", SHEET_ON_MOBILE)}>
        <DialogHeader>
          <DialogTitle>Merge tags</DialogTitle>
          <DialogDescription>
            Choose the tag to keep. The others are replaced by it everywhere — on contacts and in workflows, forms, checkouts and lists.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="merge-target">Tag to keep</Label>
            <OptionSelect
              id="merge-target"
              value={targetId}
              onChange={(v) => {
                setTargetId(v);
                setSourceIds((ids) => ids.filter((id) => id !== v));
              }}
              placeholder="Choose a tag…"
              options={tags.map((t) => ({ value: t.id, label: `${t.name} · ${contactsLabel(t.contactCount)}`, disabled: t.legacyOnly }))}
            />
            {target && variantCount > 0 ? (
              <p className="text-caption text-muted-foreground">
                Also changes {target.variants.map((v) => `“${v.name}”`).join(", ")} to “{target.name}”.
              </p>
            ) : null}
          </div>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Tags to merge into it</legend>
            <SearchField value={q} onChange={setQ} placeholder="Search tags…" aria-label="Search tags to merge" />
            <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
              {candidates.length === 0 ? (
                <li className="px-2 py-3 text-center text-caption text-muted-foreground">No other tags match.</li>
              ) : (
                candidates.map((t) => {
                  const id = `merge-src-${t.id}`;
                  const checked = sourceIds.includes(t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(c) => setSourceIds((ids) => (c ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                      />
                      <label htmlFor={id} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
                        <span className="truncate">{t.name}</span>
                        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{contactsLabel(t.contactCount)}</span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </fieldset>
          {target && canMerge ? (
            <Alert tone="warning" title="What changes">
              {sources.length > 0 ? `${sources.map((s) => `“${s.name}”`).join(", ")} will be replaced by “${target.name}”` : `Other spellings will become “${target.name}”`} on about {contactsLabel(contactsAffected)}
              {settingsAffected > 0 ? ` and in ${settingsAffected} ${settingsAffected === 1 ? "setting" : "settings"}` : ""}. Past activity stays as it was. This can&apos;t be undone.
            </Alert>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !canMerge} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {busy ? "Merging…" : target ? `Merge into “${target.name}”` : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Delete --------------------------------- */

function UsageSectionBlock({
  section,
  open,
  onToggle,
  onMore,
  loadingMore,
  external,
}: {
  section: TagUsageSection;
  open: boolean;
  onToggle: () => void;
  onMore: () => void;
  loadingMore: boolean;
  external: boolean;
}) {
  const Icon = USAGE_ICONS[section.type];
  const bodyId = `tag-usage-${section.type}`;
  return (
    <section className="rounded-lg border">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {TAG_USAGE_SECTION_LABELS[section.type]} ({section.total})
          </span>
        </button>
      </h3>
      {open ? (
        <ul id={bodyId} className="flex flex-col border-t">
          {section.items.map((item) => (
            <li key={`${item.type}:${item.id}`} className="flex items-start gap-3 border-b px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                {item.href ? (
                  <Link
                    href={item.href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener" : undefined}
                    className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-link hover:underline"
                  >
                    <span className="truncate">{item.name}</span>
                    {external ? <ExternalLink className="size-3.5 shrink-0" aria-label="(opens in a new tab)" /> : null}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{item.name}</span>
                )}
                <p className="text-caption text-muted-foreground">
                  {item.contexts.join(" · ")}
                  {item.status ? ` · ${item.status}` : ""}
                </p>
              </div>
            </li>
          ))}
          {section.nextOffset !== null ? (
            <li className="px-3 py-2">
              <Button variant="ghost" size="sm" disabled={loadingMore} onClick={onMore}>
                {loadingMore ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Show more ({section.total - section.items.length} more)
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

/** Loads the detail for a tag and lets a list section load more rows. */
export function useTagDetail(subAccountId: string, tagId: string | null, nonce = 0) {
  const [detail, setDetail] = useState<TagDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  useEffect(() => {
    if (!tagId) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    tagsFetch<TagDetailResponse>(subAccountId, `/${encodeURIComponent(tagId)}`)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, tagId, nonce]);

  async function loadMore(section: TagUsageSection) {
    if (!tagId || section.nextOffset === null) return;
    setLoadingMore(section.type);
    try {
      const next = await tagsFetch<TagDetailResponse>(
        subAccountId,
        `/${encodeURIComponent(tagId)}?more=${section.type}&offset=${section.nextOffset}`,
      );
      const more = next.sections.find((s) => s.type === section.type);
      if (more) {
        setDetail((d) =>
          d
            ? {
                ...d,
                sections: d.sections.map((s) =>
                  s.type === section.type ? { ...s, items: [...s.items, ...more.items], nextOffset: more.nextOffset } : s,
                ),
              }
            : d,
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(null);
    }
  }
  return { detail, error, loadingMore, loadMore };
}

export function UsageSections({
  detail,
  loadingMore,
  loadMore,
  external,
  defaultOpen,
}: {
  detail: TagDetailResponse;
  loadingMore: string | null;
  loadMore: (s: TagUsageSection) => void;
  external: boolean;
  defaultOpen: "first" | "all";
}) {
  const sections = detail.sections.filter((s) => s.total > 0);
  const [openTypes, setOpenTypes] = useState<Set<string>>(
    () => new Set(defaultOpen === "all" ? sections.map((s) => s.type) : sections.slice(0, 1).map((s) => s.type)),
  );
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">Not used in any workflows, forms, checkouts, broadcast drafts or contact lists.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {sections.map((s) => (
        <UsageSectionBlock
          key={s.type}
          section={s}
          external={external}
          open={openTypes.has(s.type)}
          loadingMore={loadingMore === s.type}
          onMore={() => loadMore(s)}
          onToggle={() =>
            setOpenTypes((prev) => {
              const next = new Set(prev);
              if (next.has(s.type)) next.delete(s.type);
              else next.add(s.type);
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

export function DeleteTagDialog({
  subAccountId,
  tag,
  open,
  onOpenChange,
  onDeleted,
}: {
  subAccountId: string;
  tag: TagSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const { detail, error, loadingMore, loadMore } = useTagDetail(subAccountId, open && tag ? tag.id : null, nonce);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSubmitError(null);
  }, [open]);
  if (!tag) return null;
  const refs = detail ? detail.sections.reduce((n, s) => n + s.total, 0) : 0;
  const attention = detail?.attentionReferenceCount ?? 0;
  const contacts = detail?.tag.contactCount ?? tag.contactCount;

  async function confirm() {
    if (!detail || !tag) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await tagsFetch<{ contactsUpdated: number; referencesUpdated: number; referencesNeedingAttention: number }>(subAccountId, `/${encodeURIComponent(tag.id)}`, {
        method: "DELETE",
        body: { confirmName: detail.tag.name, expectedReferenceCount: refs },
      });
      toast.success(
        `Deleted “${detail.tag.name}”. Removed it from ${contactsLabel(res.contactsUpdated)}.` +
          (res.referencesNeedingAttention > 0
            ? ` ${res.referencesNeedingAttention} ${res.referencesNeedingAttention === 1 ? "automation needs" : "automations need"} attention.`
            : ""),
      );
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      const e2 = err as TagApiError;
      setSubmitError(e2.message);
      if (e2.code === "changed") setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn("flex max-h-[min(88dvh,760px)] flex-col gap-0 p-0 sm:max-w-xl", SHEET_ON_MOBILE)}>
        <DialogHeader className="gap-1.5 border-b p-4 pr-12">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-4" aria-hidden="true" />
            </span>
            <DialogTitle className="text-lg leading-tight">Delete “{tag.name}”?</DialogTitle>
          </div>
          <DialogDescription>
            It&apos;s removed from every contact and from the settings that add it. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          {error ? (
            <Alert tone="danger" title="Couldn't check where this tag is used.">
              {error}
            </Alert>
          ) : !detail ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking where this tag is used…
            </div>
          ) : (
            <>
              {contacts > 0 || refs > 0 ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-status-danger-bg p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger-fg" aria-hidden="true" />
                  <div>
                    <p className="font-medium">This tag is in use</p>
                    <p className="text-muted-foreground">
                      On {contactsLabel(contacts)}
                      {refs > 0 ? ` and in ${refs} ${refs === 1 ? "setting" : "settings"}` : ""}. Review the details below.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No contacts or settings use this tag.</p>
              )}
              {attention > 0 ? (
                <Alert tone="warning" title="Some automations will need attention">
                  {attention === 1 ? "One workflow, list or broadcast draft tests" : `${attention} workflows, lists or broadcast drafts test`} this tag or add / remove it. They are kept and marked “Needs
                  attention”. Until you choose another tag: those workflow triggers won&apos;t enroll anyone, runs stop at
                  those steps (they never take a branch or re-add the tag), lists match no one and broadcasts can&apos;t send. Nothing starts
                  reaching more people.
                </Alert>
              ) : null}
              <section className="rounded-lg border">
                <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 text-sm">
                  <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">Contacts ({contacts.toLocaleString()})</span>
                  {contacts > 0 ? (
                    <Link
                      href={contactsWithTagHref(subAccountId, detail.tag.name)}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                    >
                      View all contacts <ExternalLink className="size-3.5" aria-label="(opens in a new tab)" />
                    </Link>
                  ) : null}
                </div>
                {contacts > 0 ? (
                  <p className="border-t px-3 py-2 text-caption text-muted-foreground">
                    {contactsLabel(contacts)} tagged “{detail.tag.name}” will lose this tag.
                  </p>
                ) : null}
              </section>
              <UsageSections detail={detail} loadingMore={loadingMore} loadMore={loadMore} external defaultOpen="all" />
              {submitError ? (
                <p className="text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter className="m-0 rounded-b-xl">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy || !detail}
            onClick={confirm}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            {busy ? "Deleting…" : "Delete tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Duplicates ------------------------------ */

export function DuplicatesDialog({
  subAccountId,
  open,
  onOpenChange,
  canManage,
  onReviewGroup,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onReviewGroup: (group: TagDuplicateGroup) => void;
}) {
  const [groups, setGroups] = useState<TagDuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setGroups(null);
    setError(null);
    tagsFetch<{ groups: TagDuplicateGroup[] }>(subAccountId, "/duplicates")
      .then((d) => setGroups(d.groups))
      .catch((err) => setError((err as Error).message));
  }, [open, subAccountId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[min(88dvh,760px)] flex-col sm:max-w-lg", SHEET_ON_MOBILE)}>
        <DialogHeader>
          <DialogTitle>Possible duplicates</DialogTitle>
          <DialogDescription>
            Tags that look alike. Nothing is combined unless you choose to merge.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : groups === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Looking for look-alike tags…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No possible duplicates found.</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="flex flex-col gap-2 rounded-lg border p-3">
                <ul className="flex flex-col gap-1">
                  {g.tags.map((t) => (
                    <li key={t.id} className="flex flex-col text-sm">
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-medium">{t.name}</span>
                        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{contactsLabel(t.contactCount)}</span>
                      </span>
                      {t.variants.length > 0 ? (
                        <span className="text-caption text-muted-foreground">
                          Also written as {t.variants.map((v) => `“${v.name}” (${v.contactCount})`).join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canManage ? (
                  <Button variant="secondary" size="sm" className="self-start" onClick={() => onReviewGroup(g)}>
                    Review and merge
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
