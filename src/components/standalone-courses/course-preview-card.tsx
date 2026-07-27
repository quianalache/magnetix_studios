import { formatCurrency } from "@/lib/format";

/**
 * Live preview card shown alongside the course-creation wizard — updates as
 * the staff member fills in each step, so they can see what the Products
 * grid card will actually look like before committing. Deliberately lighter
 * than the real grid card (no published/draft badge, no enrollment count,
 * no "View" link — none of that exists yet mid-creation).
 */
export function CoursePreviewCard({
  title,
  coverUrl,
  description,
  access,
  priceCents,
  billingType,
  recurringInterval,
}: {
  title: string;
  coverUrl: string | null;
  description: string;
  access: "open" | "purchase";
  priceCents: number | null;
  billingType: "oneTime" | "recurring";
  recurringInterval: "day" | "week" | "month" | "year";
}) {
  const priceLabel =
    access === "open"
      ? "Free"
      : priceCents != null
        ? billingType === "recurring"
          ? `${formatCurrency(priceCents / 100, "USD")} / ${recurringInterval}`
          : formatCurrency(priceCents / 100, "USD")
        : "Free";

  return (
    <div className="w-full max-w-xs overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="relative">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">
            {title.trim() ? title.trim().charAt(0).toUpperCase() : "?"}
          </div>
        )}
        <span
          className={
            access === "open"
              ? "absolute bottom-2 right-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white"
              : "absolute bottom-2 right-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white/80 dark:text-zinc-900"
          }
        >
          {priceLabel}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="text-sm font-medium">
          {title.trim() || "Course Title"}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {description.trim() || "Course Description"}
        </p>
      </div>
    </div>
  );
}
