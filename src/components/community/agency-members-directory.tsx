"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Search, Trophy } from "lucide-react";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu, type MenuItem } from "@/components/community/actions-menu";
import { DmThreadModal } from "@/components/community/dm/dm-thread-modal";
import { cn } from "@/lib/utils";
import type { DmMemberView } from "@/types/community";

export interface AgencyDirectoryRow {
  memberId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  level: number;
  points: number;
  joinedAtMs: number | null;
}

function joinedLabel(ms: number | null): string {
  if (!ms) return "Joined recently";
  return `Joined ${new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

/**
 * Agency Community — the agency-scope sibling of MembersDirectory
 * (browse/search/DM), rooted at the same visual shell. Deliberately
 * simpler than the tenant version: an agency roster entry has no
 * "banned" status and no per-member "moderator" role (see
 * AgencyGroupMemberRoster) — Agency Community delegates moderation to the
 * owner alone, so this shows only active members, with a DM button for
 * everyone and an owner-only "Remove member" action (no promote/demote/
 * ban, which don't exist in this data model).
 */
export function AgencyMembersDirectory({
  groupId,
  brand,
  viewerMemberId,
  viewerIsOwner,
  initialRows,
}: {
  groupId: string;
  brand: string;
  /** The viewer's own roster memberId — "" for the owner (who has no
   *  roster entry of their own). */
  viewerMemberId: string;
  viewerIsOwner: boolean;
  initialRows: AgencyDirectoryRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dmTarget, setDmTarget] = useState<DmMemberView | null>(null);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.displayName.toLowerCase().includes(term) || r.email.toLowerCase().includes(term),
    );
  }, [rows, q]);

  async function removeMember(memberId: string) {
    if (!confirm("Revoke this person's access to the community?")) return;
    setBusy(memberId);
    try {
      const res = await fetch(`/api/agency/community/${groupId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setRows((prev) => prev.filter((r) => r.memberId !== memberId));
      toast.success("Access revoked");
    } catch {
      toast.error("Couldn't revoke access");
    } finally {
      setBusy(null);
    }
  }

  function menuFor(r: AgencyDirectoryRow): MenuItem[] {
    if (!viewerIsOwner) return [];
    return [{ label: "Remove member", onClick: () => removeMember(r.memberId), destructive: true }];
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#3a3a44]">
          {rows.length} member{rows.length === 1 ? "" : "s"}
        </span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#909090]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            className="h-9 w-56 rounded-md border border-[#E4E4E4] bg-white pl-8 pr-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          No members here.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const items = menuFor(r);
            return (
              <div
                key={r.memberId}
                className={cn(
                  "rounded-xl border border-[#E4E4E4] bg-white p-4",
                  busy === r.memberId && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <MemberAvatar
                    author={{ memberId: r.memberId, displayName: r.displayName, avatarUrl: r.avatarUrl, level: r.level }}
                    size={48}
                    brand={brand}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="truncate font-semibold text-[#202124]">{r.displayName}</span>
                        <div className="text-xs text-[#909090]">{r.email}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!viewerIsOwner && r.memberId !== viewerMemberId && (
                          <button
                            onClick={() =>
                              setDmTarget({ memberId: r.memberId, displayName: r.displayName, avatarUrl: r.avatarUrl })
                            }
                            className="rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#202124] hover:bg-[#F8F7F5]"
                          >
                            Message
                          </button>
                        )}
                        {items.length > 0 && <ActionsMenu items={items} />}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-1.5 text-sm text-[#3a3a44] sm:grid-cols-2">
                      <span className="flex items-center gap-2">
                        <Trophy className="h-3.5 w-3.5 text-[#909090]" />
                        Level {r.level} · {r.points.toLocaleString()} pts
                      </span>
                      <span className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-[#909090]" />
                        {joinedLabel(r.joinedAtMs)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dmTarget && (
        <DmThreadModal
          saId=""
          agencyScope
          viewerId={viewerMemberId}
          other={dmTarget}
          brand={brand}
          onClose={() => setDmTarget(null)}
        />
      )}
    </div>
  );
}
