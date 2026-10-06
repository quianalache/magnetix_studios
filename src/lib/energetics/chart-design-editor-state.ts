import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import { CHART_DESIGN_SET_SYSTEMS } from "@/types/chart-design-set";
import { CHART_DESIGN_SYSTEM_FIELDS } from "./chart-design-fields";
import { MANDALA_ELEMENT_FIELDS, resolveMandalaElementColors } from "./mandala-spec";

/**
 * The unified Chart Design editor's state, as pure functions (2026-10).
 * The editor component is a thin layer over this, so the behavior that
 * matters — independent per-system values, unsaved-change tracking across
 * sections, and exactly what one Save sends — is covered by the checks
 * without a browser.
 */

export type EditorValue = string | number;
export type SystemValues = Record<string, EditorValue>;

export interface ChartDesignEditorState {
  setId: string;
  isDefault: boolean;
  name: string;
  savedName: string;
  values: Record<ChartDesignSystem, SystemValues>;
  saved: Record<ChartDesignSystem, SystemValues>;
  /** Mandala element colors shown from the read-time fallback (the saved record has no value yet) — written explicitly with the first Mandala save, so what was shown stays exactly what's stored. */
  implicitMandalaFields?: string[];
}

function implicitMandalaFields(design: ChartDesign | null): string[] {
  if (!design) return [];
  const rec = design as unknown as Record<string, unknown>;
  return Object.values(MANDALA_ELEMENT_FIELDS).filter((f) => typeof rec[f] !== "string" || !rec[f]);
}

function systemValues(design: ChartDesign | null, system: ChartDesignSystem): SystemValues {
  const out: SystemValues = {};
  if (!design) return out;
  for (const key of CHART_DESIGN_SYSTEM_FIELDS[system]) {
    const v = (design as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" || typeof v === "number") out[key] = v;
  }
  // Designs saved before the zodiac element colors existed: show (and
  // compare against) the colors they actually render with, so the pickers
  // aren't blank and nothing reads as an unsaved change until edited.
  if (system === "mandala") {
    const resolved = resolveMandalaElementColors(design);
    for (const [element, field] of Object.entries(MANDALA_ELEMENT_FIELDS)) {
      if (out[field] === undefined) out[field] = resolved[element as keyof typeof resolved];
    }
  }
  return out;
}

export function initChartDesignEditorState(set: ChartDesignSetWithMembers): ChartDesignEditorState {
  const values = {} as Record<ChartDesignSystem, SystemValues>;
  for (const system of CHART_DESIGN_SET_SYSTEMS) values[system] = systemValues(set.designs[system], system);
  return {
    setId: set.id,
    isDefault: set.isDefault,
    name: set.name,
    savedName: set.name,
    values,
    saved: structuredClone(values),
    implicitMandalaFields: implicitMandalaFields(set.designs.mandala),
  };
}

export function setEditorField(
  state: ChartDesignEditorState,
  system: ChartDesignSystem,
  key: string,
  value: EditorValue,
): ChartDesignEditorState {
  if (!(CHART_DESIGN_SYSTEM_FIELDS[system] as readonly string[]).includes(key)) return state;
  return { ...state, values: { ...state.values, [system]: { ...state.values[system], [key]: value } } };
}

export function setEditorName(state: ChartDesignEditorState, name: string): ChartDesignEditorState {
  return { ...state, name };
}

function changedFields(current: SystemValues, saved: SystemValues): SystemValues {
  const out: SystemValues = {};
  for (const [key, value] of Object.entries(current)) if (saved[key] !== value) out[key] = value;
  return out;
}

export function dirtySystems(state: ChartDesignEditorState): ChartDesignSystem[] {
  return CHART_DESIGN_SET_SYSTEMS.filter((s) => Object.keys(changedFields(state.values[s], state.saved[s])).length > 0);
}

/** The fields of one system with unsaved edits. */
export function dirtyFields(state: ChartDesignEditorState, system: ChartDesignSystem): string[] {
  return Object.keys(changedFields(state.values[system], state.saved[system]));
}

export function isEditorDirty(state: ChartDesignEditorState): boolean {
  return state.name.trim() !== state.savedName || dirtySystems(state).length > 0;
}

export interface ChartDesignSavePayload {
  name?: string;
  humanDesign?: SystemValues;
  mandala?: SystemValues;
  astrology?: SystemValues;
}

/** Exactly what one Save sends: only the changed styling fields, per system, plus a changed name. Never a calculation setting. Null = nothing to save. */
export function buildEditorSavePayload(state: ChartDesignEditorState): ChartDesignSavePayload | null {
  const payload: ChartDesignSavePayload = {};
  const name = state.name.trim();
  if (name !== state.savedName) payload.name = name;
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    const changed = changedFields(state.values[system], state.saved[system]);
    if (Object.keys(changed).length > 0) {
      // A Mandala save also pins element colors that were only shown from the fallback.
      if (system === "mandala") for (const f of state.implicitMandalaFields ?? []) if (!(f in changed)) changed[f] = state.values.mandala[f];
      payload[system] = changed;
    }
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

/** A name the server will accept (non-empty after trimming). */
export function editorNameError(state: ChartDesignEditorState): string | null {
  return state.name.trim() ? null : "Give this design a name.";
}

/** A full design for the live preview: the saved record with the unsaved values on top. */
export function previewDesign(
  record: ChartDesign | null,
  values: SystemValues,
): ChartDesign | null {
  if (!record) return null;
  return { ...record, ...values } as ChartDesign;
}
