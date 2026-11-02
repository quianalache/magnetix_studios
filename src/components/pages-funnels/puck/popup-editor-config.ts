"use client";

import { createElement } from "react";
import type { Config, CustomField } from "@puckeditor/core";
import type { PopupFrameValue } from "@/lib/pages-funnels/popup-editor";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import { createPopupPuckConfig } from "./popup-config";
import { PopupFrameFieldEditor } from "./popup-frame-field";
import { PopupEditCanvas } from "./popup-edit-canvas";

const popupFrameField: CustomField<PopupFrameValue> = {
  type: "custom",
  label: "Popup frame",
  render: ({ value, onChange }) => createElement(PopupFrameFieldEditor, { value, onChange }),
};

/**
 * Popup Edit Mode config (Slice 4.5): the same restricted block registry,
 * with the Popup FRAME as the root — its one `frame` field is the frame
 * settings (shown when no content block is selected) and its render is the
 * editing canvas (dimmed Page + overlay + panel). See popup-editor.ts for
 * how the frame moves between root props and the saved Popup.
 */
export function createPopupEditorConfig(base: Config): Config {
  const popup = createPopupPuckConfig(base);
  return {
    ...popup,
    root: {
      // Puck titles the settings sidebar (and its breadcrumbs) with the root label.
      label: "Popup",
      fields: { frame: popupFrameField },
      render: (props: { children?: React.ReactNode; frame?: PopupFrameValue; puck?: { metadata?: unknown } }) =>
        createElement(PopupEditCanvas, { frame: props.frame, metadata: props.puck?.metadata as PuckPageMetadata | undefined }, props.children),
    },
  } as Config;
}
