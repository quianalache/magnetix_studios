"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { subscribeToStandaloneCourse } from "@/lib/firestore/standalone-courses";
import { subscribeToCommunityGroups } from "@/lib/firestore/community-groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { CommunityGroup } from "@/types/community";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

type VisibilityFilter = "published" | "draft" | "all";

/**
 * Connects this Standalone Course to one or more existing Community Groups —
 * anyone who enrolls in the course is auto-granted membership in every
 * linked group (see `grantLinkedCommunityGroupsServerSide`). Mirrors the
 * GHL reference's course-editor "Community Groups" tab.
 */
export default function CourseCommunityGroupsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { subAccountId, courseId } = use(params);
  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [allGroups, setAllGroups] = useState<CommunityGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<VisibilityFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      subscribeToStandaloneCourse(subAccountId, courseId, (c) => {
        setCourse(c);
        setLoaded(true);
      }),
    [subAccountId, courseId],
  );
  useEffect(
    () => subscribeToCommunityGroups(subAccountId, setAllGroups),
    [subAccountId],
  );

  const linkedIds = useMemo(
    () => new Set(course?.linkedCommunityGroupIds ?? []),
    [course],
  );
  const linkedGroups = useMemo(
    () => allGroups.filter((g) => linkedIds.has(g.id)),
    [allGroups, linkedIds],
  );
  const filteredLinkedGroups = useMemo(
    () =>
      filter === "all"
        ? linkedGroups
        : linkedGroups.filter((g) => g.status === filter),
    [linkedGroups, filter],
  );
  const availableGroups = useMemo(
    () => allGroups.filter((g) => !linkedIds.has(g.id)),
    [allGroups, linkedIds],
  );

  async function linkGroup() {
    if (!selectedGroupId) {
      toast.error("Choose a community group");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/standalone-courses/${courseId}/community-groups`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: selectedGroupId }),
        },
      );
      if (!res.ok) throw new Error();
      toast.success("Community group linked.");
      setAddOpen(false);
      setSelectedGroupId("");
    } catch {
      toast.error("Couldn't link group");
    } finally {
      setSaving(false);
    }
  }

  async function unlinkGroup(groupId: string) {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/standalone-courses/${courseId}/community-groups/${groupId}`,
      { method: "DELETE" },
    );
    if (res.ok) toast.success("Community group unlinked.");
    else toast.error("Couldn't unlink group");
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Link
          href={`/sa/${subAccountId}/courses/${courseId}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">{course.title}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Community groups linked to this course — anyone who enrolls is
        automatically added as a member of every group below.
      </p>

      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
            { value: "all", label: "All" },
          ]}
        />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Link Group
        </Button>
      </div>

      {filteredLinkedGroups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <Info className="h-6 w-6 text-muted-foreground" />
          <p className="text-[13px] font-medium">No community groups yet</p>
          <p className="max-w-xs text-[12px] text-muted-foreground">
            Link an existing community group to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinkedGroups.map((g) => (
                <tr key={g.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">{g.name}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        g.status === "published"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                          : "rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                      }
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => unlinkGroup(g.id)}
                      title="Unlink"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Community Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cg-select">Community group</Label>
            <select
              id="cg-select"
              className={SELECT}
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Choose a group…</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {availableGroups.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                Every community group is already linked to this course.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={linkGroup} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Link Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
