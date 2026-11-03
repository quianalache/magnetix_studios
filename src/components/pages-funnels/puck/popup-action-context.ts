"use client";

import { createContext } from "react";
import type { ActionSurface, PopupActionRuntime } from "@/lib/pages-funnels/action/execute";

/**
 * Slice 5 runtime contexts, in their own module (no block-config imports) so
 * the Button / Image renderers can read them without an import cycle.
 */

/** The page's Popup controller — what `executePageAction` runs against. Null outside a host (builder, prototypes). */
export const PopupControllerContext = createContext<PopupActionRuntime | null>(null);
/** Which content a block is rendered in: the page, or the active Popup. */
export const ActionSurfaceContext = createContext<ActionSurface>("page");
