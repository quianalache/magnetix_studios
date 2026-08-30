"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GitBranch, LayoutTemplate, BarChart3, Plus, Lightbulb } from "lucide-react";
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
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import {
  emptyContentItem,
  type ContentItemDoc,
  type ContentStage,
  type ContentTemplateDoc,
} from "@/types/content-library";
import type { SocialPostDoc } from "@/types/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import {
  ContentItemDialog,
  type ContentItemFormValues,
} from "@/components/content-library/content-item-dialog";
import {
  ContentTemplateDialog,
  type ContentTemplateFormValues,
} from "@/components/content-library/content-template-dialog";
import { PipelineTab } from "@/components/content-library/pipeline-tab";
import { TemplatesTab } from "@/components/content-library/templates-tab";

export default function ContentLibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();
  // Resilient read (2026-08-30 CRM-wide stability pass, same precedence
  // model as useResilientList): server-verified data is the reliable
  // baseline; each live listener is a pure enhancement, trusted only once
  // it has actually delivered — an unavailable/degraded listener can
  // never overwrite known-good data with an empty array. Custom (not the
  // shared hook) because this page needs items AND templates from one
  // shared server fetch, not two separate requests to the same route.
  const [serverState, setServerState] = useState<{
    loaded: boolean;
    items: ContentItemDoc[];
    templates: ContentTemplateDoc[];
  }>({ loaded: false, items: [], templates: [] });
  const [liveItems, setLiveItems] = useState<ContentItemDoc[] | null>(null);
  const [liveTemplates, setLiveTemplates] = useState<ContentTemplateDoc[] | null>(null);
  const [posts, setPosts] = useState<SocialPostDoc[]>([]);
  const items = liveItems ?? serverState.items;
  const templates = liveTemplates ?? serverState.templates;
  const loading = !serverState.loaded && liveItems === null;

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItemDoc | null>(null);
  const [templateSeed, setTemplateSeed] = useState<ContentTemplateDoc | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplateDoc | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<ContentItemDoc | null>(null);

  const [quickIdeaOpen, setQuickIdeaOpen] = useState(false);
  const [quickIdeaTitle, setQuickIdeaTitle] = useState("");
  const [quickIdeaSaving, setQuickIdeaSaving] = useState(false);

  const syncedRef = useRef(new Set<string>());

  // Server-verified baseline — the reliable fallback whenever the live
  // listeners below haven't delivered (including "never").
  useEffect(() => {
    if (authLoading || !user || !subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/content`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("content fetch failed"))))
      .then((json: { items?: ContentItemDoc[]; templates?: ContentTemplateDoc[] }) => {
        if (cancelled) return;
        setServerState({
          loaded: true,
          items: json.items ?? [],
          templates: json.templates ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) {
          setServerState((prev) =>
            prev.loaded ? prev : { loaded: true, items: [], templates: [] },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, subAccountId, authLoading]);

  // Live listeners — pure enhancement. Each onSnapshot registration is
  // wrapped in safeSubscribe: a currently-open upstream Firestore JS SDK
  // bug (firebase-js-sdk#9267) can make registration throw synchronously
  // instead of routing the failure through its own onError callback,
  // which previously could crash this page (see safeSubscribe's own doc
  // comment for the full explanation, first found and fixed for
  // Community/Courses).
  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsubItems = safeSubscribe(
      () =>
        subscribeToContentItems(
          { agencyId, subAccountId },
          (list) => setLiveItems(list),
          () => {},
        ),
      () => {},
    );
    const unsubTemplates = safeSubscribe(
      () =>
        subscribeToContentTemplates({ agencyId, subAccountId }, (list) =>
          setLiveTemplates(list),
        ),
      () => {},
    );
    const unsubPosts = safeSubscribe(
      () => subscribeToSocialPosts(subAccountId, setPosts),
      () => {},
    );
    void ensureSystemTemplatesSeeded({ agencyId, subAccountId }).catch(() => {});
    return () => {
      unsubItems?.();
      unsubTemplates?.();
      unsubPosts?.();
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

  async function handleSaveItem(
    values: ContentItemFormValues & { publishDate: Date | null; deadline: Date | null },
  ) {
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

  async function handleQuickIdea() {
    if (!user || !agencyId || !quickIdeaTitle.trim()) return;
    setQuickIdeaSaving(true);
    try {
      await createContentItem({ agencyId, subAccountId }, user.uid, {
        ...emptyContentItem(),
        title: quickIdeaTitle.trim(),
      });
      toast.success("Idea captured.");
      setQuickIdeaTitle("");
      setQuickIdeaOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setQuickIdeaSaving(false);
    }
  }

  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">Content Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your creator workflow — from idea to impact.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Popover open={quickIdeaOpen} onOpenChange={setQuickIdeaOpen}>
              <PopoverTrigger className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary/60 px-4 text-sm font-semibold text-foreground">
                <Lightbulb className="h-3.5 w-3.5" />
                Quick Idea
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Capture a quick idea</p>
                <Input
                  value={quickIdeaTitle}
                  onChange={(e) => setQuickIdeaTitle(e.target.value)}
                  placeholder="Content title..."
                  className="rounded-xl bg-muted/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleQuickIdea();
                    }
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  className="w-full rounded-full"
                  disabled={!quickIdeaTitle.trim() || quickIdeaSaving}
                  onClick={handleQuickIdea}
                >
                  {quickIdeaSaving ? "Adding…" : "Add Idea"}
                </Button>
              </PopoverContent>
            </Popover>
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
          </div>
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
            <span className="rounded-full bg-card px-1.5 py-0.5 font-mono text-[10.5px]">
              {templates.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 rounded-lg px-5 text-sm">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-6">
          <PipelineTab
            items={items}
            loading={loading}
            isAdmin={isAdmin}
            onEdit={(item) => {
              setEditingItem(item);
              setTemplateSeed(null);
              setItemDialogOpen(true);
            }}
            onDelete={handleDeleteItem}
            onMove={handleMove}
            onSchedule={openScheduler}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <TemplatesTab
            templates={templates}
            isAdmin={isAdmin}
            onUse={(tpl) => {
              setEditingItem(null);
              setTemplateSeed(tpl);
              setItemDialogOpen(true);
            }}
            onEdit={(tpl) => {
              setEditingTemplate(tpl);
              setTemplateDialogOpen(true);
            }}
            onDelete={handleDeleteTemplate}
            onNew={() => {
              setEditingTemplate(null);
              setTemplateDialogOpen(true);
            }}
          />
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
