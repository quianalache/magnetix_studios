import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import { calculateGeneKeysProfile } from "@/lib/energetics/gene-keys";
import type { EnergeticDecoderRequest, EnergeticDecoderResult } from "@/types/energetic-decoder";

/**
 * Internal calculator endpoint — Phase 1 of the Energetic Decoder build.
 * Any sub-account member can use it to test the calculation; there's no
 * product/checkout/PDF wiring yet (that's the next phase). Admin-gating
 * happens per-product once this becomes a real sellable thing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: EnergeticDecoderRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, birthDate, birthTime, birthPlace } = body;
  if (!name?.trim() || !birthDate?.trim() || !birthTime?.trim() || !birthPlace?.trim()) {
    return NextResponse.json(
      { error: "Name, birth date, birth time, and birth place are all required." },
      { status: 400 },
    );
  }

  const place = await geocodeBirthPlace(birthPlace);
  if (!place) {
    return NextResponse.json(
      { error: `Couldn't find "${birthPlace}" — try a more specific place (city, state/country).` },
      { status: 422 },
    );
  }

  try {
    const profile = calculateGeneKeysProfile({
      date: birthDate,
      time: birthTime,
      timeZone: place.timeZone,
    });

    const result: EnergeticDecoderResult = {
      name: name.trim(),
      birthPlace: place.displayName,
      timeZone: place.timeZone,
      spheres: profile.spheres,
    };
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[energetic-decoder/calculate] failed", err);
    return NextResponse.json(
      { error: "Couldn't calculate the profile. Check the birth date/time and try again." },
      { status: 500 },
    );
  }
}
