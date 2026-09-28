import "server-only";

/** Firestore → JSON: Timestamps (recursively) become ISO strings. */
export function toJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  const t = value as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJson(v);
    }
    return out;
  }
  return value;
}

export function taskJson(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(toJson(data) as Record<string, unknown>) };
}
