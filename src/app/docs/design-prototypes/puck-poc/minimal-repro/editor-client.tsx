"use client";

import { useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import type { Config, Data } from "@puckeditor/core";

/**
 * MINIMAL STOCK PUCK REPRO -- Puck Insert Undo Blocker task, §5.
 *
 * Deliberately the simplest possible Puck setup: ONE component, ONE text
 * field, NO slot components, NO Magnetix styling, NO `inline`/`dragRef`,
 * NO custom Row/Column, NO contentEditable, NO PublicForm. Just
 * <Puck config={config} data={data} /> with a single "Item" component,
 * to answer: does stock Puck 0.23.0 itself fail to undo the FIRST
 * insert of a session, or is that specific to the main Magnetix POC's
 * configuration?
 */

const config: Config = {
  components: {
    Item: {
      fields: { label: { type: "text" } },
      defaultProps: { label: "Item" },
      render: ({ label }) => <div style={{ padding: 16, border: "1px solid #ccc" }}>{label}</div>,
    },
  },
};

// Non-empty seeded initial content (still flat, zero slots) -- testing
// whether the main POC's non-empty initial data is the actual
// differentiator for the first-insert-undo bug, isolated from slot
// nesting, viewports/iframe/metadata props, and contentEditable.
const initialData: Data = {
  content: [
    { type: "Item", props: { id: "seed-item-1", label: "Seed Item 1" } },
    { type: "Item", props: { id: "seed-item-2", label: "Seed Item 2" } },
    { type: "Item", props: { id: "seed-item-3", label: "Seed Item 3" } },
  ],
  root: { props: {} },
};

// Hoisted to a stable module-level reference -- testing whether a fresh
// inline object literal (`iframe={{ enabled: true }}`, a new identity on
// every re-render of a controlled <Puck data={data} onChange={setData}/>)
// is the actual trigger for the first-insert-undo bug, isolated from
// everything else. See the task's §5/§6 requirements (supported-API fix
// only, no monkey-patching).
const STABLE_IFRAME_CONFIG = { enabled: true };

export default function MinimalReproEditor() {
  const [data, setData] = useState<Data>(initialData);
  return (
    <div style={{ height: "100vh" }}>
      <Puck config={config} data={data} onChange={setData} iframe={STABLE_IFRAME_CONFIG} />
    </div>
  );
}
