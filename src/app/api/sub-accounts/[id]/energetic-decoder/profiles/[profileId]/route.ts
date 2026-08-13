import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { updateEnergeticProfile } from "@/lib/server/energetic-profile-service";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";

/**
 * Phase 3 Task 5 (2026-08-13) — Edit Profile. Thin wrapper around Task 1's
 * `updateEnergeticProfile` (tenancy already enforced there — throws if the
 * profile doesn't exist or belongs to a different sub-account). Editing a
 * Profile only ever touches the `energeticProfiles` doc; it never reads or
 * writes `energeticDecoderReadings` or `generatedReports` — that isolation
 * is what keeps historical Readings/GeneratedReports untouched by design,
 * not by a check this route has to remember to make.
 *
 * Same place-resolution fallback as reading creation
 * (energetic-decoder-service.ts): if the caller sends a birthPlace without
 * matching lat/lng/timeZone (the practitioner edited the text but didn't
 * pick a fresh autocomplete suggestion), this geocodes it server-side via
 * the same `geocodeBirthPlace` helper rather than reimplementing that
 * resolution a second time.
 */

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id: subAccountId, profileId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = str(body.name)?.trim();
  const birthDate = str(body.birthDate)?.trim();
  const birthTime = str(body.birthTime)?.trim();
  const birthPlace = str(body.birthPlace)?.trim();
  if (!name || !birthDate || !birthTime || !birthPlace) {
    return NextResponse.json(
      { error: "Name, birth date, birth time, and birth place are all required." },
      { status: 400 },
    );
  }

  const relationshipLabelRaw = str(body.relationshipLabel)?.trim();
  const lat = typeof body.lat === "number" ? body.lat : undefined;
  const lng = typeof body.lng === "number" ? body.lng : undefined;
  const timeZone = str(body.timeZone);

  let resolvedLat = lat;
  let resolvedLng = lng;
  let resolvedTimeZone = timeZone;
  if (resolvedLat === undefined || resolvedLng === undefined || !resolvedTimeZone) {
    const place = await geocodeBirthPlace(birthPlace);
    if (!place) {
      return NextResponse.json(
        { error: `Couldn't find "${birthPlace}" — try a more specific place (city, state/country).` },
        { status: 422 },
      );
    }
    resolvedLat = place.lat;
    resolvedLng = place.lng;
    resolvedTimeZone = place.timeZone;
  }

  try {
    const profile = await updateEnergeticProfile(subAccountId, profileId, {
      name,
      relationshipLabel: relationshipLabelRaw || null,
      birthDate,
      birthTime,
      birthPlace,
      timeZone: resolvedTimeZone,
      lat: resolvedLat,
      lng: resolvedLng,
    });
    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json({ error: "That profile could not be found." }, { status: 404 });
  }
}
