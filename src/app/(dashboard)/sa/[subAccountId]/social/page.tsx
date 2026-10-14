"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Link2, List, Plus, Share2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useResilientFeatureGate } from "@/hooks/use-resilient-feature-gate";
import { subscribeToSocialPosts } from "@/lib/firestore/social-posts";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { FilterBar } from "@/components/system/filter-bar";
import { SearchField } from "@/components/system/search-field";
import { LockedNotice } from "@/components/system/locked-notice";
import { StatusPill, Tag } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SocialContentCalendar } from "@/components/social/social-content-calendar";
import { SocialContentTab } from "@/components/social/social-content-tab";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import { SocialConnections } from "@/components/social/social-connections";
import { ContentIdeas } from "@/components/social/content-ideas";
import type { SocialPostDoc } from "@/types/social";

function toDate(v: unknown): Date | null { if (!v) return null; if (v instanceof Date) return v; const candidate = v as { toDate?: () => Date; seconds?: number }; if (typeof candidate.toDate === "function") return candidate.toDate(); return typeof candidate.seconds === "number" ? new Date(candidate.seconds * 1000) : null; }

export default function SocialPlannerPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gate = useResilientFeatureGate({ field: "socialPlannerEnabledByAgency", fallbackKey: "socialPlannerEnabled" });
  const [posts, setPosts] = useState<SocialPostDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"planner" | "content" | "connections">("planner");
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [channel, setChannel] = useState<"all" | "facebook" | "instagram">("all");
  const [status, setStatus] = useState<"all" | "draft" | "scheduled" | "published">("all");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPostDoc | null>(null);
  const [selectedPost, setSelectedPost] = useState<SocialPostDoc | null>(null);
  const { confirm: confirmDialog, dialog: confirmElement } = useConfirm();

  const gateOn = gate.known && gate.enabled;
  const cfg = subAccount?.metaConfig ?? null;
  const canPublish = metaCanPublish(cfg);
  const canFacebook = canPublish && !!cfg?.pageId;
  const canInstagram = canPublish && !!cfg?.instagramBusinessAccountId;

  useEffect(() => {
    if (!subAccountId || !gateOn) return;
    const unsubscribe = safeSubscribe(() => subscribeToSocialPosts(subAccountId, (list) => { setPosts(list); setLoaded(true); }, () => setLoaded(true)), () => setLoaded(true));
    return () => unsubscribe?.();
  }, [subAccountId, gateOn]);

  const filteredPosts = useMemo(() => posts.filter((post) => {
    const channelMatch = channel === "all" || post.targets.includes(channel);
    const statusMatch = status === "all" || post.status === status;
    const textMatch = !search.trim() || post.caption.toLowerCase().includes(search.trim().toLowerCase());
    return channelMatch && statusMatch && textMatch;
  }), [channel, posts, search, status]);
  const upcoming = useMemo(() => posts.filter((post) => post.status === "scheduled" && (toDate(post.scheduledAt)?.getTime() ?? 0) >= Date.now()).sort((a, b) => (toDate(a.scheduledAt)?.getTime() ?? 0) - (toDate(b.scheduledAt)?.getTime() ?? 0)).slice(0, 5), [posts]);

  async function deletePost(post: SocialPostDoc) {
    const ok = await confirmDialog({ title: "Delete this post?", description: "Scheduled posts will not publish.", confirmLabel: "Delete post", tone: "danger" });
    if (!ok) return;
    const response = await fetch(`/api/sub-accounts/${subAccountId}/social/posts/${post.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) { toast.error(data.error ?? "Could not delete the post."); return; }
    toast.success("Post deleted.");
  }
  async function unschedulePost(post: SocialPostDoc) {
    const response = await fetch(`/api/sub-accounts/${subAccountId}/social/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: post.caption, imageUrl: post.imageUrl, targets: post.targets, status: "draft", scheduledAt: null }) });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) { toast.error(data.error ?? "Could not unschedule the post."); return; }
    toast.success("Post unscheduled and saved as a draft.");
    setSelectedPost(null);
  }
  function openComposer(post?: SocialPostDoc) { setEditingPost(post ?? null); setComposerOpen(true); }

  const header = (
    <PageHeader
      title="Social Planner"
      icon={Share2}
      eyebrow="Beta"
      description="Schedule posts to your Facebook Page and Instagram. They publish automatically at the time you pick."
      actions={gateOn && isAdmin ? <Button onClick={() => openComposer()} disabled={!canPublish}><Plus className="h-4 w-4" />New post</Button> : undefined}
    />
  );

  if (!gate.known) {
    return gate.timedOut
      ? <PageShell width="wide">{header}<p className="text-body-sm text-muted-foreground">Couldn&apos;t confirm Social Planner&apos;s status. Try refreshing.</p></PageShell>
      : <PageShellLoading width="wide" />;
  }
  if (!gateOn) {
    return (
      <PageShell width="wide">
        {header}
        <LockedNotice title="Social Planner is locked by your agency">Ask your agency administrator to enable the Social Planner for this sub-account.</LockedNotice>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      {header}
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList variant="underline" className="w-full justify-start gap-5 overflow-x-auto border-b border-border">
          <TabsTrigger value="planner"><CalendarDays />Planner</TabsTrigger>
          <TabsTrigger value="content"><List />Content</TabsTrigger>
          <TabsTrigger value="connections"><Link2 />Connections</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "connections" ? <SocialConnections /> : tab === "content" ? <SocialContentTab posts={posts} onEdit={openComposer} onSchedule={openComposer} onDelete={deletePost} /> : <PlannerView posts={filteredPosts} allPosts={posts} loaded={loaded} view={view} setView={setView} channel={channel} setChannel={setChannel} status={status} setStatus={setStatus} search={search} setSearch={setSearch} upcoming={upcoming} onSelectPost={setSelectedPost} />}
      <SocialPostComposer open={composerOpen} onOpenChange={(open) => { setComposerOpen(open); if (!open) setEditingPost(null); }} subAccountId={subAccountId} canFacebook={canFacebook} canInstagram={canInstagram} pageName={cfg?.pageName ?? null} igUsername={cfg?.instagramUsername ?? null} editingPost={editingPost} />
      <PostDetails post={selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)} onEdit={(post) => { setSelectedPost(null); openComposer(post); }} onDelete={deletePost} onUnschedule={unschedulePost} />
      {confirmElement}
    </PageShell>
  );
}

const CHANNEL_ITEMS = { all: "All channels", facebook: "Facebook", instagram: "Instagram" };
const STATUS_ITEMS = { all: "All statuses", draft: "Drafts", scheduled: "Scheduled", published: "Published" };
const POST_STATUS_TONE = { draft: "neutral", scheduled: "scheduled", publishing: "warning", published: "success", failed: "danger" } as const;
const RESULT_TONE = (status: string) => (status === "failed" ? "danger" : status === "published" ? "success" : "neutral") as "danger" | "success" | "neutral";
const CARD = "rounded-card border border-border bg-card shadow-card";

function PlannerView({ posts, allPosts, loaded, view, setView, channel, setChannel, status, setStatus, search, setSearch, upcoming, onSelectPost }: { posts: SocialPostDoc[]; allPosts: SocialPostDoc[]; loaded: boolean; view: "month" | "week" | "list"; setView: (view: "month" | "week" | "list") => void; channel: "all" | "facebook" | "instagram"; setChannel: (value: "all" | "facebook" | "instagram") => void; status: "all" | "draft" | "scheduled" | "published"; setStatus: (value: "all" | "draft" | "scheduled" | "published") => void; search: string; setSearch: (value: string) => void; upcoming: SocialPostDoc[]; onSelectPost: (post: SocialPostDoc) => void }) {
  return (
    <div className="space-y-5">
      <FilterBar
        search={<SearchField value={search} onChange={setSearch} placeholder="Search posts…" aria-label="Search posts" />}
        filters={
          <>
            <Select value={channel} onValueChange={(value) => value && setChannel(value as typeof channel)} items={CHANNEL_ITEMS}>
              <SelectTrigger aria-label="Channel" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CHANNEL_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => value && setStatus(value as typeof status)} items={STATUS_ITEMS}>
              <SelectTrigger aria-label="Status" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        }
        actions={<SegmentedControl value={view} onChange={setView} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "list", label: "List" }]} />}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">{!loaded ? <Skeleton className="h-[480px] w-full rounded-card" /> : <SocialContentCalendar posts={posts} view={view} onSelectPost={onSelectPost} />}</div>
        <aside className="space-y-5">
          <section className={cn(CARD, "p-4")}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-section font-semibold">Upcoming posts</h2><Tag color="violet">{upcoming.length}</Tag></div>
            {upcoming.length === 0 ? <p className="text-body-sm text-muted-foreground">No scheduled posts yet.</p> : <div className="space-y-3">{upcoming.map((post) => <button key={post.id} type="button" onClick={() => onSelectPost(post)} className="flex w-full items-center gap-3 rounded-control text-left hover:bg-tint-violet"><div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-sunken">{post.imageUrl ? <img src={post.imageUrl} alt="" className="h-full w-full object-cover" /> : <Share2 className="h-4 w-4 text-muted-foreground" />}</div><div className="min-w-0"><p className="text-caption text-muted-foreground">{toDate(post.scheduledAt)?.toLocaleString()}</p><p className="truncate text-body-sm font-medium">{post.caption || "Untitled post"}</p></div></button>)}</div>}
          </section>
          <ContentIdeas />
        </aside>
      </div>
      <p className="text-caption text-muted-foreground">Showing {posts.length} of {allPosts.length} posts. Drafts remain in Content until scheduled.</p>
    </div>
  );
}

function PostDetails({ post, onOpenChange, onEdit, onDelete, onUnschedule }: { post: SocialPostDoc | null; onOpenChange: (open: boolean) => void; onEdit: (post: SocialPostDoc) => void; onDelete: (post: SocialPostDoc) => void; onUnschedule: (post: SocialPostDoc) => void }) {
  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Local time";
  return <Dialog open={!!post} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Feed post details</DialogTitle><DialogDescription>Review the complete saved post, publishing status, and provider results.</DialogDescription></DialogHeader>{post && <div className="space-y-4"><div className="flex flex-wrap gap-2"><StatusPill tone={POST_STATUS_TONE[post.status]} className="capitalize">{post.status}</StatusPill>{post.targets.map((target) => <Tag key={target} color={target === "facebook" ? "blue" : "pink"} className="capitalize">{target}</Tag>)}</div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Post type</dt><dd>Feed</dd></div><div><dt className="text-xs text-muted-foreground">Platforms</dt><dd className="capitalize">{post.targets.join(", ") || "None selected"}</dd></div><div><dt className="text-xs text-muted-foreground">Scheduled date/time</dt><dd>{toDate(post.scheduledAt)?.toLocaleString() ?? "Not scheduled"}</dd></div><div><dt className="text-xs text-muted-foreground">Timezone</dt><dd>{timezone}</dd></div><div><dt className="text-xs text-muted-foreground">Published date/time</dt><dd>{toDate(post.publishedAt)?.toLocaleString() ?? "Not published"}</dd></div><div><dt className="text-xs text-muted-foreground">QStash job</dt><dd className="truncate">{post.qstashMessageId ?? "None"}</dd></div></dl><section className="space-y-2"><h3 className="text-sm font-semibold">Caption</h3><p className="whitespace-pre-wrap rounded-control border border-border bg-surface-sunken p-3 text-body-sm">{post.caption || "No caption"}</p></section>{post.imageUrl && <section className="space-y-2"><h3 className="text-sm font-semibold">Media preview</h3><img src={post.imageUrl} alt="Feed post media" className="max-h-80 w-full rounded-control object-contain" /></section>}<section className="space-y-2"><h3 className="text-sm font-semibold">Publishing results</h3>{post.results.length ? <ul className="space-y-2">{post.results.map((result) => <li key={result.platform} className="rounded-control border border-border p-3 text-body-sm"><div className="flex items-center justify-between"><span className="font-medium capitalize">{result.platform}</span><StatusPill tone={RESULT_TONE(result.status)} className="capitalize">{result.status}</StatusPill></div>{result.error && <p className="mt-1 text-xs text-destructive">{result.error}</p>}{result.providerUrl && <a className="mt-1 inline-block text-xs text-link underline" href={result.providerUrl} target="_blank" rel="noreferrer">View published post</a>}{result.externalId && !result.providerUrl && <p className="mt-1 break-all text-xs text-muted-foreground">Provider reference: {result.externalId}</p>}</li>)}</ul> : <p className="text-sm text-muted-foreground">No provider result yet.</p>}</section><div className="flex flex-wrap justify-end gap-2">{post.status !== "published" && <Button type="button" variant="outline" onClick={() => onEdit(post)}>{post.status === "scheduled" ? "Edit / Reschedule" : "Edit"}</Button>}{post.status === "scheduled" && <Button type="button" variant="secondary" onClick={() => void onUnschedule(post)}>Unschedule</Button>}{post.status !== "published" && <Button type="button" variant="ghost" onClick={() => void onDelete(post)}>Delete / Cancel</Button>}</div></div>}</DialogContent></Dialog>;
}
