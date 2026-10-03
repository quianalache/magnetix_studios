import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import { CHART_DESIGN_SET_SYSTEMS } from "@/types/chart-design-set";
import { CHART_DESIGN_SYSTEM_FIELDS } from "./chart-design-fields";
import { CHART_DESIGN_PRESETS } from "./chart-design-presets";

/**
 * The unified Chart Design editor's state, as pure functions (2026-10).
 * The editor component is a thin layer over this, so the behavior that
 * matters — independent per-system values, presets touching only their
 * own system, unsaved-change tracking across sections, and exactly what
 * one Save sends — is covered by the checks without a browser.
 */

export type EditorValue = string | number;
export type SystemValues = Record<string, EditorValue>;

export type HouseSystem = ChartDesign["houseSystem"];

export interface ChartDesignEditorState {
  setId: string;
  isDefault: boolean;
  name: string;
  savedName: string;
  values: Record<ChartDesignSystem, SystemValues>;
  saved: Record<ChartDesignSystem, SystemValues>;
  /** Calculation setting — editable only on the default design (it's what new readings are calculated with). */
  houseSystem: HouseSystem | null;
  savedHouseSystem: HouseSystem | null;
}

function systemValues(design: ChartDesign | null, system: ChartDesignSystem): SystemValues {
  const out: SystemValues = {};
  if (!design) return out;
  for (const key of CHART_DESIGN_SYSTEM_FIELDS[system]) {
    const v = (design as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" || typeof v === "number") out[key] = v;
  }
  return out;
}

export function initChartDesignEditorState(set: ChartDesignSetWithMembers): ChartDesignEditorState {
  const values = {} as Record<ChartDesignSystem, SystemValues>;
  for (const system of CHART_DESIGN_SET_SYSTEMS) values[system] = systemValues(set.designs[system], system);
  const house = set.isDefault ? (set.designs.astrology?.houseSystem ?? "placidus") : null;
  return {
    setId: set.id,
    isDefault: set.isDefault,
    name: set.name,
    savedName: set.name,
    values,
    saved: structuredClone(values),
    houseSystem: house,
    savedHouseSystem: house,
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

export function setEditorHouseSystem(state: ChartDesignEditorState, houseSystem: HouseSystem): ChartDesignEditorState {
  if (!state.isDefault) return state;
  return { ...state, houseSystem };
}

/** Applies a named preset to ONE system's unsaved values — never another system, never saved until Save. */
export function applyEditorPreset(
  state: ChartDesignEditorState,
  system: ChartDesignSystem,
  presetName: string,
): ChartDesignEditorState {
  const preset = CHART_DESIGN_PRESETS[system].find((p) => p.name === presetName);
  if (!preset) return state;
  const allowed = CHART_DESIGN_SYSTEM_FIELDS[system] as readonly string[];
  const next = { ...state.values[system] };
  for (const [key, value] of Object.entries(preset.values)) {
    if (allowed.includes(key) && (typeof value === "string" || typeof value === "number")) next[key] = value;
  }
  return { ...state, values: { ...state.values, [system]: next } };
}

function changedFields(current: SystemValues, saved: SystemValues): SystemValues {
  const out: SystemValues = {};
  for (const [key, value] of Object.entries(current)) if (saved[key] !== value) out[key] = value;
  return out;
}

export function dirtySystems(state: ChartDesignEditorState): ChartDesignSystem[] {
  return CHART_DESIGN_SET_SYSTEMS.filter((s) => Object.keys(changedFields(state.values[s], state.saved[s])).length > 0);
}

export function isEditorDirty(state: ChartDesignEditorState): boolean {
  return (
    state.name.trim() !== state.savedName ||
    state.houseSystem !== state.savedHouseSystem ||
    dirtySystems(state).length > 0
  );
}

export interface ChartDesignSavePayload {
  name?: string;
  humanDesign?: SystemValues;
  mandala?: SystemValues;
  astrology?: SystemValues;
  astrologyCalculation?: { houseSystem: HouseSystem };
}

/** Exactly what one Save sends: only the changed fields, per system, plus a changed name / house system. Null = nothing to save. */
export function buildEditorSavePayload(state: ChartDesignEditorState): ChartDesignSavePayload | null {
  const payload: ChartDesignSavePayload = {};
  const name = state.name.trim();
  if (name !== state.savedName) payload.name = name;
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    const changed = changedFields(state.values[system], state.saved[system]);
    if (Object.keys(changed).length > 0) payload[system] = changed;
  }
  if (state.isDefault && state.houseSystem && state.houseSystem !== state.savedHouseSystem) {
    payload.astrologyCalculation = { houseSystem: state.houseSystem };
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
