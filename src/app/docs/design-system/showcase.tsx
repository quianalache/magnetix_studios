"use client";

import { useState, type ReactNode } from "react";
import { Bell, FileText, Inbox, LayoutDashboard, Plus, Search, Settings, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, type PageShellWidth } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SectionHeader } from "@/components/system/section-header";
import { SettingsSection } from "@/components/system/settings-section";
import { STATUS_TONE, StatusPill, Tag, type StatusTone } from "@/components/system/status-pill";
import { EmptyState } from "@/components/system/empty-state";
import { ConfirmDialog, useConfirm } from "@/components/system/confirm-dialog";
import { SearchField } from "@/components/system/search-field";
import { FilterBar } from "@/components/system/filter-bar";
import { Pagination } from "@/components/system/pagination";

function Block({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-card border border-border bg-card p-5 shadow-card">
      <SectionHeader title={title} description={note} />
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

const STATUS_ITEMS = { draft: "Draft", active: "Active", archived: "Archived" };

export function DesignSystemShowcase() {
  const [select, setSelect] = useState<string | null>("active");
  const [seg, setSeg] = useState<"all" | "published" | "draft">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(2);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastConfirm, setLastConfirm] = useState<string>("—");
  const { confirm, dialog } = useConfirm();

  return (
    <div className="px-4 py-8 md:px-6">
      <PageShell width="data">
        <PageHeader
          variant="moment"
          motif="sparks"
          eyebrow="Internal · QA only"
          title="Magnetix design system"
          description="Every shared primitive and system composite in one place. Check here first when a shared component changes."
        />

        <Block id="buttons" title="Buttons" note="Primary = deep plum; secondary = white with border; focus = violet ring. Default 38px, sm 32px, lg/touch 44px.">
          <div className="flex flex-wrap items-center gap-2">
            <Button><Plus /> New resource</Button>
            <Button variant="secondary"><Upload /> Import</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive"><Trash2 /> Delete</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small 32</Button>
            <Button>Default 38</Button>
            <Button size="lg">Large 44</Button>
            <Button size="touch">Touch 44</Button>
            <Button size="icon" variant="outline" aria-label="Search"><Search /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Notifications"><Bell /></Button>
            <Button size="icon-lg" variant="secondary" aria-label="Settings"><Settings /></Button>
          </div>
        </Block>

        <Block id="controls" title="Form controls" note="38px controls, system border, violet focus ring, readable disabled and error states.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="ds-name">Business name</Label><Input id="ds-name" defaultValue="Magnetix Studios" /></div>
            <div className="grid gap-1.5"><Label htmlFor="ds-err">Postal code</Label><Input id="ds-err" defaultValue="787" aria-invalid /><p className="text-caption text-status-danger-fg">Enter a 5-digit ZIP code</p></div>
            <div className="grid gap-1.5"><Label htmlFor="ds-dis">Disabled</Label><Input id="ds-dis" defaultValue="Locked by your agency" disabled /></div>
            <div className="grid gap-1.5">
              <Label>Status (Select)</Label>
              <Select value={select} onValueChange={setSelect} items={STATUS_ITEMS}>
                <SelectTrigger aria-label="Status"><SelectValue placeholder="Choose a status" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_ITEMS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="ds-notes">Notes</Label><Textarea id="ds-notes" placeholder="Write a note…" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <label className="flex items-center gap-2"><Checkbox defaultChecked /> Checkbox</label>
            <label className="flex items-center gap-2"><Switch defaultChecked /> Switch</label>
            <RadioGroup defaultValue="now" aria-label="Send mode" className="flex gap-4">
              <label className="flex items-center gap-2"><RadioGroupItem value="now" /> Send now</label>
              <label className="flex items-center gap-2"><RadioGroupItem value="later" /> Schedule</label>
            </RadioGroup>
          </div>
        </Block>

        <Block id="tabs" title="Tabs + segmented control" note="Underline switches views of one record; pill switches areas of a page. Both scroll sideways inside the strip on phones.">
          <Tabs defaultValue="overview">
            <TabsList variant="underline">
              <TabsTrigger value="overview"><LayoutDashboard /> Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-muted-foreground">Underline tab content.</TabsContent>
            <TabsContent value="activity" className="text-muted-foreground">Activity.</TabsContent>
            <TabsContent value="notes" className="text-muted-foreground">Notes.</TabsContent>
            <TabsContent value="files" className="text-muted-foreground">Files.</TabsContent>
          </Tabs>
          <Tabs defaultValue="library">
            <TabsList variant="pill">
              <TabsTrigger value="library"><FileText /> Resource library</TabsTrigger>
              <TabsTrigger value="crm">CRM resources</TabsTrigger>
              <TabsTrigger value="media">Media library</TabsTrigger>
            </TabsList>
          </Tabs>
          <SegmentedControl value={seg} onChange={setSeg} options={[{ value: "all", label: "All" }, { value: "published", label: "Published" }, { value: "draft", label: "Draft" }]} />
        </Block>

        <Block id="cards" title="Cards" note="White by default. Tint is a restrained supporting treatment for one featured card — never the page, never nested.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader><CardTitle>Default</CardTitle><CardDescription>White, 1px line, soft shadow.</CardDescription></CardHeader></Card>
            <Card variant="interactive" tabIndex={0}><CardHeader><CardTitle>Interactive</CardTitle><CardDescription>Hover or focus me.</CardDescription></CardHeader></Card>
            <Card size="sm"><CardHeader><CardTitle>Small</CardTitle><CardDescription>Tighter padding.</CardDescription></CardHeader></Card>
            {(["violet", "blush", "aqua", "gold"] as const).map((t) => (
              <Card key={t} variant="tint" tint={t}><CardHeader><CardTitle>Tint · {t}</CardTitle><CardDescription>Featured section only.</CardDescription></CardHeader><CardContent /></Card>
            ))}
          </div>
        </Block>

        <Block id="status" title="Status pills vs tags" note="StatusPill = state (semantic colors, dot). Tag = category (rotating accents, no dot).">
          <div className="flex flex-wrap gap-2">
            {(["success", "warning", "danger", "info", "scheduled", "neutral"] as StatusTone[]).map((t) => <StatusPill key={t} tone={t}>{t}</StatusPill>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(STATUS_TONE).slice(0, 12).map((s) => <StatusPill key={s} status={s}>{s[0].toUpperCase() + s.slice(1)}</StatusPill>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {["Guide", "Branding", "Podcast", "Launches", "Client experience", "Checklist", "Operations", "Design asset"].map((t) => <Tag key={t}>{t}</Tag>)}
            <Tag color="gray">Uncategorized</Tag>
          </div>
        </Block>

        <Block id="alerts" title="Alerts">
          <Alert tone="info" title="Webhook URL copied">Paste it into the Meta app&apos;s Webhooks settings.</Alert>
          <Alert tone="warning" title="Broadcasts are paused">A physical mailing address is required.</Alert>
          <Alert tone="success" title="Domain verified">Emails now send from your domain.</Alert>
          <Alert tone="danger" title="Publish failed">Instagram needs a public image URL.</Alert>
          <Alert tone="neutral" title="Heads up">Neutral, for non-status notes.</Alert>
        </Block>

        <Block id="empty" title="Empty states + loading">
          <div className="grid gap-4 sm:grid-cols-2">
            <EmptyState icon={Inbox} title="No conversations yet" description="Messages from SMS, WhatsApp and web chat land here." action={<Button size="sm"><Plus /> New message</Button>} />
            <EmptyState sparks title="Broadcast sent" description="Spark motif — first-run and success moments only." compact />
          </div>
          <div className="grid gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full rounded-card" /></div>
        </Block>

        <Block id="headers" title="Page headers" note="Operational (system sans) for tools; moment (DM Serif Display + optional motif) for approved moment pages only.">
          <div className="rounded-xl border border-dashed border-border-strong p-4">
            <PageHeader title="Payment settings" description="How clients pay you." breadcrumbs="Settings / Payments" actions={<Button size="sm">Save</Button>} />
          </div>
          <div className="rounded-xl border border-dashed border-border-strong p-4">
            <PageHeader variant="moment" motif="constellation" eyebrow="Energetic Decoder" title="Content Sets" description="Reusable interpretation content for your reports." />
          </div>
        </Block>

        <Block id="settings" title="Settings section">
          <SettingsSection title="Sender identity" description="Replies go straight to this inbox." action={<StatusPill status="active">On</StatusPill>} footer={<><Button variant="outline" size="sm">Discard</Button><Button size="sm">Save changes</Button></>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="ds-from">From name</Label><Input id="ds-from" defaultValue="Magnetix Studios" /></div>
              <div className="grid gap-1.5"><Label htmlFor="ds-reply">Reply-to email</Label><Input id="ds-reply" defaultValue="hello@example.com" /></div>
            </div>
          </SettingsSection>
        </Block>

        <Block id="toolbar" title="Search, filter bar, pagination">
          <FilterBar
            search={<SearchField value={search} onChange={setSearch} placeholder="Search resources…" aria-label="Search resources" />}
            filters={<SegmentedControl value={seg} onChange={setSeg} options={[{ value: "all", label: "All" }, { value: "published", label: "Published" }, { value: "draft", label: "Draft" }]} />}
            actions={<Button variant="secondary" size="sm"><Upload /> Export</Button>}
          />
          <Pagination page={page} pageSize={25} total={240} onPageChange={setPage} itemLabel="resources" />
        </Block>

        <Block id="confirm" title="Confirm dialog" note="Replaces window.confirm. Controlled component or the promise-based useConfirm().">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 /> Delete (controlled)</Button>
            <Button variant="secondary" onClick={async () => setLastConfirm((await confirm({ title: "Discard changes?", description: "Your edits will be lost.", confirmLabel: "Discard", tone: "danger" })) ? "confirmed" : "cancelled")}>
              useConfirm()
            </Button>
            <span className="text-caption text-muted-foreground">Last result: {lastConfirm}</span>
          </div>
          <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Delete this resource?" description="It will be removed from every lesson that uses it." confirmLabel="Delete" tone="danger" onConfirm={() => new Promise((r) => setTimeout(r, 600))} />
          {dialog}
        </Block>

        <Block id="widths" title="PageShell widths" note="form 48rem · data 64rem · wide 80rem · full. Every return of a page uses the same width.">
          {(["form", "data", "wide", "full"] as PageShellWidth[]).map((w) => (
            <div key={w} className="overflow-hidden rounded-lg border border-dashed border-border-strong">
              <PageShell width={w} className="gap-0 lg:px-0"><div className="rounded-md bg-tint-violet px-3 py-2 text-caption font-medium text-link">width=&quot;{w}&quot;</div></PageShell>
            </div>
          ))}
        </Block>
      </PageShell>
    </div>
  );
}
