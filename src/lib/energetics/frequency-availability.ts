/**
 * Frequency deferral (2026-10-11) — owner decision: Frequency is NOT being
 * completed right now. It is a temporary product gate, not a deletion.
 *
 * While FREQUENCY_COMING_SOON is true:
 *   - new readings do not compute or store Frequency spheres;
 *   - user-facing entry points that START Frequency work (reading
 *     configuration, the Frequency-only calculator API, Report Builder's
 *     Frequency chart piece + shortcodes, Content Set Frequency editing)
 *     show "Coming soon" instead;
 *   - everything already stored stays exactly as it is and stays viewable
 *     read-only: old readings' spheres, the public report, the reading PDF,
 *     generated reports, report designs that already use a Frequency piece
 *     or token, and the Frequency Content Set entries.
 *
 * The calculation engine (gene-keys.ts), stored field names, bindings and
 * renderers are untouched. Re-enabling is flipping this one constant.
 *
 * Client-safe: no server imports.
 */
export const FREQUENCY_COMING_SOON = true;

export const FREQUENCY_COMING_SOON_LABEL = "Coming soon";

/** Report Builder chart piece that renders the Frequency profile. */
export const FREQUENCY_CHART_PIECE = "frequency-hologenetic";

/** Shortcode catalog group whose tokens read Frequency data. */
export const FREQUENCY_SHORTCODE_GROUP = "Frequency";
