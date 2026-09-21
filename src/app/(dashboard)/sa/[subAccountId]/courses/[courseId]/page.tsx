"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToStandaloneCourse,
  subscribeToStandaloneLessons,
  subscribeToStandaloneSections,
} from "@/lib/firestore/standalone-courses";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { uploadStandaloneCourseImage } from "@/lib/community/upload-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { CourseOutlineSidebar } from "@/components/standalone-courses/course-outline-sidebar";
import { HostedVideoField } from "@/components/standalone-courses/hosted-video-field";
import {
  COURSE_GATE_CHART_RULE_ATTRIBUTES,
  CHART_RULE_OPERATORS,
  type ChartRuleCondition,
} from "@/lib/energetics/chart-rules";
import type { ResourceLink } from "@/types/community";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
} from "@/types/standalone-courses";

/**
 * Standalone-course editor — sections/lessons builder. Forked from the
 * Community classroom editor page (`community/[groupId]/classroom/[courseId]/
 * page.tsx`): same drag-and-drop outline + lesson editor, minus `groupId`
 * threading throughout. The outline sidebar itself (section reorder/
 * collapse, lesson drag/reorder) is the shared `CourseOutlineSidebar` —
 * see that component's own doc comment for why (Course Section UX,
 * 2026-09-20).
 *
 * `useSearchParams` requires a Suspense boundary around anything that reads
 * it during the initial render, so the actual page body lives in `Inner`
 * and this default export just wraps it.
 */
export default function StandaloneCourseEditorPage(props: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      }
    >
      <StandaloneCourseEditorPageInner {...props} />
    </Suspense>
  );
}

function StandaloneCourseEditorPageInner({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { courseId } = use(params);
  const { subAccountId } = useSubAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiBase = `/api/sub-accounts/${subAccountId}/standalone-courses/${courseId}`;

  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [sections, setSections] = useState<StandaloneCourseSection[]>([]);
  const [lessons, setLessons] = useState<StandaloneLesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Every place that changes the selected lesson (click, create, drag, or
  // clear-on-delete) goes through this instead of `setSelectedId` directly,
  // so the URL is written synchronously with the same user action that
  // changed the selection — no effect ever has to "notice" `selectedId`
  // changed on a later render and reconstruct what to write, which is what
  // made earlier attempts at this fix racy: an effect reacting to
  // `selectedId` can only see the value as of whichever render it was
  // scheduled from, and on the initial load that's sometimes still the
  // pre-resolution `null`, one render before the real value lands — enough
  // to strip a valid `?lesson=` id off the URL right after it was set.
  function selectLesson(id: string | null) {
    setSelectedId(id);
    const qs = new URLSearchParams(searchParams.toString());
    if (id) qs.set("lesson", id);
    else qs.delete("lesson");
    const query = qs.toString();
    router.replace(
      `/sa/${subAccountId}/courses/${courseId}${query ? `?${query}` : ""}`,
      { scroll: false }
    );
  }

  useEffect(() => {
    const u1 = subscribeToStandaloneCourse(subAccountId, courseId, (c) => {
      setCourse(c);
      setLoaded(true);
    });
    const u2 = subscribeToStandaloneSections(
      subAccountId,
      courseId,
      setSections
    );
    const u3 = subscribeToStandaloneLessons(subAccountId, courseId, (ls) => {
      setLessons(ls);
      setLessonsLoaded(true);
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subAccountId, courseId]);

  // Resolve which lesson is selected on initial load / whenever the lesson
  // list changes: keep the current in-memory selection if it's still
  // valid, otherwise fall back to the `?lesson=` id from the URL, and only
  // fall back to the first lesson if neither points at a real lesson.
  // Routed entirely through `selectLesson` (state + URL together, see
  // above) rather than calling `setSelectedId` here directly — this is the
  // ONLY place selection is derived rather than explicitly chosen by the
  // user, so it's also the only place that needs the URL fallback logic;
  // every other call site already knows the exact id it wants selected.
  // Gated on `lessonsLoaded` since the Firestore lessons subscription
  // hasn't delivered its first snapshot yet on initial mount, so there's
  // nothing real to resolve against until then.
  useEffect(() => {
    if (!lessonsLoaded) return;
    const ordered = [...lessons].sort((a, b) => a.order - b.order);
    const fromUrl = searchParams.get("lesson");
    const candidate = selectedId ?? fromUrl;
    const resolved =
      candidate && ordered.some((l) => l.id === candidate)
        ? candidate
        : (ordered[0]?.id ?? null);
    if (resolved !== selectedId || resolved !== fromUrl) {
      selectLesson(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, lessonsLoaded]);

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="text-muted-foreground p-6 text-center text-sm">
        Course not found.{" "}
        <Link href={`/sa/${subAccountId}/courses`} className="underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  async function addSection() {
    await fetch(`${apiBase}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New section" }),
    });
  }
  async function addLesson(sectionId: string | null) {
    const res = await fetch(`${apiBase}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New lesson", sectionId }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      lesson?: { id: string };
    };
    if (d.lesson?.id) selectLesson(d.lesson.id);
  }
  async function deleteCourse() {
    if (!confirm("Delete this course and all its lessons?")) return;
    const res = await fetch(apiBase, { method: "DELETE" });
    if (res.ok) {
      toast.success("Course deleted");
      router.push(`/sa/${subAccountId}/courses`);
    }
  }

  const selectedLesson = lessons.find((l) => l.id === selectedId) ?? null;
  const hasLessons = lessons.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/sa/${subAccountId}/courses`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Courses
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={`/course/${subAccountId}/${courseId}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" /> View sales page
            </Button>
          </a>
          {course.access === "purchase" && (
            <Link href={`/sa/${subAccountId}/courses/${courseId}/purchases`}>
              <Button variant="outline" size="sm">
                Purchases
              </Button>
            </Link>
          )}
          <Link href={`/sa/${subAccountId}/courses/${courseId}/theme`}>
            <Button variant="outline" size="sm">
              Theme
            </Button>
          </Link>
          <Link
            href={`/sa/${subAccountId}/courses/${courseId}/community-groups`}
          >
            <Button variant="outline" size="sm">
              Community Groups
            </Button>
          </Link>
          <Link href={`/sa/${subAccountId}/courses/${courseId}/offers`}>
            <Button variant="outline" size="sm">
              Offers
            </Button>
          </Link>
          <Link href={`/sa/${subAccountId}/courses/${courseId}/settings`}>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </Link>
          <Link href={`/sa/${subAccountId}/courses/${courseId}/edit`}>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4" /> Course settings
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={deleteCourse}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Left — outline (section reorder/collapse, lesson drag/reorder) */}
        <CourseOutlineSidebar
          apiBase={apiBase}
          courseId={courseId}
          sections={sections}
          lessons={lessons}
          onSectionsChange={setSections}
          onLessonsChange={setLessons}
          selectedId={selectedId}
          onSelectLesson={selectLesson}
          onAddSection={addSection}
          onAddLesson={addLesson}
        />

        {/* Right — editor / empty state */}
        <div>
          {selectedLesson ? (
            <LessonEditor
              key={selectedLesson.id}
              apiBase={apiBase}
              saId={subAccountId}
              agencyId={course.agencyId}
              courseId={courseId}
              lesson={selectedLesson}
              onDeleted={() => selectLesson(null)}
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
              <GraduationCap className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                {hasLessons
                  ? "Select a lesson to edit."
                  : "No lessons yet. Create your first lesson to get started."}
              </p>
              {!hasLessons && (
                <Button onClick={() => addLesson(sections[0]?.id ?? null)}>
                  <Plus className="h-4 w-4" /> Add first lesson
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonEditor({
  apiBase,
  saId,
  agencyId,
  courseId,
  lesson,
  onDeleted,
}: {
  apiBase: string;
  saId: string;
  agencyId: string;
  courseId: string;
  lesson: StandaloneLesson;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [hostedVideoId, setHostedVideoId] = useState<string | null>(lesson.hostedVideoId ?? null);
  const [body, setBody] = useState(lesson.bodyHtml);
  const [published, setPublished] = useState(lesson.published);
  const [links, setLinks] = useState<ResourceLink[]>(
    lesson.resourceLinks ?? []
  );
  const [unlockCondition, setUnlockCondition] =
    useState<ChartRuleCondition | null>(lesson.chartUnlockCondition ?? null);
  const [saving, setSaving] = useState(false);

  const parsed = videoUrl.trim() ? parseVideoUrl(videoUrl) : null;
  const videoValid = Boolean(hostedVideoId) || !videoUrl.trim() || parsed !== null;

  async function save() {
    if (!videoValid) {
      toast.error(
        "Paste a valid YouTube, Vimeo, Loom, Descript, Wistia, or Adilo URL"
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          hostedVideoId,
          videoUrl: hostedVideoId ? null : videoUrl.trim() || null,
          bodyHtml: body,
          published,
          resourceLinks: links.filter((l) => l.url.trim()),
          chartUnlockCondition: unlockCondition,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Couldn't save");
      }
      toast.success("Lesson saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`${apiBase}/lessons/${lesson.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="bg-card space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <GraduationCap className="h-4 w-4" /> Lesson
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={remove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <HostedVideoField ownerScope={{ kind: "tenant", agencyId, subAccountId: saId }} title={title} courseId={courseId} lessonId={lesson.id} hostedVideoId={hostedVideoId} onHostedVideoChange={setHostedVideoId} externalUrl={videoUrl} onExternalUrlChange={setVideoUrl} />
      {!hostedVideoId && !videoValid && (
        <p className="text-destructive text-xs">Not a recognized YouTube, Vimeo, Loom, Descript, Wistia, or Adilo link.</p>
      )}
      {!hostedVideoId && parsed && (
          <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-black">
            <iframe
              src={parsed.embedUrl}
              title="preview"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
      )}

      <div className="space-y-1.5">
        <Label>Lesson text</Label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          onUploadImage={(file) =>
            uploadStandaloneCourseImage(file, saId, courseId, "lesson")
          }
        />
      </div>

      <ResourceLinksEditor links={links} onChange={setLinks} />

      <ChartUnlockEditor
        value={unlockCondition}
        onChange={setUnlockCondition}
      />

      <div className="flex items-center justify-between border-t pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4"
          />
          Published
        </label>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save lesson
        </Button>
      </div>
    </div>
  );
}

/**
 * Chart-gated content — her idea, 2026-08-09: a "teach the lines" course
 * where a 3/6 Profile only unlocks the Line 3 and Line 6 lessons. Reuses
 * the same Chart Rule engine that gates Report Builder pages (Phase 1) —
 * one attribute/operator/value condition per lesson, no restriction by
 * default. When set, the classroom guard (Phase 3, standalone-course-
 * service.ts) checks it against the enrollment's `birthChart` snapshot.
 */
function ChartUnlockEditor({
  value,
  onChange,
}: {
  value: ChartRuleCondition | null;
  onChange: (v: ChartRuleCondition | null) => void;
}) {
  const enabled = value !== null;

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { attribute: "profileLines", operator: "contains", value: "" }
                : null
            )
          }
          className="h-4 w-4"
        />
        Only unlock this lesson for a matching chart
      </label>
      {enabled && value && (
        <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
          <select
            value={value.attribute}
            onChange={(e) =>
              onChange({
                ...value,
                attribute: e.target.value as ChartRuleCondition["attribute"],
              })
            }
            className="border-input bg-background rounded-lg border px-2.5 py-1.5 text-sm"
          >
            {COURSE_GATE_CHART_RULE_ATTRIBUTES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <select
            value={value.operator}
            onChange={(e) =>
              onChange({
                ...value,
                operator: e.target.value as ChartRuleCondition["operator"],
              })
            }
            className="border-input bg-background rounded-lg border px-2.5 py-1.5 text-sm"
          >
            {CHART_RULE_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Input
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            placeholder="e.g. 3, Reflector, Sacral…"
          />
        </div>
      )}
      {enabled && (
        <p className="text-muted-foreground pl-6 text-xs">
          Students see this lesson only if their own chart matches. A course
          with any gated lesson asks for birth details at checkout.
        </p>
      )}
    </div>
  );
}

function ResourceLinksEditor({
  links,
  onChange,
}: {
  links: ResourceLink[];
  onChange: (l: ResourceLink[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Resource links</Label>
      {links.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={l.label}
            placeholder="Label"
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }}
            className="h-8 w-1/3"
          />
          <Input
            value={l.url}
            placeholder="https://…"
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...next[i], url: e.target.value };
              onChange(next);
            }}
            className="h-8 flex-1"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(links.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange([...links, { label: "", url: "" }])}
      >
        <Plus className="h-4 w-4" /> Add link
      </Button>
    </div>
  );
}
