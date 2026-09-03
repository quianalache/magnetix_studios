"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PinnedDestination {
  id: string;
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonName: string;
}
interface PickerCourse {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
}

/**
 * "Pin to Course Page" / "Manage Course Page Pins" — one dialog covers
 * both: it always shows current destinations (if any) with a remove
 * control, and a searchable course/lesson picker to add another. A post
 * can be pinned to multiple course pages (this is a reference — the
 * SAME canonical post embeds at every destination, never a copy).
 */
export function PinToCoursePageDialog({
  saId,
  groupId,
  postId,
  postTitle,
  onClose,
}: {
  saId: string;
  groupId: string;
  postId: string;
  postTitle: string;
  onClose: () => void;
}) {
  const [pins, setPins] = useState<PinnedDestination[] | null>(null);
  const [courses, setCourses] = useState<PickerCourse[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);
  const [removingPinId, setRemovingPinId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/community/${saId}/${groupId}/posts/${postId}/course-pins`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { pins?: PinnedDestination[] }) => setPins(data.pins ?? []))
      .catch(() => setPins([]));
    void fetch(`/api/community/${saId}/${groupId}/course-picker`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { courses?: PickerCourse[] }) =>
        setCourses(data.courses ?? [])
      )
      .catch(() => setCourses([]));
  }, [saId, groupId, postId]);

  const pinnedLessonIds = useMemo(
    () => new Set((pins ?? []).map((p) => p.lessonId)),
    [pins]
  );

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses
      .map((c) => ({
        ...c,
        lessons: c.title.toLowerCase().includes(q)
          ? c.lessons
          : c.lessons.filter((l) => l.title.toLowerCase().includes(q)),
      }))
      .filter((c) => c.lessons.length > 0 || c.title.toLowerCase().includes(q));
  }, [courses, query]);

  async function pin(courseId: string, lessonId: string) {
    setBusyLessonId(lessonId);
    try {
      const r = await fetch(
        `/api/community/${saId}/${groupId}/posts/${postId}/course-pins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, lessonId }),
        }
      );
      const data = (await r.json().catch(() => ({}))) as {
        pin?: PinnedDestination;
        error?: string;
      };
      if (!r.ok || !data.pin) {
        toast.error(data.error ?? "Couldn't pin to that page.");
        return;
      }
      setPins((current) => [...(current ?? []), data.pin!]);
      toast.success("Pinned to course page");
    } finally {
      setBusyLessonId(null);
    }
  }

  async function unpin(pinToRemove: PinnedDestination) {
    setRemovingPinId(pinToRemove.id);
    try {
      const r = await fetch(
        `/api/community/${saId}/${groupId}/posts/${postId}/course-pins?pinId=${encodeURIComponent(pinToRemove.id)}`,
        { method: "DELETE" }
      );
      if (!r.ok) {
        toast.error("Couldn't remove that pin.");
        return;
      }
      setPins((current) =>
        (current ?? []).filter((p) => p.id !== pinToRemove.id)
      );
      toast.success("Removed from course page");
    } finally {
      setRemovingPinId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-course-title"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-xl border bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="min-w-0">
            <h2 id="pin-course-title" className="text-sm font-semibold">
              Pin to Course Page
            </h2>
            <p className="truncate text-xs text-[#909090]">{postTitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pins === null ? (
            <p className="text-sm text-[#909090]">Loading…</p>
          ) : pins.length > 0 ? (
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-[#909090] uppercase">
                Currently pinned to
              </p>
              <div className="flex flex-col gap-1.5">
                {pins.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p.courseName}</span>
                      <span className="text-[#909090]"> · {p.lessonName}</span>
                    </span>
                    <button
                      onClick={() => void unpin(p)}
                      disabled={removingPinId === p.id}
                      aria-label={`Remove pin from ${p.lessonName}`}
                      className="shrink-0 rounded-full p-1 text-[#909090] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mb-1.5 text-xs font-semibold tracking-wide text-[#909090] uppercase">
            Add another
          </p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#909090]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses and pages…"
              className="w-full rounded-md border border-[#E4E4E4] py-1.5 pr-3 pl-8 text-sm"
            />
          </div>

          {courses === null ? (
            <p className="text-sm text-[#909090]">Loading courses…</p>
          ) : filteredCourses.length === 0 ? (
            <p className="text-sm text-[#909090]">
              {courses.length === 0
                ? "No published courses in this community yet."
                : "No pages match your search."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredCourses.map((c) => (
                <div key={c.id}>
                  <p className="mb-1 text-xs font-semibold text-[#202124]">
                    {c.title}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {c.lessons.map((l) => {
                      const already = pinnedLessonIds.has(l.id);
                      return (
                        <button
                          key={l.id}
                          disabled={already || busyLessonId === l.id}
                          onClick={() => void pin(c.id, l.id)}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-[#F5F4FB] disabled:cursor-default disabled:opacity-50"
                        >
                          <span className="truncate">{l.title}</span>
                          {already && (
                            <span className="shrink-0 text-xs text-[#909090]">
                              Pinned
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
