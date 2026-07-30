"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  ArrowLeft,
  FileText,
  GripVertical,
  ImageIcon,
  Loader2,
  MousePointerClick,
  Minus,
  Columns2,
  Plus,
  Save,
  Send,
  Video,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextBlockEditor } from "@/components/broadcasts/text-block-editor";
import {
  ImageBlockEditor,
  VideoBlockEditor,
  ButtonBlockEditor,
  ColumnsBlockEditor,
  newBlockId,
} from "@/components/broadcasts/block-editors";
import {
  AudienceFilterPicker,
  audienceFilterToApiShape,
  defaultAudienceFilterState,
  useAudiencePreview,
  type AudienceFilterState,
} from "@/components/broadcasts/audience-filter-picker";
import { TemplatePickerDialog } from "@/components/broadcasts/template-picker-dialog";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type {
  BroadcastContent,
  EmailBlock,
  BroadcastTemplateDoc,
} from "@/types";

const BLOCK_LABELS: Record<EmailBlock["type"], { label: string; icon: typeof FileText }> = {
  text: { label: "Text", icon: AlignLeft },
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  button: { label: "Button", icon: MousePointerClick },
  divider: { label: "Divider", icon: Minus },
  columns: { label: "Columns", icon: Columns2 },
};

function newBlock(type: EmailBlock["type"]): EmailBlock {
  switch (type) {
    case "text":
      return { id: newBlockId(), type: "text", html: "<p>Write something…</p>" };
    case "image":
      return { id: newBlockId(), type: "image", src: "", alt: "" };
    case "video":
      return { id: newBlockId(), type: "video", videoUrl: "", thumbnailSrc: "", alt: "" };
    case "button":
      return { id: newBlockId(), type: "button", label: "Click here", href: "" };
    case "divider":
      return { id: newBlockId(), type: "divider" };
    case "columns":
      return {
        id: newBlockId(),
        type: "columns",
        columns: [
          [{ id: newBlockId(), type: "text", html: "<p></p>" }],
          [{ id: newBlockId(), type: "text", html: "<p></p>" }],
        ],
      };
  }
}

export default function NewBroadcastPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, saPath } = useSubAccount();
  const router = useRouter();

  const [draftId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [audience, setAudience] = useState<AudienceFilterState>(defaultAudienceFilterState());
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, (list) =>
      setContacts(list),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const content: BroadcastContent = useMemo(() => ({ version: 1, blocks }), [blocks]);
  const audiencePreview = useAudiencePreview(contacts, audience);

  // Debounced live preview — the composer's iframe renders the EXACT same
  // renderer output the real send uses, never a second approximate render.
  useEffect(() => {
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/broadcasts/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subAccountId, content }),
        });
        const data = (await res.json()) as { html?: string };
        if (data.html) setPreviewHtml(data.html);
      } catch {
        // Preview is best-effort — a network hiccup shouldn't block composing.
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [subAccountId, content]);

  const addBlock = useCallback((type: EmailBlock["type"]) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }, []);

  const updateBlock = useCallback((id: string, next: EmailBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const missingAddress = !subAccount?.mailingAddress;
  const audienceFilter = audienceFilterToApiShape(audience);
  const canSend =
    !!subject.trim() &&
    blocks.length > 0 &&
    !!audienceFilter &&
    audiencePreview.recipients > 0 &&
    !missingAddress &&
    !sending;

  async function handleSend() {
    if (!audienceFilter) return;
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          content,
          subject: subject.trim(),
          preheader: preheader.trim() || null,
          audienceFilter,
          sourceTemplateId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        broadcastId?: string;
        queued?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.broadcastId) {
        toast.error(data.error ?? "Couldn't send. Try again.");
        return;
      }
      toast.success(
        `Broadcast queued — ${data.queued ?? 0} recipients${data.skipped ? ` (${data.skipped} skipped)` : ""}`,
      );
      router.push(saPath(`/broadcasts/${data.broadcastId}`));
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTemplate() {
    if (!agencyId) return;
    const name = window.prompt("Template name");
    if (!name || !name.trim()) return;
    setSavingTemplate(true);
    try {
      await addDoc(collection(getFirebaseDb(), "broadcastTemplates"), {
        agencyId,
        subAccountId,
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || null,
        content,
        createdByUid: user?.uid ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Saved to your templates.");
    } catch {
      toast.error("Couldn't save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  function handlePickTemplate(t: BroadcastTemplateDoc) {
    setSubject(t.subject);
    setPreheader(t.preheader ?? "");
    setBlocks(t.content.blocks);
    setSourceTemplateId(t.id);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a
            href={saPath("/broadcasts")}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Broadcasts
          </a>
          <h1 className="text-2xl font-bold tracking-tight">New broadcast</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setTemplatePickerOpen(true)}>
            <FileText className="mr-1 h-4 w-4" /> Load template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveTemplate}
            disabled={savingTemplate || blocks.length === 0}
          >
            {savingTemplate ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save as template
          </Button>
          <Button type="button" onClick={handleSend} disabled={!canSend}>
            {sending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Send to {audiencePreview.recipients}
          </Button>
        </div>
      </div>

      {missingAddress && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          You need a business mailing address before you can send a broadcast
          — required by CAN-SPAM.{" "}
          <a href={saPath("/dashboard/settings")} className="underline">
            Add it in Settings → Sending preferences
          </a>
          .
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: composer */}
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Input
              placeholder="Subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-base font-medium"
            />
            <Input
              placeholder="Preview text (optional — shown next to the subject in most inboxes)"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Audience</h2>
            <AudienceFilterPicker contacts={contacts} value={audience} onChange={setAudience} />
          </div>

          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    saId={subAccountId}
                    draftId={draftId}
                    onChange={(next) => updateBlock(block.id, next)}
                    onRemove={() => removeBlock(block.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {blocks.length === 0 && (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add your first block below.
              </div>
            )}

            <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/30 p-3">
              {(Object.keys(BLOCK_LABELS) as EmailBlock["type"][]).map((type) => {
                const { label, icon: Icon } = BLOCK_LABELS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addBlock(type)}
                    className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: live preview — the exact rendered email, not an approximation */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Preview</h2>
            {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <iframe
              title="Broadcast preview"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[720px] w-full bg-white"
            />
          </div>
        </div>
      </div>

      <TemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        subAccountId={subAccountId}
        onPick={handlePickTemplate}
      />
    </div>
  );
}

function BlockCard({
  block,
  saId,
  draftId,
  onChange,
  onRemove,
}: {
  block: EmailBlock;
  saId: string;
  draftId: string;
  onChange: (next: EmailBlock) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const { label, icon: Icon } = BLOCK_LABELS[block.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3",
        isDragging && "opacity-60 ring-2 ring-primary/40",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Remove
        </button>
      </div>

      {block.type === "text" && (
        <TextBlockEditor value={block.html} onChange={(html) => onChange({ ...block, html })} />
      )}
      {block.type === "image" && (
        <ImageBlockEditor block={block} saId={saId} draftId={draftId} onChange={onChange} />
      )}
      {block.type === "video" && (
        <VideoBlockEditor block={block} saId={saId} draftId={draftId} onChange={onChange} />
      )}
      {block.type === "button" && <ButtonBlockEditor block={block} onChange={onChange} />}
      {block.type === "divider" && (
        <div className="border-t py-2 text-center text-xs text-muted-foreground">
          A horizontal divider — no settings.
        </div>
      )}
      {block.type === "columns" && <ColumnsBlockEditor block={block} onChange={onChange} />}
    </div>
  );
}
