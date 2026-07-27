"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { subscribeToStandaloneCourse } from "@/lib/firestore/standalone-courses";
import { ImageUpload } from "@/components/community/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { uploadStandaloneCourseImage } from "@/lib/community/upload-image";
import {
  COURSE_DIFFICULTIES,
  COURSE_LANGUAGES,
  COURSE_TOPICS,
} from "@/lib/standalone-courses/course-tags";
import {
  DEFAULT_STANDALONE_COURSE_ADVANCED,
  DEFAULT_STANDALONE_COURSE_INSTRUCTOR,
  DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE,
} from "@/types/standalone-courses";
import type {
  StandaloneCourse,
  StandaloneCourseDifficulty,
} from "@/types/standalone-courses";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        {title}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-4 border-t p-4">{children}</div>}
    </div>
  );
}

export default function CourseSettingsExtendedPage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { subAccountId, courseId } = use(params);
  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState<StandaloneCourseDifficulty | "">("");
  const [topic, setTopic] = useState("");

  const [instHeading, setInstHeading] = useState(
    DEFAULT_STANDALONE_COURSE_INSTRUCTOR.heading,
  );
  const [instName, setInstName] = useState("");
  const [instTitle, setInstTitle] = useState("");
  const [instBio, setInstBio] = useState("");
  const [instHeadshotUrl, setInstHeadshotUrl] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);

  const [autoplayNext, setAutoplayNext] = useState(true);
  const [autoplayFirst, setAutoplayFirst] = useState(true);
  const [autoComplete, setAutoComplete] = useState(true);

  const [customJs, setCustomJs] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [headerTrackingCode, setHeaderTrackingCode] = useState("");
  const [footerTrackingCode, setFooterTrackingCode] = useState("");
  const [advancedTab, setAdvancedTab] = useState<"js" | "css">("js");
  const [trackingTab, setTrackingTab] = useState<"header" | "footer">("header");

  useEffect(
    () =>
      subscribeToStandaloneCourse(subAccountId, courseId, (c) => {
        setCourse(c);
        setLoaded(true);
        if (c) {
          setLanguage(c.language ?? "");
          setDifficulty(c.difficulty ?? "");
          setTopic(c.topic ?? "");
          const inst = c.instructor ?? DEFAULT_STANDALONE_COURSE_INSTRUCTOR;
          setInstHeading(inst.heading);
          setInstName(inst.name);
          setInstTitle(inst.title);
          setInstBio(inst.bio);
          setInstHeadshotUrl(inst.headshotUrl);
          setLogoUrl(c.logoUrl);
          setFaviconUrl(c.faviconUrl);
          const le = c.learningExperience ?? DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE;
          setAutoplayNext(le.autoplayNextLesson);
          setAutoplayFirst(le.autoplayFirstLesson);
          setAutoComplete(le.autoCompleteLessons);
          const adv = c.advanced ?? DEFAULT_STANDALONE_COURSE_ADVANCED;
          setCustomJs(adv.customJs);
          setCustomCss(adv.customCss);
          setHeaderTrackingCode(adv.headerTrackingCode);
          setFooterTrackingCode(adv.footerTrackingCode);
        }
      }),
    [subAccountId, courseId],
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/standalone-courses/${courseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: language || null,
            difficulty: difficulty || null,
            topic: topic || null,
            instructor: {
              heading: instHeading.trim(),
              name: instName.trim(),
              title: instTitle.trim(),
              bio: instBio.trim(),
              headshotUrl: instHeadshotUrl,
            },
            logoUrl,
            faviconUrl,
            learningExperience: {
              autoplayNextLesson: autoplayNext,
              autoplayFirstLesson: autoplayFirst,
              autoCompleteLessons: autoComplete,
            },
            advanced: {
              customJs,
              customCss,
              headerTrackingCode,
              footerTrackingCode,
            },
          }),
        },
      );
      if (!res.ok) throw new Error();
      toast.success("Settings saved.");
    } catch {
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  async function applyToAllCourses() {
    setApplyingAll(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/standalone-courses/apply-learning-experience`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            learningExperience: {
              autoplayNextLesson: autoplayNext,
              autoplayFirstLesson: autoplayFirst,
              autoCompleteLessons: autoComplete,
            },
          }),
        },
      );
      if (!res.ok) throw new Error();
      toast.success("Applied to all courses.");
    } catch {
      toast.error("Couldn't apply to all courses");
    } finally {
      setApplyingAll(false);
    }
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
      <div className="mx-auto w-full max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href={`/sa/${subAccountId}/courses/${courseId}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">{course.title}</h1>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-1 text-sm font-semibold">Course tags</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Add tags to your course to help learners quickly filter and discover it
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-language" className="text-xs text-muted-foreground">
              Language
            </Label>
            <select
              id="s-language"
              className={SELECT}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="">Select language</option>
              {COURSE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-difficulty" className="text-xs text-muted-foreground">
              Difficulty
            </Label>
            <select
              id="s-difficulty"
              className={SELECT}
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as StandaloneCourseDifficulty | "")
              }
            >
              <option value="">Select difficulty</option>
              {COURSE_DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-topic" className="text-xs text-muted-foreground">
              Topic
            </Label>
            <select
              id="s-topic"
              className={SELECT}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">Select topic</option>
              {COURSE_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <CollapsibleSection title="Instructor details">
        <div className="space-y-1.5">
          <Label htmlFor="s-inst-heading">Heading</Label>
          <Input
            id="s-inst-heading"
            value={instHeading}
            onChange={(e) => setInstHeading(e.target.value)}
            maxLength={255}
          />
          <p className="text-xs text-muted-foreground">
            Displayed above the instructor name
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-inst-name">Name</Label>
          <Input
            id="s-inst-name"
            value={instName}
            onChange={(e) => setInstName(e.target.value)}
            placeholder="Name"
            maxLength={255}
          />
          <p className="text-xs text-muted-foreground">
            Displayed on the course detail and checkout pages
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-inst-title">Title</Label>
          <Input
            id="s-inst-title"
            value={instTitle}
            onChange={(e) => setInstTitle(e.target.value)}
            placeholder="Flexibility Coach or Mobility Specialist"
            maxLength={255}
          />
          <p className="text-xs text-muted-foreground">
            Displayed below the instructor name
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-inst-bio">Bio</Label>
          <Textarea
            id="s-inst-bio"
            value={instBio}
            onChange={(e) => setInstBio(e.target.value)}
            placeholder="Bio"
            maxLength={1000}
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">
            This will appear on the course detail and checkout pages
          </p>
        </div>
        <ImageUpload
          label="Instructor Headshot"
          hint="Recommended dimensions of 300×300."
          value={instHeadshotUrl}
          onChange={setInstHeadshotUrl}
          onUpload={(file) =>
            uploadStandaloneCourseImage(file, subAccountId, courseId, "instructor-headshot")
          }
          aspect="square"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Customization">
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUpload
            label="Logo Image"
            hint="Recommended dimensions of 640×640."
            value={logoUrl}
            onChange={setLogoUrl}
            onUpload={(file) => uploadStandaloneCourseImage(file, subAccountId, courseId, "logo")}
            aspect="square"
          />
          <ImageUpload
            label="Favicon Image"
            hint="Recommended dimensions of 32×32."
            value={faviconUrl}
            onChange={setFaviconUrl}
            onUpload={(file) =>
              uploadStandaloneCourseImage(file, subAccountId, courseId, "favicon")
            }
            aspect="square"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Learning experience">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">
              Automatically play next lesson
            </span>
            <span className="block text-xs text-muted-foreground">
              When enabled, the next lesson will start playing automatically
              after the current lesson ends
            </span>
          </span>
          <Switch checked={autoplayNext} onCheckedChange={setAutoplayNext} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">
              Automatically play first lesson
            </span>
            <span className="block text-xs text-muted-foreground">
              When enabled, the first lesson in a course will start playing
              automatically when accessed
            </span>
          </span>
          <Switch checked={autoplayFirst} onCheckedChange={setAutoplayFirst} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">
              Auto complete lessons
            </span>
            <span className="block text-xs text-muted-foreground">
              When enabled, lessons are marked complete automatically as
              learners progress through them. When disabled, learners must
              mark lessons complete manually.
            </span>
          </span>
          <Switch checked={autoComplete} onCheckedChange={setAutoComplete} />
        </label>
        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <p className="text-sm font-medium">Apply to all courses</p>
            <p className="text-xs text-muted-foreground">
              Applies these learning experience settings to all courses.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={applyToAllCourses}
            disabled={applyingAll}
          >
            {applyingAll && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Apply to all courses
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced">
        <div>
          <div className="mb-2 flex gap-4 border-b text-sm">
            <button
              type="button"
              onClick={() => setAdvancedTab("js")}
              className={
                advancedTab === "js"
                  ? "border-b-2 border-primary pb-2 font-medium text-primary"
                  : "pb-2 text-muted-foreground"
              }
            >
              Custom Javascript
            </button>
            <button
              type="button"
              onClick={() => setAdvancedTab("css")}
              className={
                advancedTab === "css"
                  ? "border-b-2 border-primary pb-2 font-medium text-primary"
                  : "pb-2 text-muted-foreground"
              }
            >
              Custom CSS
            </button>
          </div>
          {advancedTab === "js" ? (
            <Textarea
              value={customJs}
              onChange={(e) => setCustomJs(e.target.value)}
              className="min-h-32 font-mono text-xs"
            />
          ) : (
            <Textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              className="min-h-32 font-mono text-xs"
            />
          )}
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">
            Tracking Codes <span className="text-muted-foreground">(Header/Footer)</span>
          </p>
          <div className="mb-2 flex gap-4 border-b text-sm">
            <button
              type="button"
              onClick={() => setTrackingTab("header")}
              className={
                trackingTab === "header"
                  ? "border-b-2 border-primary pb-2 font-medium text-primary"
                  : "pb-2 text-muted-foreground"
              }
            >
              Header Tracking Code
            </button>
            <button
              type="button"
              onClick={() => setTrackingTab("footer")}
              className={
                trackingTab === "footer"
                  ? "border-b-2 border-primary pb-2 font-medium text-primary"
                  : "pb-2 text-muted-foreground"
              }
            >
              Footer Tracking Code
            </button>
          </div>
          {trackingTab === "header" ? (
            <Textarea
              value={headerTrackingCode}
              onChange={(e) => setHeaderTrackingCode(e.target.value)}
              className="min-h-24 font-mono text-xs"
            />
          ) : (
            <Textarea
              value={footerTrackingCode}
              onChange={(e) => setFooterTrackingCode(e.target.value)}
              className="min-h-24 font-mono text-xs"
            />
          )}
        </div>
      </CollapsibleSection>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
        <Link href={`/sa/${subAccountId}/courses/${courseId}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
