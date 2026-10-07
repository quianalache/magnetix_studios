import { DM_Serif_Display } from "next/font/google";

/**
 * The bold display serif used for Content Sets titles (2026-10-07,
 * owner-approved mockups). The app's Instrument Serif ships only a regular
 * weight; the mockups' titles are a heavy, high-contrast serif.
 */
export const displaySerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", display: "swap" });
