"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Star,
  Leaf,
  Send,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToContentItems,
  createContentItem,
  updateContentItem,
  deleteContentItem,
} from "@/lib/firestore/content-items";
import { subscribeToSocialPosts } from "@/lib/firestore/social-posts";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import {
  CONTENT_STAGES,
  CONTENT_TYPES,
  type ContentItemDoc,
  type ContentStage,
} from "@/types/content-library";
import type { SocialPostDoc } from "@/types/social";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import {
  ContentItemDialog,
  type ContentItemFormValues,
} from "@/components/content-library/content-item-dialog";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t.value, t.label]),
);

export default function ContentLibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();
  const [items, setItems] = useState<ContentItemDoc[]>([]);
  const [posts, setPosts] = useState<SocialPostDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItemDoc | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<ContentItemDoc | null>(null);
  const syncedRef = useRef(new Set<string>());

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsubItems = subscribeToContentItems(
      { agencyId, subAccountId },
      (list) => {
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubPosts = subscribeToSocialPosts(subAccountId, setPosts);
    return () => {
      unsubItems();
      unsubPosts();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  // Reflect a linked post's real publish status back onto its card — once
  // per (item, transition) so a slow connection doesn't loop writes.
  useEffect(() => {
    for (const item of items) {
      if (!item.linkedSocialPostId || item.stage === "published") continue;
      const post = posts.find((p) => p.id === item.linkedSocialPostId);
      if (post?.status !== "published") continue;
      const key = `${item.id}:published`;
      if (syncedRef.current.has(key)) continue;
      syncedRef.current.add(key);
      void updateContentItem(item.id, { stage: "published" }).catch(() => {});
    }
  }, [items, posts]);

  const cfg = subAccount?.metaConfig ?? null;
  const canPublish = metaCanPublish(cfg);
  const canFacebook = canPublish && !!cfg?.pageId;
  const canInstagram = canPublish && !!cfg?.instagramBusinessAccountId;
  const socialReady = subAccount?.socialPlannerEnabledByAgency === true && canPublish;

  const byStage = useMemo(() => {
    const m = new Map<ContentStage, ContentItemDoc[]>();
    for (const s of CONTENT_STAGES) m.set(s.value, []);
    for (const item of items) m.get(item.stage)?.push(item);
    return m;
  }, [items]);

  async function handleSave(values: ContentItemFormValues) {
    if (!user || !agencyId) return;
    if (editing) {
      await updateContentItem(editing.id, values);
      toast.success("Saved.");
    } else {
      await createContentItem({ agencyId, subAccountId }, user.uid, values);
      toast.success("Added to the library.");
    }
  }

  async function handleMove(item: ContentItemDoc, stage: ContentStage) {
    try {
      await updateContentItem(item.id, { stage });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move it");
    }
  }

  async function handleDelete(item: ContentItemDoc) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteContentItem(item.id);
      toast.success("Deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  function openScheduler(item: ContentItemDoc) {
    if (!socialReady) {
      toast.error(
        subAccount?.socialPlannerEnabledByAgency !== true
          ? "Social Planner isn't turned on for this sub-account yet."
          : "Connect Facebook/Instagram in Social Planner → Connections first.",
      );
      return;
    }
    setSchedulingItem(item);
    setComposerOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Content Library"
        description="Plan ideas before they're ready to schedule — the Social Planner still owns the actual posting."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            New idea
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 overflow-x-auto lg:grid-cols-5">
          {CONTENT_STAGES.map((stage) => {
            const stageItems = byStage.get(stage.value) ?? [];
            return (
              <div key={stage.value} className="min-w-[220px] space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {stage.label}
                  </h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {stageItems.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageItems.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onEdit={() => {
                        setEditing(item);
                        setDialogOpen(true);
                      }}
                      onDelete={() => handleDelete(item)}
                      onMove={(s) => handleMove(item, s)}
                      onSchedule={() => openScheduler(item)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ContentItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={handleSave}
      />

      <SocialPostComposer
        open={composerOpen}
        onOpenChange={(o) => {
          setComposerOpen(o);
          if (!o) setSchedulingItem(null);
        }}
        subAccountId={subAccountId}
        canFacebook={canFacebook}
        canInstagram={canInstagram}
        pageName={cfg?.pageName ?? null}
        igUsername={cfg?.instagramUsername ?? null}
        initialCaption={schedulingItem ? seedCaption(schedulingItem) : ""}
        onCreated={(postId) => {
          if (!schedulingItem) return;
          void updateContentItem(schedulingItem.id, {
            linkedSocialPostId: postId,
            stage: "scheduled",
          });
          setSchedulingItem(null);
        }}
      />
    </div>
  );
}

function seedCaption(item: ContentItemDoc): string {
  return [item.hook, item.notes].filter(Boolean).join("\n\n") || item.title;
}

function ContentCard({
  item,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onSchedule,
}: {
  item: ContentItemDoc;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (stage: ContentStage) => void;
  onSchedule: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary hover:underline"
        >
          {item.title}
        </button>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" aria-label="Content actions" className="h-6 w-6 p-0">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {CONTENT_STAGES.filter((s) => s.value !== item.stage).map((s) => (
                    <DropdownMenuItem key={s.value} onClick={() => onMove(s.value)}>
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-accent/40 px-2 py-0.5 text-[10.5px] font-medium text-accent-foreground">
          {TYPE_LABEL[item.contentType] ?? item.contentType}
        </span>
        {item.isEvergreen && (
          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground" title="Evergreen">
            <Leaf className="h-3 w-3" />
          </span>
        )}
        {item.isFavorite && (
          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-amber-500" title="Favorite">
            <Star className="h-3 w-3 fill-current" />
          </span>
        )}
      </div>

      {item.hook && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.hook}</p>
      )}

      {!item.linkedSocialPostId && isAdmin && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={onSchedule}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          Schedule this
        </Button>
      )}
    </div>
  );
}
