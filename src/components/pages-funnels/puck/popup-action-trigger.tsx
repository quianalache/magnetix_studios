"use client";

import { useContext, type CSSProperties, type ReactNode } from "react";
import { canExecutePageAction, executePageAction, popupActionKind } from "@/lib/pages-funnels/action/execute";
import { ActionSurfaceContext, PopupControllerContext } from "@/components/pages-funnels/puck/popup-action-context";
import type { PageAction } from "@/types/pages-funnels-puck";

/**
 * The clickable element for a Button / Image whose action is a Popup action
 * (Slice 5). It never routes anything itself: a click goes to the shared
 * `executePageAction` with the Popup host it's rendered in. Outside a host,
 * on the wrong surface, or with a missing target it's an inert, labelled
 * button (aria-disabled) — never an error.
 */
export function PopupActionTrigger({
  id,
  action,
  className,
  style,
  label,
  children,
}: {
  id?: string;
  action: PageAction;
  className?: string;
  style?: CSSProperties;
  /** Accessible name when the content itself has none (e.g. an image with no alt text). */
  label?: string;
  children: ReactNode;
}) {
  const runtime = useContext(PopupControllerContext);
  const surface = useContext(ActionSurfaceContext);
  const kind = popupActionKind(action);
  const enabled = canExecutePageAction(action, runtime, surface);
  return (
    <button
      type="button"
      id={id}
      className={className}
      style={style}
      aria-label={label}
      aria-haspopup={kind === "open_popup" ? "dialog" : undefined}
      aria-disabled={enabled ? undefined : true}
      data-page-action={kind ?? undefined}
      onClick={(event) => executePageAction(action, runtime, { surface, opener: event.currentTarget })}
    >
      {children}
    </button>
  );
}
