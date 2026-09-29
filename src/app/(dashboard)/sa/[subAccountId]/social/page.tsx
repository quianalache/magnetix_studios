"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Link2, List, Loader2, Lock, Plus, Search, Share2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useResilientFeatureGate } from "@/hooks/use-resilient-feature-gate";
import { subscribeToSocialPosts } from "@/lib/firestore/social-posts";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SocialContentCalendar } from "@/components/social/social-content-calendar";
import { SocialContentTab } from "@/components/social/social-content-tab";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import { SocialConnections } from "@/components/social/social-connections";
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
    if (!confirm("Delete this post? Scheduled posts will not publish.")) return;
    const response = await fetch(`/api/sub-accounts/${subAccountId}/social/posts/${post.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) { toast.error(data.error ?? "Could not delete the post."); return; }
    toast.success("Post deleted.");
  }
  function openComposer(post?: SocialPostDoc) { setEditingPost(post ?? null); setComposerOpen(true); }

  if (!gate.known) return <div className="mx-auto flex w-full max-w-5xl justify-center py-16">{gate.timedOut ? <p className="text-sm text-muted-foreground">Couldn&apos;t confirm Social Planner&apos;s status. Try refreshing.</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}</div>;
  if (!gateOn) return <div className="momentum-scope mx-auto w-full max-w-5xl space-y-6"><PlannerHeader /><div className="rounded-2xl border border-dashed bg-card p-10 text-center"><Lock className="mx-auto h-6 w-6 text-muted-foreground" /><h2 className="mt-4 text-base font-semibold">Social Planner is locked by your agency</h2><p className="mt-1 text-sm text-muted-foreground">Ask your agency administrator to enable the Social Planner for this sub-account.</p></div></div>;

  return <div className="momentum-scope mx-auto w-full max-w-7xl space-y-6 rounded-2xl"><div className="flex flex-wrap items-start justify-between gap-4"><PlannerHeader /><div className="flex items-center gap-3"><div className="hidden rounded-xl border bg-card px-4 py-2 text-right sm:block"><p className="flex items-center justify-end gap-1.5 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" />{cfg?.connected ? "Connected" : "Not connected"}</p><p className="text-xs text-muted-foreground">{cfg?.pageName ?? "Facebook + Instagram"}</p></div>{isAdmin && <Button onClick={() => openComposer()} disabled={!canPublish}><Plus className="mr-1 h-4 w-4" />New post</Button>}</div></div>
    <div className="flex items-center gap-1 border-b"><TabButton active={tab === "planner"} onClick={() => setTab("planner")} icon={<CalendarDays className="h-4 w-4" />} label="Planner" /><TabButton active={tab === "content"} onClick={() => setTab("content")} icon={<List className="h-4 w-4" />} label="Content" /><TabButton active={tab === "connections"} onClick={() => setTab("connections")} icon={<Link2 className="h-4 w-4" />} label="Connections" /></div>
    {tab === "connections" ? <SocialConnections /> : tab === "content" ? <SocialContentTab posts={posts} onEdit={openComposer} onSchedule={openComposer} onDelete={deletePost} /> : <PlannerView posts={filteredPosts} allPosts={posts} loaded={loaded} view={view} setView={setView} channel={channel} setChannel={setChannel} status={status} setStatus={setStatus} search={search} setSearch={setSearch} upcoming={upcoming} onSelectPost={setSelectedPost} />}
    <SocialPostComposer open={composerOpen} onOpenChange={(open) => { setComposerOpen(open); if (!open) setEditingPost(null); }} subAccountId={subAccountId} canFacebook={canFacebook} canInstagram={canInstagram} pageName={cfg?.pageName ?? null} igUsername={cfg?.instagramUsername ?? null} editingPost={editingPost} />
    <PostDetails post={selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)} />
  </div>;
}

function PlannerView({ posts, allPosts, loaded, view, setView, channel, setChannel, status, setStatus, search, setSearch, upcoming, onSelectPost }: { posts: SocialPostDoc[]; allPosts: SocialPostDoc[]; loaded: boolean; view: "month" | "week" | "list"; setView: (view: "month" | "week" | "list") => void; channel: "all" | "facebook" | "instagram"; setChannel: (value: "all" | "facebook" | "instagram") => void; status: "all" | "draft" | "scheduled" | "published"; setStatus: (value: "all" | "draft" | "scheduled" | "published") => void; search: string; setSearch: (value: string) => void; upcoming: SocialPostDoc[]; onSelectPost: (post: SocialPostDoc) => void }) {
  return <div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts…" className="pl-9" /></div><select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="published">Published</option></select><div className="ml-auto flex rounded-md border p-0.5"><ViewButton active={view === "month"} onClick={() => setView("month")} label="Month" /><ViewButton active={view === "week"} onClick={() => setView("week")} label="Week" /><ViewButton active={view === "list"} onClick={() => setView("list")} label="List" /></div></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><div>{!loaded ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : <SocialContentCalendar posts={posts} view={view} onSelectPost={onSelectPost} />}</div><aside className="space-y-5"><section className="rounded-2xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Upcoming posts</h2><span className="text-xs text-primary">{upcoming.length}</span></div>{upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No scheduled posts yet.</p> : <div className="space-y-3">{upcoming.map((post) => <button key={post.id} type="button" onClick={() => onSelectPost(post)} className="flex w-full items-center gap-3 text-left"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">{post.imageUrl ? <img src={post.imageUrl} alt="" className="h-full w-full object-cover" /> : <Share2 className="h-4 w-4 text-muted-foreground" />}</div><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{toDate(post.scheduledAt)?.toLocaleString()}</p><p className="truncate text-sm font-medium">{post.caption || "Untitled post"}</p></div></button>)}</div>}</section><section className="rounded-2xl border bg-card p-4"><h2 className="mb-3 text-sm font-semibold">Content ideas</h2><div className="space-y-2">{["Product announcement", "Behind the scenes", "Client testimonial", "Tips & education", "Engagement post"].map((idea) => <div key={idea} className="rounded-xl border p-3 text-sm font-medium">{idea}</div>)}</div></section></aside></div><p className="text-xs text-muted-foreground">Showing {posts.length} of {allPosts.length} posts. Drafts remain in Content until scheduled.</p></div>;
}

function PostDetails({ post, onOpenChange }: { post: SocialPostDoc | null; onOpenChange: (open: boolean) => void }) { return <Dialog open={!!post} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Post details</DialogTitle><DialogDescription>Review the saved post and its publishing status.</DialogDescription></DialogHeader>{post && <div className="space-y-3"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-1 capitalize">{post.status}</span>{post.targets.map((target) => <span key={target} className="rounded-full bg-muted px-2 py-1 capitalize">{target}</span>)}</div><p className="whitespace-pre-wrap text-sm">{post.caption || "No caption"}</p>{post.imageUrl && <img src={post.imageUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />}</div>}</DialogContent></Dialog>; }
function PlannerHeader() { return <div className="min-w-0"><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Share2 className="h-5 w-5" />Social Planner<span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">Beta</span></h1><p className="mt-1 text-sm text-muted-foreground">Schedule posts to your Facebook Page and Instagram. They publish automatically at the time you pick.</p></div>; }
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{icon}{label}</button>; }
function ViewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" onClick={onClick} className={cn("rounded px-2.5 py-1 text-xs", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>{label}</button>; }
