import "server-only";

import tzLookup from "tz-lookup";

/**
 * Birth-place resolution for chart calculations — forward-geocodes a
 * free-text place ("Austin, TX, USA") to coordinates via OpenStreetMap's
 * free Nominatim API (no key required, has fair-use rate limits — this is
 * called at most once per chart calculation, well within them), then
 * resolves the IANA timezone for those coordinates via `tz-lookup`
 * (offline, no network call, no key).
 *
 * The IANA zone name (not a fixed UTC offset) is what actually matters —
 * see `utcFromWallClock` in `lib/booking/availability.ts`, which this
 * module's caller reuses to convert the birth wall-clock time to UTC. An
 * IANA zone correctly encodes historical DST rules for any date, not just
 * today's; a fixed offset would get any birth date affected by a past DST
 * change wrong.
 */

export interface GeocodedPlace {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocodeBirthPlace(
  query: string,
): Promise<GeocodedPlace | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    headers: {
      // Nominatim's usage policy requires an identifying User-Agent.
      "User-Agent": "MagnetixStudiosCRM/1.0 (energetic-decoder)",
    },
  });
  if (!res.ok) return null;

  const results = (await res.json()) as NominatimResult[];
  const first = results[0];
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    displayName: first.display_name,
    timeZone: tzLookup(lat, lng),
  };
}
