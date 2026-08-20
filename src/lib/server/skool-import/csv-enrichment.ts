import "server-only";

import type { EnrichedSkoolMember, SkoolCsvMemberRow, SkoolMember } from "./types";

/**
 * TEMPORARY, OPTIONAL supplemental email source for THIS first migration —
 * NOT the permanent product architecture.
 *
 * Live investigation found Skool's own authenticated Members payload
 * carries a real email for only a minority of members (a `member.metadata
 * .mbme` field, populated mainly for paid/Stripe-checkout joins — see
 * skool-extract.ts's own comment). Skool's owner-only, email-verification-
 * gated CSV export is the one place that reliably has every member's real
 * email. The eventual self-service importer should try to trigger that
 * export programmatically and walk the owner through the verification-code
 * step in-product (see the final report's "self-service future" section)
 * rather than asking every customer to manually download/re-upload a file
 * forever — this module exists so today's real cutover isn't blocked while
 * that's built.
 *
 * Matching is by normalized email FIRST (the CSV's own email column, when
 * we already have a Skool-sourced signal to cross-check against), falling
 * back to normalized full-name match when Skool's own payload has no email
 * at all for that member. Name-only matches are flagged distinctly
 * (`emailSource: "csv"` either way, but the caller can tell from
 * `csvRow` + absence of a Skool-sourced email which rows were name-matched)
 * so the importer's dry-run report can surface anything worth a human
 * glance rather than silently trusting a fuzzy match.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Minimal RFC-4180-ish CSV parser — handles quoted fields with embedded
 *  commas/newlines/escaped quotes, which is all this export needs. Not a
 *  general-purpose CSV library; deliberately small and dependency-free. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      push();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

const QUESTION_ANSWER_COLUMN_PAIRS = [
  [5, 6],
  [7, 8],
  [9, 10],
] as const;

export function parseSkoolMembersCsv(csvText: string): SkoolCsvMemberRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];
  const [, ...dataRows] = rows; // header row assumed present, columns are positional per Skool's own export
  const out: SkoolCsvMemberRow[] = [];
  for (const r of dataRows) {
    const [firstName = "", lastName = "", email = "", invitedBy = "", joinedDate = ""] = r;
    const answers = QUESTION_ANSWER_COLUMN_PAIRS.map(([qi, ai]) => ({
      question: (r[qi] ?? "").trim(),
      answer: (r[ai] ?? "").trim(),
    })).filter((qa) => qa.question || qa.answer);
    out.push({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizeEmail(email),
      invitedBy: invitedBy.trim(),
      joinedDateIso: joinedDate.trim() ? new Date(joinedDate.trim().replace(" ", "T") + "Z").toISOString() : null,
      answers,
      price: (r[11] ?? "").trim(),
      recurringInterval: (r[12] ?? "").trim(),
      tier: (r[13] ?? "").trim(),
      ltv: (r[14] ?? "").trim(),
    });
  }
  return out;
}

export interface CsvMergeResult {
  enriched: EnrichedSkoolMember[];
  /** CSV rows that couldn't be matched to any extracted Skool member
   *  (different email AND different name) — surfaced, never silently
   *  dropped. */
  unmatchedCsvRows: SkoolCsvMemberRow[];
  /** CSV rows sharing the same normalized email — the LAST one wins the
   *  merge, all are reported so a human can sanity-check the choice. */
  duplicateCsvEmails: { email: string; count: number }[];
}

export function mergeCsvEmails(
  skoolMembers: SkoolMember[],
  csvRows: SkoolCsvMemberRow[],
): CsvMergeResult {
  const emailCounts = new Map<string, number>();
  for (const row of csvRows) {
    if (!row.email) continue;
    emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
  }
  const duplicateCsvEmails = [...emailCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([email, count]) => ({ email, count }));

  const csvByEmail = new Map<string, SkoolCsvMemberRow>();
  const csvByName = new Map<string, SkoolCsvMemberRow>();
  for (const row of csvRows) {
    if (row.email) csvByEmail.set(row.email, row); // last one wins, matching Firestore upsert semantics elsewhere in this importer
    const fullName = normalizeName(`${row.firstName} ${row.lastName}`);
    if (fullName) csvByName.set(fullName, row);
  }

  const matchedCsvKeys = new Set<string>();
  const enriched: EnrichedSkoolMember[] = skoolMembers.map((m) => {
    if (m.email) {
      const csvRow = csvByEmail.get(normalizeEmail(m.email));
      if (csvRow?.email) matchedCsvKeys.add(csvRow.email);
      return {
        ...m,
        resolvedEmail: normalizeEmail(m.email),
        emailSource: "skool-payload" as const,
        csvRow: csvRow ?? null,
      };
    }
    const csvRow = csvByName.get(normalizeName(m.name)) ?? csvByName.get(normalizeName(m.handle));
    if (csvRow) {
      if (csvRow.email) matchedCsvKeys.add(csvRow.email);
      if (csvRow.email) {
        return { ...m, resolvedEmail: csvRow.email, emailSource: "csv" as const, csvRow };
      }
    }
    return { ...m, resolvedEmail: null, emailSource: "unresolved" as const, csvRow: csvRow ?? null };
  });

  const unmatchedCsvRows = csvRows.filter((r) => !r.email || !matchedCsvKeys.has(r.email));

  return { enriched, unmatchedCsvRows, duplicateCsvEmails };
}
