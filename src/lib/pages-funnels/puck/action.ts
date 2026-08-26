import type { PageAction } from "@/types/pages-funnels-puck";

/**
 * Resolves a `PageAction` (master spec §8, Build Phase 3's future Shared
 * Action system) to a plain `href` string for elements that just need
 * *somewhere to link to* today (Button, Image) — Phase 1 foundation only.
 *
 * Only `{ type: "url" }` actually resolves. Every other action type is a
 * real, reserved case in the switch (not a default/fallthrough) specifically
 * so this function fails to compile if a new `PageAction` variant is added
 * without a decision being made about it here — that's the whole point of
 * introducing `PageAction` now instead of a bare `href: string`: Phase 3 can
 * teach this function what "Go to Next Funnel Step" etc. actually resolve
 * to without changing Button/Image's prop shape at all.
 *
 * Deliberately does NOT implement funnel-step resolution, scrolling, popups,
 * or any other behavior yet — per the master spec's explicit "reserve the
 * type structure, do not implement the behavior yet" instruction for
 * Phase 1. Unimplemented types resolve to `undefined` (renders as an inert,
 * non-navigating element) rather than throwing, so a page holding one of
 * these reserved-but-not-yet-behavioral actions still renders safely.
 */
export function resolveActionHref(
  action: PageAction | undefined | null
): string | undefined {
  if (!action) return undefined;

  switch (action.type) {
    case "url":
      return action.url || undefined;

    // Reserved for later phases — see this file's doc comment and master
    // spec §8/§12. Each case is listed explicitly (not grouped into a
    // `default`) so adding a new PageAction variant without updating this
    // switch is a compile error, not a silent no-op.
    case "none":
    case "next_funnel_step":
    case "selected_funnel_step":
    case "scroll":
    case "open_popup":
    case "close_popup":
    case "show_hide":
    case "submit_form":
    case "download":
    case "call":
    case "sms":
    case "email":
    case "purchase":
    case "accept_upsell":
    case "decline_continue":
      return undefined;

    default: {
      // Exhaustiveness guard — if this ever fails to compile, a new
      // PageAction variant was added without a case above.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** Whether an action opens in a new tab — only meaningful for `url` today;
 *  reserved types simply report `false`. Kept separate from
 *  `resolveActionHref` so callers that need BOTH an href and target
 *  behavior (Button's `<a>`) don't have to re-switch on `action.type`
 *  themselves. */
export function actionOpensNewTab(
  action: PageAction | undefined | null
): boolean {
  return !!action && action.type === "url" && !!action.openInNewTab;
}
