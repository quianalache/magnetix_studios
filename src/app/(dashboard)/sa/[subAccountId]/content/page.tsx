"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  GitBranch,
  LayoutTemplate,
  BarChart3,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToContentItems,
  createContentItem,
  updateContentItem,
  deleteContentItem,
} from "@/lib/firestore/content-items";
import {
  subscribeToContentTemplates,
  ensureSystemTemplatesSeeded,
  createContentTemplate,
  updateContentTemplate,
  deleteContentTemplate,
  bumpTemplateUseCount,
} from "@/lib/firestore/content-templates";
import { subscribeToSocialPosts } from "@/lib/firestore/social-posts";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import {
  CONTENT_STAGES,
  CONTENT_TYPES,
  type ContentItemDoc,
  type ContentStage,
  type ContentTemplateDoc,
} from "@/types/content-library";
import type { SocialPostDoc } from "@/types/social";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  ContentTemplateDialog,
  type ContentTemplateFormValues,
} from "@/components/content-library/content-template-dialog";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t.value, t.label]),
);

export default function ContentLibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();
  const [items, setItems] = useState<ContentItemDoc[]>([]);
  const [templates, setTemplates] = useState<ContentTemplateDoc[]>([]);
  const [posts, setPosts] = useState<SocialPostDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItemDoc | null>(null);
  const [templateSeed, setTemplateSeed] = useState<ContentTemplateDoc | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplateDoc | null>(null);

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
    const unsubTemplates = subscribeToContentTemplates({ agencyId, subAccountId }, setTemplates);
    const unsubPosts = subscribeToSocialPosts(subAccountId, setPosts);
    void ensureSystemTemplatesSeeded({ agencyId, subAccountId }).catch(() => {});
    return () => {
      unsubItems();
      unsubTemplates();
      unsubPosts();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  // Reflect a linked post's real publish status back onto its card.
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

  async function handleSaveItem(values: ContentItemFormValues) {
    if (!user || !agencyId) return;
    if (editingItem) {
      await updateContentItem(editingItem.id, values);
      toast.success("Saved.");
    } else {
      await createContentItem({ agencyId, subAccountId }, user.uid, values);
      if (templateSeed) void bumpTemplateUseCount(templateSeed.id);
      toast.success("Added to the pipeline.");
    }
  }

  async function handleMove(item: ContentItemDoc, stage: ContentStage) {
    try {
      await updateContentItem(item.id, { stage });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move it");
    }
  }

  async function handleDeleteItem(item: ContentItemDoc) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteContentItem(item.id);
      toast.success("Deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  async function handleSaveTemplate(values: ContentTemplateFormValues) {
    if (!agencyId) return;
    if (editingTemplate) {
      await updateContentTemplate(editingTemplate.id, values);
      toast.success("Template saved.");
    } else {
      await createContentTemplate({ agencyId, subAccountId }, values);
      toast.success("Template created.");
    }
  }

  async function handleDeleteTemplate(tpl: ContentTemplateDoc) {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await deleteContentTemplate(tpl.id);
      toast.success("Template deleted.");
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
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Content"
          description="Plan, produce, and publish — modeled on MomentumOS's real content pipeline."
        />
        {isAdmin && (
          <Button
            className="rounded-full"
            onClick={() => {
              setEditingItem(null);
              setTemplateSeed(null);
              setItemDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            New Content
          </Button>
        )}
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList className="rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="pipeline" className="gap-2 rounded-lg px-5 text-sm">
            <GitBranch className="h-4 w-4" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 rounded-lg px-5 text-sm">
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 rounded-lg px-5 text-sm">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-6 space-y-6">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/30" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-[repeat(10,minmax(200px,1fr))]">
              {CONTENT_STAGES.map((stage) => {
                const stageItems = byStage.get(stage.value) ?? [];
                return (
                  <div key={stage.value} className="min-w-[200px] space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-card px-2 py-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {stage.emoji} {stage.label}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
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
                            setEditingItem(item);
                            setTemplateSeed(null);
                            setItemDialogOpen(true);
                          }}
                          onDelete={() => handleDeleteItem(item)}
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
        </TabsContent>

        <TabsContent value="templates" className="mt-6 space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateDialogOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                New Template
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{tpl.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {tpl.description}
                    </p>
                  </div>
                  {isAdmin && !tpl.isSystem && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Template actions">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingTemplate(tpl);
                            setTemplateDialogOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-accent/40 px-2 py-0.5 text-[10.5px] font-medium text-accent-foreground">
                    {TYPE_LABEL[tpl.contentType] ?? tpl.contentType}
                  </span>
                  {tpl.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-secondary-foreground">
                      <Sparkles className="h-2.5 w-2.5" />
                      Built-in
                    </span>
                  )}
                  <span className="text-[10.5px] text-muted-foreground">
                    Used {tpl.useCount}×
                  </span>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full rounded-full"
                    onClick={() => {
                      setEditingItem(null);
                      setTemplateSeed(tpl);
                      setItemDialogOpen(true);
                    }}
                  >
                    Use template
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
            <BarChart3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <h2 className="text-base font-semibold">Analytics coming soon</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Views, engagement, watch time, and revenue per piece of content — on the way.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <ContentItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        initial={editingItem}
        fromTemplate={templateSeed}
        subAccountId={subAccountId}
        onSave={handleSaveItem}
      />

      <ContentTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        initial={editingTemplate}
        subAccountId={subAccountId}
        onSave={handleSaveTemplate}
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
  const plain = item.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [item.hook, plain].filter(Boolean).join("\n\n") || item.title;
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
  const doneCount = item.checklist.filter((c) => c.done).length;

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
                      {s.emoji} {s.label}
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
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium capitalize text-secondary-foreground">
          {item.priority}
        </span>
      </div>

      {item.hook && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.hook}</p>}

      {item.checklist.length > 0 && (
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          {doneCount}/{item.checklist.length} checklist items
        </p>
      )}

      {!item.linkedSocialPostId && isAdmin && (
        <Button variant="outline" size="sm" className="mt-3 w-full rounded-full" onClick={onSchedule}>
          <Send className="mr-1 h-3.5 w-3.5" />
          Schedule this
        </Button>
      )}
    </div>
  );
}
