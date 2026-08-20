"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Hash, Lock, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import { ActionsMenu } from "@/components/community/actions-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateChannelSectionModal } from "@/components/community/channels/create-channel-section-modal";
import { ChannelMovePopover } from "@/components/community/channels/channel-move-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CommunityChannel, CommunitySection } from "@/types/community";

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
}

/**
 * Community Home left nav — Channels/Sections (this task), replacing the
 * old flat `categories` render. See `CommunityChannel`'s own module
 * comment (types/community.ts) for the full architecture: a Channel's
 * `name` still IS the plain `category` string every post uses, so the
 * `?c=` link/filter FeedView already reads is completely unchanged — this
 * component only changed how those links are grouped/labelled/managed,
 * never what they point at.
 *
 * Server-fetched `initialChannels`/`initialSections` (community/page.tsx,
 * already viewer-filtered — private channels/sections a non-moderator
 * can't see are never even sent to the client) seed local state that's
 * then kept in sync by each create/edit/delete's own response, so an
 * admin managing channels never needs a full page reload to see the rail
 * update.
 */
export function CommunityLeftNav({
  saId,
  pretty = false,
  groupId,
  groupSlug,
  brand,
  viewer,
  initialChannels,
  initialSections,
}: {
  saId: string;
  pretty?: boolean;
  groupId: string;
  groupSlug: string;
  brand: string;
  viewer: Viewer;
  initialChannels: CommunityChannel[];
  initialSections: CommunitySection[];
}) {
  const searchParams = useSearchParams();
  const active = searchParams.get("c") ?? "All";
  const base = communityHomeHref({ saId, pretty }, groupSlug);
  const isModerator = viewer.role === "moderator";

  const [channels, setChannels] = useState(initialChannels);
  const [sections, setSections] = useState(initialSections);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<CommunityChannel | null>(null);
  const [editingSection, setEditingSection] = useState<CommunitySection | null>(null);

  function openComposer() {
    const el = document.getElementById("community-composer-trigger");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.click();
  }

  function upsertChannel(c: CommunityChannel) {
    setChannels((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]));
  }
  function upsertSection(s: CommunitySection) {
    setSections((prev) => (prev.some((x) => x.id === s.id) ? prev.map((x) => (x.id === s.id ? s : x)) : [...prev, s]));
  }

  async function deleteChannel(c: CommunityChannel) {
    if (!confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/community/${saId}/${groupId}/channels/${c.id}`, { method: "DELETE" });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't delete channel");
      return;
    }
    setChannels((prev) => prev.filter((x) => x.id !== c.id));
    toast.success("Channel deleted");
  }

  async function deleteSection(s: CommunitySection) {
    if (!confirm(`Delete "${s.name}"? Its channels will become unsectioned — they and their posts are not deleted.`)) return;
    const res = await fetch(`/api/community/${saId}/${groupId}/sections/${s.id}`, { method: "DELETE" });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't delete section");
      return;
    }
    setSections((prev) => prev.filter((x) => x.id !== s.id));
    setChannels((prev) => prev.map((c) => (c.sectionId === s.id ? { ...c, sectionId: null } : c)));
    toast.success("Section deleted");
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const unsectioned = channels.filter((c) => !c.sectionId).sort((a, b) => a.order - b.order);
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <nav className="space-y-4">
      <button
        onClick={openComposer}
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: brand }}
      >
        <Plus className="h-4 w-4" /> New Post
      </button>

      <div className="space-y-0.5">
        <NavLink href={base} label="All Posts" isActive={active === "All"} brand={brand} />
      </div>

      <div>
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#909090]">Channels</p>
          {isModerator && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Create Channel/Section"
                      onClick={() => setCreateOpen(true)}
                      className="flex h-5 w-5 items-center justify-center rounded text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
                    />
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Create Channel/Section</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="space-y-0.5">
          {unsectioned.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              base={base}
              active={active}
              brand={brand}
              isModerator={isModerator}
              siblingChannels={channels}
              sections={sections}
              onEdit={() => setEditingChannel(c)}
              onDelete={() => deleteChannel(c)}
              onMoved={upsertChannel}
            />
          ))}
        </div>

        {sortedSections.map((s) => {
          const isCollapsed = collapsed.has(s.id);
          const sectionChannels = channels.filter((c) => c.sectionId === s.id).sort((a, b) => a.order - b.order);
          return (
            <div key={s.id} className="mt-3">
              <div className="group flex items-center gap-1 px-3 py-1">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(s.id)}
                  className="flex flex-1 items-center gap-1 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 shrink-0 text-[#909090]" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0 text-[#909090]" />
                  )}
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#909090]">
                    {s.icon} {s.name}
                  </span>
                  {s.private && <Lock className="h-3 w-3 shrink-0 text-[#b4b4b4]" />}
                </button>
                {isModerator && (
                  // Always visible below `sm` -- touch has no hover state,
                  // so a hover-only reveal would make this permanently
                  // untappable for a mobile admin. Desktop keeps the
                  // hover/focus reveal.
                  <span className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <ActionsMenu
                      items={[
                        { label: "Edit Section", onClick: () => setEditingSection(s) },
                        { label: "Delete Section", onClick: () => deleteSection(s), destructive: true },
                      ]}
                    />
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {sectionChannels.map((c) => (
                    <ChannelRow
                      key={c.id}
                      channel={c}
                      base={base}
                      active={active}
                      brand={brand}
                      isModerator={isModerator}
                      siblingChannels={channels}
                      sections={sections}
                      onEdit={() => setEditingChannel(c)}
                      onDelete={() => deleteChannel(c)}
                      onMoved={upsertChannel}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createOpen && (
        <CreateChannelSectionModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          saId={saId}
          groupId={groupId}
          sections={sections}
          onChannelSaved={upsertChannel}
          onSectionSaved={upsertSection}
        />
      )}
      {editingChannel && (
        <CreateChannelSectionModal
          open={!!editingChannel}
          onOpenChange={(o) => !o && setEditingChannel(null)}
          saId={saId}
          groupId={groupId}
          sections={sections}
          editingChannel={editingChannel}
          onChannelSaved={(c) => {
            upsertChannel(c);
            setEditingChannel(null);
          }}
        />
      )}
      {editingSection && (
        <CreateChannelSectionModal
          open={!!editingSection}
          onOpenChange={(o) => !o && setEditingSection(null)}
          saId={saId}
          groupId={groupId}
          sections={sections}
          editingSection={editingSection}
          onSectionSaved={(s) => {
            upsertSection(s);
            setEditingSection(null);
          }}
        />
      )}
    </nav>
  );
}

function NavLink({
  href,
  label,
  isActive,
  brand,
  icon,
}: {
  href: string;
  label: string;
  isActive: boolean;
  brand: string;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 truncate rounded-md px-3 py-1.5 text-sm font-medium",
        isActive ? "text-white" : "text-[#3a3a44] hover:bg-[#F0F0F0]",
      )}
      style={isActive ? { backgroundColor: brand } : undefined}
    >
      {icon ? <span className="shrink-0">{icon}</span> : <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ChannelRow({
  channel,
  base,
  active,
  brand,
  isModerator,
  siblingChannels,
  sections,
  onEdit,
  onDelete,
  onMoved,
}: {
  channel: CommunityChannel;
  base: string;
  active: string;
  brand: string;
  isModerator: boolean;
  siblingChannels: CommunityChannel[];
  sections: CommunitySection[];
  onEdit: () => void;
  onDelete: () => void;
  onMoved: (c: CommunityChannel) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="group relative flex items-center">
      <div className="min-w-0 flex-1">
        <NavLink
          href={`${base}?c=${encodeURIComponent(channel.name)}`}
          label={channel.name}
          isActive={active === channel.name}
          brand={brand}
          icon={channel.icon}
        />
      </div>
      {channel.private && (
        <Lock className="pointer-events-none absolute right-8 h-3 w-3 shrink-0 text-[#c4c4c4]" />
      )}
      {isModerator && (
        // Same touch-has-no-hover fix as the section row's ActionsMenu
        // wrapper above -- always visible below `sm`.
        <span
          className={cn(
            "absolute right-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
            menuOpen && "opacity-100",
          )}
        >
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              type="button"
              title="Manage channel"
              aria-label="Manage channel"
              className="rounded-full p-1 text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </PopoverTrigger>
            {/* Explicit light override -- PopoverContent's own default is
                `bg-popover`/`text-popover-foreground`/`border-border`, all
                next-themes-responsive tokens. Same fix already applied to
                the Create/Edit modal: Community stays hardcoded-light
                regardless of the app's global dark/light class. */}
            <PopoverContent className="w-52 border-[#E4E4E4] bg-white p-1.5 text-[#202124]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-[#202124] hover:bg-[#F8F7F5]"
              >
                Edit Channel
              </button>
              <ChannelMovePopover
                saId={channel.subAccountId}
                groupId={channel.groupId}
                channel={channel}
                siblingChannels={siblingChannels}
                sections={sections}
                onMoved={(c) => {
                  onMoved(c);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-[#F8F7F5]"
              >
                Delete
              </button>
            </PopoverContent>
          </Popover>
        </span>
      )}
    </div>
  );
}
