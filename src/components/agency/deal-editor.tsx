"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DealCountdown } from "@/components/landing/deal-countdown";
import { useCountdown } from "@/hooks/use-deal-urgency";
import { cn } from "@/lib/utils";
import {
  DEAL_NAME_MAX,
  DEAL_MEMBER_NOUN_MAX,
  DEAL_OFFER_LABEL_MAX,
  DEAL_SEATS_MIN,
  DEAL_SEATS_MAX,
  type DealConfig,
  type DealType,
} from "@/lib/deal-config";

/**
 * Agency-owner editor for the live deal campaign. Two mutually-exclusive
 * urgency mechanics, picked by the Deal type toggle:
 *
 *   - "Spots counter" — name, scarcity noun, and seat count (today's
 *     behavior, unchanged).
 *   - "Countdown timer" — an offer label ("50% off") + an end date/time.
 *     While the deadline is in the future the landing shows a ticking
 *     timer; after it passes the page KEEPS SELLING at the same price and
 *     just hides the urgency UI (relaunch = save a new date).
 *
 * Edits PATCH to /api/agency/deal-config (writes appConfig/foundersCohort)
 * and flow to the public landing via useFoundersCohort's onSnapshot — no
 * redeploy. The sold counter is Stripe-webhook-owned and deliberately not
 * editable here.
 */

/** ISO (UTC) → value for <input type="datetime-local"> in the local zone. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local zone) → ISO UTC, or null. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(value); // no zone suffix = parsed as local time
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function DealEditor({
  initialConfig,
  soldCount,
}: {
  initialConfig: DealConfig;
  soldCount: number;
}) {
  const [draft, setDraft] = useState<DealConfig>(initialConfig);
  const [saved, setSaved] = useState<DealConfig>(initialConfig);
  const [saving, setSaving] = useState(false);

  const isCountdown = draft.dealType === "countdown";
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const nameEmpty = draft.dealName.trim().length === 0;
  const nounEmpty = draft.memberNoun.trim().length === 0;
  const offerLabelEmpty = draft.offerLabel.trim().length === 0;
  const endsAtMissing = isCountdown && !draft.dealEndsAt;
  const canSave =
    dirty &&
    !saving &&
    !nameEmpty &&
    (isCountdown ? !offerLabelEmpty && !endsAtMissing : !nounEmpty);

  const belowSold = draft.slotsTotal < soldCount;
  const remaining = Math.max(0, draft.slotsTotal - soldCount);
  const progressPct =
    draft.slotsTotal > 0
      ? Math.min(100, Math.round((soldCount / draft.slotsTotal) * 100))
      : 0;

  const endsAtMs = draft.dealEndsAt ? Date.parse(draft.dealEndsAt) : null;
  const { countdown, expired } = useCountdown(
    isCountdown && endsAtMs !== null && Number.isFinite(endsAtMs)
      ? endsAtMs
      : null,
  );

  function set<K extends keyof DealConfig>(key: K, value: DealConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function parseSeats(value: string): number {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < DEAL_SEATS_MIN) return DEAL_SEATS_MIN;
    return Math.min(n, DEAL_SEATS_MAX);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const committed: DealConfig = {
        dealName: draft.dealName.trim(),
        dealType: draft.dealType,
        memberNoun: draft.memberNoun.trim(),
        slotsTotal: draft.slotsTotal,
        dealEndsAt: draft.dealEndsAt,
        offerLabel: draft.offerLabel.trim(),
        fullPriceAfterEnd: draft.fullPriceAfterEnd,
      };
      const res = await fetch("/api/agency/deal-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(committed),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      setDraft(committed);
      setSaved(committed);
      toast.success("Deal saved — live on the landing page.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/30 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Deal</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The current campaign shown across the landing page — hero counter,
          pricing card, announcement bar, CTAs, and FAQ. Changes go live
          immediately, no deploy. Prices ($891 / $1,782) stay in code so the
          display can&apos;t drift from what Stripe charges.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Editor form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Deal type</Label>
            <div className="inline-flex rounded-lg border p-0.5">
              {(
                [
                  ["spots", "Spots counter", Zap],
                  ["countdown", "Countdown timer", Clock],
                ] as Array<[DealType, string, typeof Zap]>
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("dealType", value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    draft.dealType === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isCountdown
                ? "Deadline urgency: “50% off until 31 July” with a live timer. Only one mechanic shows at a time."
                : "Scarcity urgency: “7 of 25 spots claimed” with a progress bar. Only one mechanic shows at a time."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deal-name">Deal name</Label>
            <Input
              id="deal-name"
              value={draft.dealName}
              maxLength={DEAL_NAME_MAX}
              onChange={(e) => set("dealName", e.target.value)}
              placeholder="Founders X Deal"
            />
            {nameEmpty && (
              <p className="text-xs text-destructive">Deal name is required.</p>
            )}
          </div>

          {!isCountdown && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="deal-noun">Member noun (plural)</Label>
                <Input
                  id="deal-noun"
                  value={draft.memberNoun}
                  maxLength={DEAL_MEMBER_NOUN_MAX}
                  onChange={(e) => set("memberNoun", e.target.value)}
                  placeholder="spots"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Used in the scarcity counter: &quot;7 of 25{" "}
                  <span className="font-medium">
                    {draft.memberNoun.trim() || "spots"}
                  </span>{" "}
                  claimed&quot;.
                </p>
                {nounEmpty && (
                  <p className="text-xs text-destructive">
                    Member noun is required.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deal-seats">Total seats</Label>
                <Input
                  id="deal-seats"
                  type="number"
                  min={DEAL_SEATS_MIN}
                  max={DEAL_SEATS_MAX}
                  value={draft.slotsTotal}
                  onChange={(e) => set("slotsTotal", parseSeats(e.target.value))}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Sold so far:{" "}
                  <span className="font-medium text-foreground">
                    {soldCount}
                  </span>{" "}
                  — driven by Stripe purchases. Starting a fresh campaign?
                  Reset{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    appConfig/foundersCohort.soldCount
                  </code>{" "}
                  in the Firebase console; this editor never touches it.
                </p>
                {belowSold && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    New total is below the current sold count — the landing
                    page will treat the deal as sold out (
                    {draft.fullPriceAfterEnd
                      ? "selling at the full $1,782 price"
                      : "counter hidden, buttons switch to “Buy Now” at the deal price"}
                    ).
                  </p>
                )}
              </div>
            </>
          )}

          {isCountdown && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="deal-offer-label">Offer label</Label>
                <Input
                  id="deal-offer-label"
                  value={draft.offerLabel}
                  maxLength={DEAL_OFFER_LABEL_MAX}
                  onChange={(e) => set("offerLabel", e.target.value)}
                  placeholder="50% off"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Display copy only — shown as &quot;
                  <span className="font-medium">
                    {draft.offerLabel.trim() || "50% off"}
                  </span>{" "}
                  until [end date]&quot;. It never changes what Stripe charges.
                </p>
                {offerLabelEmpty && (
                  <p className="text-xs text-destructive">
                    Offer label is required.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deal-ends-at">Deal ends</Label>
                <Input
                  id="deal-ends-at"
                  type="datetime-local"
                  value={isoToLocalInput(draft.dealEndsAt)}
                  onChange={(e) =>
                    set("dealEndsAt", localInputToIso(e.target.value))
                  }
                  className="w-60"
                />
                <p className="text-xs text-muted-foreground">
                  Entered in your local timezone — every visitor counts down
                  to the same moment.
                </p>
                {endsAtMissing && (
                  <p className="text-xs text-destructive">
                    An end date is required for a countdown deal.
                  </p>
                )}
                {!endsAtMissing && expired && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {draft.fullPriceAfterEnd
                      ? "This date is in the past — the timer is hidden and the page is selling at full price ($1,782). Set a future date to relaunch the deal."
                      : "This date is in the past — the timer and urgency copy are hidden, but the landing page keeps selling at the deal price. Set a future date to relaunch."}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
            <label
              htmlFor="deal-full-price-after-end"
              className="flex cursor-pointer items-start gap-2 text-sm font-medium"
            >
              <input
                id="deal-full-price-after-end"
                type="checkbox"
                checked={draft.fullPriceAfterEnd}
                onChange={(e) => set("fullPriceAfterEnd", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                When the deal ends, sell at full price ($1,782)
              </span>
            </label>
            <p className="pl-6 text-xs text-muted-foreground">
              {isCountdown
                ? "After the timer expires, CTAs switch to a $1,782 Stripe checkout with a coupon-code box. Unticked: the page keeps selling at the deal price with urgency hidden."
                : "After the spots sell out, the pricing card's button opens a $1,782 Stripe checkout with a coupon-code box. Unticked: the page keeps selling at the deal price — the counter hides and buttons switch to \"Buy Now\"."}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={!canSave} size="sm">
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
            {dirty && !saving && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        {/* Preview — mirrors the pricing-card badge + urgency block */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Live preview
          </p>
          <div className="rounded-xl bg-background p-6 ring-1 ring-foreground/10">
            <div className="mx-auto max-w-sm space-y-5">
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  <Zap className="h-3 w-3" />
                  {draft.dealName.trim() || "Deal name"} ·{" "}
                  {isCountdown
                    ? draft.offerLabel.trim() || "50% off"
                    : `${draft.slotsTotal} spots only`}
                </span>
              </div>

              <p className="text-center text-2xl font-semibold tracking-tight text-violet-600 dark:text-violet-400">
                {draft.dealName.trim() || "Deal name"}
              </p>

              {!isCountdown && (
                <div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium">
                      {soldCount} of {draft.slotsTotal}{" "}
                      {draft.memberNoun.trim() || "spots"} claimed
                    </span>
                    {remaining > 0 && (
                      <span className="text-muted-foreground">
                        {remaining} left
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {isCountdown &&
                (countdown ? (
                  <div>
                    <p className="text-center text-xs font-medium">
                      {draft.offerLabel.trim() || "50% off"} — offer ends in
                    </p>
                    <DealCountdown
                      parts={countdown}
                      size="sm"
                      className="mt-2"
                    />
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    {endsAtMissing
                      ? "Pick an end date to preview the timer."
                      : draft.fullPriceAfterEnd
                        ? "Timer hidden — the deadline has passed. The page is selling at full price ($1,782)."
                        : "Timer hidden — the deadline has passed. The page keeps selling without urgency."}
                  </p>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
