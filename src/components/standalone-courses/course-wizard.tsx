"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload } from "@/components/community/image-upload";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { CoursePreviewCard } from "@/components/standalone-courses/course-preview-card";
import { uploadStandaloneCourseImage } from "@/lib/community/upload-image";
import { cn } from "@/lib/utils";
import type {
  StandaloneCourse,
  StandaloneCourseAccess,
  StandaloneCourseBillingType,
  StandaloneCourseRecurringInterval,
} from "@/types/standalone-courses";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

type Step = "details" | "thumbnail" | "pricing";
const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "thumbnail", label: "Upload Thumbnail" },
  { id: "pricing", label: "Pricing" },
];

function plainTextSnippet(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Full-page course wizard — shared by both creation (`courses/new`) and
 * editing (`courses/[courseId]/edit`), so the two flows stay identical.
 * Spacious 3-step layout (Details → Upload Thumbnail → Pricing) with a live
 * preview panel that updates as you type, replacing the old cramped modal
 * for both cases.
 */
export function CourseWizard({
  subAccountId,
  mode,
  course,
  cancelHref,
  onDone,
}: {
  subAccountId: string;
  mode: "create" | "edit";
  /** Required (loaded) when `mode === "edit"`. */
  course?: StandaloneCourse | null;
  cancelHref: string;
  onDone: (courseId: string) => void;
}) {
  const [step, setStep] = useState<Step>("details");
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  const [title, setTitle] = useState(course?.title ?? "");
  const [about, setAbout] = useState(course?.aboutHtml ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [coverUrl, setCoverUrl] = useState<string | null>(course?.coverUrl ?? null);
  const [access, setAccess] = useState<StandaloneCourseAccess>(
    course?.access ?? "open",
  );
  const [billingType, setBillingType] = useState<StandaloneCourseBillingType>(
    course?.billingType ?? "oneTime",
  );
  const [price, setPrice] = useState(
    course?.priceCents != null ? (course.priceCents / 100).toString() : "",
  );
  const [recurringInterval, setRecurringInterval] =
    useState<StandaloneCourseRecurringInterval>(course?.recurringInterval ?? "month");
  const [trialDays, setTrialDays] = useState(
    course?.trialDays != null ? course.trialDays.toString() : "",
  );
  const [priceTextOverride, setPriceTextOverride] = useState("");
  const [published, setPublished] = useState(course?.published ?? false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const courseIdForUploads = course?.id ?? "new";

  function goNext() {
    if (step === "details") {
      if (!title.trim()) {
        toast.error("Enter a course title");
        return;
      }
      setStep("thumbnail");
      return;
    }
    if (step === "thumbnail") {
      setStep("pricing");
    }
  }

  function goBack() {
    if (step === "thumbnail") setStep("details");
    else if (step === "pricing") setStep("thumbnail");
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        aboutHtml: about,
        coverUrl,
        category: category.trim() || null,
        access,
        priceCents:
          access === "purchase" && price.trim()
            ? Math.round(parseFloat(price) * 100)
            : null,
        billingType: access === "purchase" ? billingType : undefined,
        recurringInterval:
          access === "purchase" && billingType === "recurring"
            ? recurringInterval
            : null,
        trialDays:
          access === "purchase" && billingType === "recurring" && trialDays.trim()
            ? Number(trialDays)
            : null,
        priceTextOverride: priceTextOverride.trim() || null,
        published,
      };
      const url =
        mode === "create"
          ? `/api/sub-accounts/${subAccountId}/standalone-courses`
          : `/api/sub-accounts/${subAccountId}/standalone-courses/${course!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        course?: { id: string };
      };
      if (!res.ok || d.ok === false) {
        throw new Error(d.error ?? "Couldn't save");
      }
      const id = mode === "create" ? d.course?.id : course!.id;
      if (!id) throw new Error("Couldn't save");
      toast.success(mode === "create" ? "Course created." : "Course saved.");
      onDone(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-8">
      <div className="grid gap-16 lg:grid-cols-[1fr_320px]">
        <div>
          <Link
            href={cancelHref}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {mode === "create" ? "Create Course" : "Edit Course"}
          </Link>

          <div className="grid gap-10 sm:grid-cols-[180px_1fr]">
            <ol className="relative flex flex-row gap-4 sm:flex-col sm:gap-0">
              {STEPS.map((s, i) => (
                <li key={s.id} className="relative flex-1 sm:flex sm:pb-10 sm:last:pb-0">
                  {i < STEPS.length - 1 && (
                    <span
                      className="absolute left-4 top-8 hidden h-full w-px bg-border sm:block"
                      aria-hidden
                    />
                  )}
                  <div className="flex items-center gap-3 sm:items-start">
                    <button
                      type="button"
                      onClick={() => setStep(s.id)}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        i <= stepIndex
                          ? "bg-primary text-primary-foreground"
                          : "border text-muted-foreground",
                      )}
                    >
                      {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                    </button>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        i === stepIndex ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="max-w-xl space-y-6">
              {step === "details" && (
                <>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                      Start with the basics
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      Add a title and description to introduce your course.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-title">
                      Course Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="w-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter course title"
                      maxLength={255}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Give your course a descriptive name.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-category">Category (optional)</Label>
                    <Input
                      id="w-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Creative"
                      maxLength={40}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Course Description</Label>
                    <RichTextEditor
                      value={about}
                      onChange={setAbout}
                      onUploadImage={(file) =>
                        uploadStandaloneCourseImage(
                          file,
                          subAccountId,
                          courseIdForUploads,
                          "lesson",
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Explain what members will learn from this course.
                    </p>
                  </div>
                </>
              )}

              {step === "thumbnail" && (
                <>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                      Add a visual identity
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      Pick an image that reflects your course.
                    </p>
                  </div>
                  <ImageUpload
                    label="Course Thumbnail"
                    hint="Recommended aspect ratio 1280×720."
                    value={coverUrl}
                    onChange={setCoverUrl}
                    onUploadingChange={setImgUploading}
                    onUpload={(file) =>
                      uploadStandaloneCourseImage(
                        file,
                        subAccountId,
                        courseIdForUploads,
                        "cover",
                      )
                    }
                    aspect="video"
                  />
                </>
              )}

              {step === "pricing" && (
                <>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                      Set up pricing
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      Select how to offer your course.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-access">Access</Label>
                    <select
                      id="w-access"
                      className={SELECT}
                      value={access}
                      onChange={(e) =>
                        setAccess(e.target.value as StandaloneCourseAccess)
                      }
                    >
                      <option value="open">Free</option>
                      <option value="purchase">Purchase</option>
                    </select>
                  </div>

                  {access === "purchase" && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="w-billing">Billing</Label>
                        <select
                          id="w-billing"
                          className={SELECT}
                          value={billingType}
                          onChange={(e) =>
                            setBillingType(
                              e.target.value as StandaloneCourseBillingType,
                            )
                          }
                        >
                          <option value="oneTime">One Time</option>
                          <option value="recurring">Recurring</option>
                        </select>
                      </div>

                      {billingType === "recurring" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="w-frequency">Billing Period</Label>
                          <select
                            id="w-frequency"
                            className={SELECT}
                            value={recurringInterval}
                            onChange={(e) =>
                              setRecurringInterval(
                                e.target.value as StandaloneCourseRecurringInterval,
                              )
                            }
                          >
                            <option value="day">Daily</option>
                            <option value="week">Weekly</option>
                            <option value="month">Monthly</option>
                            <option value="year">Yearly</option>
                          </select>
                        </div>
                      )}

                      <div className="flex gap-4">
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor="w-price">Price</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input
                              id="w-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={price}
                              onChange={(e) => setPrice(e.target.value)}
                              placeholder="1.00"
                            />
                            <span className="text-sm text-muted-foreground">USD</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Amount of each payment
                            {billingType === "recurring"
                              ? " at the end of the billing cycle."
                              : "."}
                          </p>
                        </div>
                        {billingType === "recurring" && (
                          <div className="flex-1 space-y-1.5">
                            <Label htmlFor="w-trial-days">Trial Days</Label>
                            <Input
                              id="w-trial-days"
                              type="number"
                              min="0"
                              value={trialDays}
                              onChange={(e) => setTrialDays(e.target.value)}
                              placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground">
                              Number of days until first billing.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="w-price-text">
                          Price Text Override (optional)
                        </Label>
                        <Input
                          id="w-price-text"
                          value={priceTextOverride}
                          onChange={(e) => setPriceTextOverride(e.target.value)}
                          placeholder="Custom Phrase"
                        />
                      </div>
                    </>
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={published}
                      onCheckedChange={(v) => setPublished(v === true)}
                    />
                    Published (visible on the public sales page)
                  </label>
                </>
              )}

              <div className="flex justify-between pt-4">
                {step === "details" ? (
                  <Link href={cancelHref}>
                    <Button variant="outline">Cancel</Button>
                  </Link>
                ) : (
                  <Button variant="outline" onClick={goBack}>
                    Back
                  </Button>
                )}
                {step === "pricing" ? (
                  <Button onClick={submit} disabled={saving || imgUploading}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    {mode === "create" ? "Create Course" : "Save"}
                  </Button>
                ) : (
                  <Button onClick={goNext}>Continue</Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-8">
            <CoursePreviewCard
              title={title}
              coverUrl={coverUrl}
              description={plainTextSnippet(about)}
              access={access}
              priceCents={
                price.trim() ? Math.round(parseFloat(price) * 100) : null
              }
              billingType={billingType}
              recurringInterval={recurringInterval}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
