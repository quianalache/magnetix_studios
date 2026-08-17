import type { CenterKey } from "./human-design-data";

/**
 * Real, professionally-authored bodygraph geometry — full replacement of
 * this file's previous homegrown/hand-derived layout, 2026-08-17.
 *
 * BACKGROUND: the previous CENTER_LAYOUT/GATE_OFFSETS in this file were
 * our own computed approximations (a formula deriving each gate's offset
 * from its center's size), fixed once for a real measured bug (gates
 * sitting outside their shape) but still fundamentally hand-drawn, not
 * sourced from a professional chart. Direct investigation (2026-08-17)
 * confirmed a better source exists: schokee/Astrolo
 * (github.com/schokee/Astrolo), an MIT-licensed open-source Human Design
 * desktop app whose `Themes/BodyGraph.xaml` contains real, hand-fitted
 * vector geometry for all 9 centers, all 64 gate positions, and all 64
 * per-gate channel stubs (including genuine cubic-Bezier curves for the
 * 10/20/34/57 "Community square" junction cluster, hand-fitted so all
 * four gates' curves converge at one shared point) — a mature, tested,
 * professional foundation instead of another from-scratch derivation.
 *
 * LICENSE / ATTRIBUTION: Astrolo is MIT licensed, © 2023 Antony Titsas.
 * The data below (center shapes, gate positions, channel-stub paths) is
 * adapted directly from its Themes/BodyGraph.xaml, translated from WPF's
 * abbreviated PathGeometry syntax to SVG path `d` syntax (the two are
 * effectively the same grammar — M/L/H/V/C/Z, same absolute/relative
 * casing convention — so this is a direct syntax port, not a
 * reinterpretation). See /THIRD_PARTY_NOTICES.md for the required MIT
 * notice. Astrolo's own decorative elements — its body-silhouette outline,
 * its color palette/branding, its WPF control chrome — are NOT used here;
 * only the functional center/gate/channel geometry, per Magnetix's
 * existing "no copying branding" stance on this feature.
 *
 * COORDINATE SPACE: kept in Astrolo's own native units (its source canvas
 * is 240x320) rather than remapped into this app's old 0-100 space —
 * remapping would have meant rescaling 64 hand-fitted curves and risking
 * subtly distorting their real proportions. All of Magnetix's own visual
 * weights that depend on this scale (marker radius, stroke widths, font
 * sizes, label-declutter spacing) were rescaled ~2.4x to match, in
 * human-design-chart-constants.ts — see that file's header.
 *
 * viewBox is "18 -4 200 320", computed from the REAL bounding box of the
 * ported center + gate + channel-stub geometry (x:[25.6,208.2],
 * y:[4.0,309.8], measured by parsing every path's actual coordinates, not
 * eyeballed) plus a safety pad — deliberately excludes Astrolo's own body
 * silhouette (not ported) so the crop isn't inflated by artwork Magnetix
 * doesn't use.
 */

export type CenterGeometry =
  | { shape: "path"; d: string; transform?: string }
  | { shape: "rect"; x: number; y: number; width: number; height: number; rx: number };

/** All 9 centers — real vector geometry ported from Astrolo's BodyGraph.xaml (see header). Path-based for the 6 non-rectangular centers (Head/Ajna/G/Heart/Spleen/SolarPlexus — G additionally carries the 45° rotation matrix that turns its authored square into the real diamond), plain rects for the 3 square "motor" centers (Throat/Sacral/Root). */
export const CENTER_LAYOUT: Record<CenterKey, CenterGeometry> = {
  head: { shape: "path", d: "m 139.69674 35.940087 c 0 2.630292 -2.13311 4.762558 -4.76445 4.762558 H 99.800645 c -2.631339 0 -4.764454 -2.132266 -4.764454 -4.762558 0 -0.937592 0.275373 -1.808583 0.743405 -2.545612 l -0.004 -0.006 17.319744 -26.7222081 c 0.77715 -1.5751033 2.39546 -2.6613707 4.27125 -2.6613707 1.92439 0 3.57824 1.1427021 4.33019 2.7843523 L 138.7508 33.101152 c 0.5914 0.79343 0.94606 1.773622 0.94606 2.839135 z" },
  ajna: { shape: "path", d: "m 139.69674 55.949193 c 0 -2.630293 -2.13311 -4.762559 -4.76445 -4.762559 H 99.800645 c -2.631339 0 -4.764454 2.132266 -4.764454 4.762559 0 0.937591 0.275373 1.808582 0.743405 2.545611 l -0.004 0.006 17.319744 26.722211 c 0.77715 1.575099 2.39546 2.661373 4.27125 2.661373 1.92439 0 3.57824 -1.142714 4.33019 -2.784355 L 138.7508 58.788128 c 0.5914 -0.79343 0.94606 -1.773622 0.94606 -2.839135 z" },
  throat: { shape: "rect", x: 98.838089, y: 98.130074, width: 37.056858, height: 39.310009, rx: 3 },
  g: { shape: "path", d: "m 188.12859 19.180246 h 31.62084 c 1.662 0 3.00001 1.338002 3.00001 3.000005 v 31.62084 c 0 1.662003 -1.33801 3.000005 -3.00001 3.000005 h -31.62084 c -1.662 0 -3 -1.338002 -3 -3.000005 v -31.62084 c 0 -1.662003 1.338 -3.000005 3 -3.000005 z", transform: "matrix(0.70724741,0.70696612,-0.70724741,0.70696612,0,0)" },
  heart: { shape: "path", d: "m 142.12802 202.21659 c -0.33786 1.96619 0.98356 3.83379 2.95147 4.17133 l 26.27391 4.50692 c 1.96791 0.33756 3.8371 -0.98271 4.17498 -2.94892 0.12045 -0.70087 0.0268 -1.38727 -0.22884 -1.99828 l 0.004 -0.004 -9.52048 -22.19735 c -0.3789 -1.27716 -1.44965 -2.29675 -2.85251 -2.53738 -1.43919 -0.24686 -2.82284 0.39511 -3.59607 1.52588 l -16.13394 17.48092 c -0.54418 0.51722 -0.93532 1.20447 -1.0722 2.00096 z" },
  spleen: { shape: "path", d: "m 30.344618 215.24159 c -2.631335 0 -4.764454 2.13227 -4.764454 4.76256 v 35.11767 c 0 2.6303 2.133119 4.76256 4.764454 4.76256 0.937978 0 1.809314 -0.27526 2.546628 -0.74311 l 0.0062 0.004 26.732848 -17.31285 c 1.57573 -0.77685 2.662429 -2.39451 2.662429 -4.26955 0 -1.92363 -1.143156 -3.57683 -2.78547 -4.32848 L 33.184888 216.18716 c -0.793735 -0.59116 -1.774325 -0.94569 -2.840266 -0.94569 z" },
  solarplexus: { shape: "path", d: "m 203.4202 215.24157 c 2.63132 0 4.76445 2.13227 4.76445 4.76256 v 35.11769 c 0 2.6303 -2.13313 4.76256 -4.76445 4.76256 -0.93799 0 -1.80932 -0.27526 -2.54665 -0.74311 l -0.006 0.004 -26.73284 -17.31285 c -1.57573 -0.77685 -2.66243 -2.39451 -2.66243 -4.26955 0 -1.92363 1.14317 -3.57683 2.78548 -4.32848 l 26.32235 -17.04725 c 0.79375 -0.59116 1.77433 -0.94569 2.84027 -0.94569 z" },
  sacral: { shape: "rect", x: 98.838089, y: 222.10779, width: 37.056858, height: 37.057182, rx: 3 },
  root: { shape: "rect", x: 98.838089, y: 272.74216, width: 37.056858, height: 37.057182, rx: 3 },
};

/** Every gate -> its marker center point (Astrolo's own ContentPresenter Canvas.Left/Top + half its 6.5x6.5 minimum marker size) + which center it belongs to. */
export const GATE_POINT: Record<number, { x: number; y: number; center: CenterKey }> = {
  1: { x: 117.35, y: 150.95, center: "g" },
  2: { x: 117.35, y: 190.95, center: "g" },
  3: { x: 117.45, y: 254.35, center: "sacral" },
  4: { x: 126.35, y: 56.15, center: "ajna" },
  5: { x: 108.45, y: 227.15, center: "sacral" },
  6: { x: 176.85, y: 237.55, center: "solarplexus" },
  7: { x: 108.45, y: 160.15, center: "g" },
  8: { x: 117.45, y: 132.85, center: "throat" },
  9: { x: 126.35, y: 254.35, center: "sacral" },
  10: { x: 97.15, y: 171.05, center: "g" },
  11: { x: 126.35, y: 69.05, center: "ajna" },
  12: { x: 130.95, y: 117.75, center: "throat" },
  13: { x: 126.35, y: 160.15, center: "g" },
  14: { x: 117.45, y: 227.15, center: "sacral" },
  15: { x: 108.45, y: 181.85, center: "g" },
  16: { x: 103.55, y: 109.45, center: "throat" },
  17: { x: 108.45, y: 69.05, center: "ajna" },
  18: { x: 31.15, y: 254.65, center: "spleen" },
  19: { x: 130.95, y: 284.05, center: "root" },
  20: { x: 103.55, y: 119.75, center: "throat" },
  21: { x: 162.15, y: 186.45, center: "heart" },
  22: { x: 194.25, y: 226.45, center: "solarplexus" },
  23: { x: 117.45, y: 102.95, center: "throat" },
  24: { x: 117.45, y: 56.15, center: "ajna" },
  25: { x: 137.35, y: 171.05, center: "g" },
  26: { x: 147.55, y: 202.45, center: "heart" },
  27: { x: 103.55, y: 247.85, center: "sacral" },
  28: { x: 39.45, y: 248.75, center: "spleen" },
  29: { x: 126.35, y: 227.15, center: "sacral" },
  30: { x: 202.95, y: 254.65, center: "solarplexus" },
  31: { x: 108.45, y: 132.85, center: "throat" },
  32: { x: 48.35, y: 243.15, center: "spleen" },
  33: { x: 126.35, y: 132.85, center: "throat" },
  34: { x: 103.55, y: 234.05, center: "sacral" },
  35: { x: 130.95, y: 109.45, center: "throat" },
  36: { x: 202.95, y: 220.55, center: "solarplexus" },
  37: { x: 185.55, y: 231.95, center: "solarplexus" },
  38: { x: 103.55, y: 293.75, center: "root" },
  39: { x: 130.95, y: 293.75, center: "root" },
  40: { x: 170.75, y: 206.45, center: "heart" },
  41: { x: 130.95, y: 303.45, center: "root" },
  42: { x: 108.45, y: 254.35, center: "sacral" },
  43: { x: 117.45, y: 82.85, center: "ajna" },
  44: { x: 48.35, y: 231.95, center: "spleen" },
  45: { x: 130.95, y: 126.15, center: "throat" },
  46: { x: 126.35, y: 181.85, center: "g" },
  47: { x: 108.45, y: 56.15, center: "ajna" },
  48: { x: 30.55, y: 220.55, center: "spleen" },
  49: { x: 185.55, y: 243.15, center: "solarplexus" },
  50: { x: 57.35, y: 237.55, center: "spleen" },
  51: { x: 154.95, y: 194.25, center: "heart" },
  52: { x: 126.35, y: 277.65, center: "root" },
  53: { x: 108.45, y: 277.65, center: "root" },
  54: { x: 103.55, y: 284.05, center: "root" },
  55: { x: 194.25, y: 248.75, center: "solarplexus" },
  56: { x: 126.35, y: 102.95, center: "throat" },
  57: { x: 39.45, y: 226.45, center: "spleen" },
  58: { x: 103.55, y: 303.45, center: "root" },
  59: { x: 130.95, y: 247.85, center: "sacral" },
  60: { x: 117.45, y: 277.65, center: "root" },
  61: { x: 117.45, y: 35.85, center: "head" },
  62: { x: 108.45, y: 102.95, center: "throat" },
  63: { x: 126.35, y: 35.85, center: "head" },
  64: { x: 108.45, y: 35.85, center: "head" },
};

/**
 * Every gate -> its own authored channel-stub spine (SVG path `d`),
 * starting at/near the gate and extending toward its channel partner(s).
 * One entry PER GATE (not per channel pair, and not one path per full
 * 36-channel connection) — this matches Astrolo's own real architecture
 * (64 independent controls, each bound to one gate's own activation
 * state), and the renderer (human-design-chart.tsx) draws two of these
 * per channel, one from each end, so a "complete" channel is two spines
 * visually meeting in the middle, and a "hanging gate" is one bright
 * spine plus one faint/recessive spine — real behavior, not a
 * special-cased distinction, so the 10/20/34/57 junction cluster's own
 * 4 spines (real cubic Béziers, hand-fitted to converge at one shared
 * point in the source) need no special handling at all here either.
 */
export const GATE_SPINE: Record<number, string> = {
  1: "m 117.24563 141.55202 v 29.3688",
  2: "m 117.24563 170.92082 v 35.19014",
  3: "m 117.24563 237.56284 v 28.34404",
  4: "m 126.36609 45.984083 0 19.122374",
  5: "m 108.46022 206.11096 v 31.45188",
  6: "m 154.37388 245.08356 c 6.60737 -1.73579 13.05207 -4.19792 18.71717 -7.05115 3.94215 -1.98546 7.26529 -4.38205 9.37103 -6.77623",
  7: "m 108.46022 141.55202 v 29.3688",
  8: "m 117.24563 117.3514 10e-6 24.20063",
  9: "m 126.36609 237.56284 v 28.34404",
  10: "m 97.191315 170.53424 c -29.32718 0.66377 -46.919646 7.89405 -51.634791 25.13449",
  11: "m 126.3661 65.106457 0 27.761649",
  12: "m 189.14616 195.06617 c -4.72742 -15.57753 -11.76475 -30.64958 -21.21739 -43.38041 -9.1646 -12.34287 -20.7341 -23.30633 -33.64662 -31.10194 -6.16479 -3.72185 -12.33091 -6.41219 -17.03954 -6.44124",
  13: "m 126.36609 141.55202 v 29.3688",
  14: "m 117.24563 206.11096 v 31.45188",
  15: "m 108.46022 170.92082 v 35.19014",
  16: "m 117.24568 104.68142 c -0.0266 -9e-5 -0.0533 -1.4e-4 -0.0799 -1.4e-4 v 0 c -7.78452 0 -15.37459 3.73421 -22.009026 7.80478 -14.052457 8.6219 -26.037664 20.82457 -35.854547 34.06684 -9.965385 13.44256 -17.724963 28.83617 -22.501412 44.87163 -0.155528 0.52213 -0.307314 1.04542 -0.45542 1.56982",
  17: "m 108.46023 65.106457 0 27.761649",
  18: "m 31.642579,245.00413 v 7.22438 c -1.48e-4,1.43214 0.327908,2.84526 0.958985,4.13086 6.180576,12.58257 14.941309,23.56379 25.754186,31.76624",
  19: "m 163.99028,273.14702 c -9.62083,7.28221 -21.13932,11.65791 -34.04781,11.72601 h -5.11329",
  20: "m 117.24261 114.14258 c -0.0257 -1.6e-4 -0.0513 -2.4e-4 -0.0768 -2.4e-4 -4.75694 0 -10.96672 2.66915 -17.05778 6.40632 -12.704244 7.79469 -23.922164 19.12047 -33.201112 31.63711 -9.306877 12.55429 -16.586763 27.00117 -21.035968 41.93801 -0.139419 0.46805 -0.275653 0.93757 -0.408752 1.40851",
  21: "m 165.27617 203.00258 c 0.34616 -14.37637 -3.25951 -30.63551 -9.93079 -44.27312 -0.34494 -0.70513 -0.6999 -1.40844 -1.06481 -2.10921",
  22: "m 195.00208 237.56739 c 0.44138 -13.82808 -1.56568 -28.0396 -5.54103 -41.4514 -0.1038 -0.35018 -0.20876 -0.70013 -0.31489 -1.04982",
  23: "M 117.24563 92.868103 V 117.3514",
  24: "m 117.24563 45.984083 0 19.122374",
  25: "m 137.18645 171.18542 c 5.69505 1.22618 10.25227 3.39083 13.32279 7.54054",
  26: "m 144.88691 202.15286 c -2.39931 0 -25.95241 -1.03188 -38.76519 0.58521 -4.88209 0.61616 -9.947698 1.35549 -14.99271 2.3157",
  27: "m 78.677682 244.73769 c 1.750565 0.48615 3.515455 0.92248 5.283067 1.30269 3.237881 0.69646 8.822291 1.13383 15.955756 1.50756 h 17.329105",
  28: "m 41.013671,237.86037 v 14.36814 c 5.648944,11.50026 13.436573,21.3342 23.019093,28.59103",
  29: "m 126.36609 206.11096 v 31.45188",
  30: "m 202.3409,245.00413 v 7.22438 c 1.5e-4,1.43214 -0.32791,2.84526 -0.95899,4.13086 -6.18061,12.58265 -14.94142,23.56392 -25.75439,31.7664",
  31: "m 108.46022 117.3514 0 24.20063",
  32: "m 49.753215,237.86043 -0.422875,10.22836 c 5.183105,9.97013 12.186459,18.64227 20.66286,25.05823",
  33: "m 126.36609 117.3514 0 24.20063",
  34: "m 45.556524 195.66873 c -0.133974 0.48987 -0.257556 0.98783 -0.37071 1.49394 -1.747565 7.81628 4.942477 15.91242 10.664737 21.57843 7.326506 7.25446 17.992034 10.66985 27.931467 13.54924 7.363285 2.1331 22.853242 2.57733 22.853242 2.57733",
  35: "m 198.26489 192.52559 c -4.98998 -16.5169 -12.4557 -32.63199 -22.73534 -46.47662 -9.83148 -13.24102 -22.23422 -25.03799 -36.35475 -33.56291 -6.64069 -4.00914 -14.17278 -7.77889 -21.92912 -7.80464",
  36: "m 204.47163 237.56565 c 0.43956 -14.84424 -1.72108 -29.91529 -5.93655 -44.13718 -0.0892 -0.30108 -0.1793 -0.60205 -0.27019 -0.90288",
  37: "m 184.34737 232.35997 c 0.68901 -7.77332 0.0485 -12.89658 -1.88478 -16.6499",
  38: "m 64.032764,280.81954 c 11.092461,8.40033 24.590026,13.34741 39.959426,13.4285 h 15.42187",
  39: "m 169.95085,280.81946 c -11.09249,8.40036 -24.5901,13.34749 -39.95957,13.42858 h -15.42185",
  40: "m 182.46259 215.71007 c -2.0603 -3.99992 -5.58883 -6.44399 -10.5411 -8.88155",
  41: "m 175.62752,288.12577 c -12.66375,9.60639 -28.14228,15.40132 -45.5874,15.49336 -0.0163,3e-5 -0.0325,3e-5 -0.0488,0 h -15.42186",
  42: "m 108.46022 237.56284 v 28.34404",
  43: "m 117.24564 65.106457 0 27.761649",
  44: "m 91.12901 205.05377 c -13.753322 2.61764 -27.353601 6.8768 -36.665643 14.7572 -3.174063 2.68609 -6.966865 6.70315 -7.443433 11.05225",
  45: "m 154.28057 156.62025 c -5.58152 -10.71872 -13.48909 -20.8406 -23.40957 -27.72382 -1.93235 -1.34074 -6.67689 -2.28299 -6.67689 -2.28299",
  46: "m 126.36609 170.92082 v 35.19014",
  47: "m 108.46022 45.984083 0 19.122374",
  48: "m 36.345375 192.99435 c -4.062629 14.38432 -5.357651 29.60047 -5.174577 44.57161",
  49: "m 184.52562,245.00421 0.12753,3.08458 c -5.18312,9.97013 -12.18647,18.64227 -20.66287,25.05823",
  50: "m 52.103945 231.53593 c 1.648299 2.04916 4.929609 4.37768 9.136558 6.49649 5.298659 2.66866 11.279311 4.99519 17.437179 6.70528",
  51: "m 150.50924 178.72596 c 2.65274 3.5851 4.19582 8.65184 4.40429 15.87508",
  52: "m 126.36609 265.90688 v 11.22725",
  53: "m 108.46022 265.90688 v 11.22725",
  54: "m 69.9932,273.14702 c 9.620832,7.28221 21.139324,11.65791 34.04782,11.72601 h 5.11327",
  55: "m 192.96981,245.00413 v 7.22438 c -5.64892,11.50021 -13.4365,21.33412 -23.01896,28.59095",
  56: "M 126.36609 92.868103 V 117.3514",
  57: "m 45.462168 195.53229 c -3.746653 13.25656 -5.008231 27.63556 -4.827039 42.0301",
  58: "m 58.35575,288.12561 c 12.663782,9.60649 28.142391,15.40148 45.5876,15.49352 0.0163,6e-5 0.0325,6e-5 0.0488,0 h 15.42187",
  59: "m 117.24561 247.54794 h 17.16942 c 7.13346 -0.37373 12.71793 -0.81112 15.95576 -1.50756 1.3376 -0.28772 2.67364 -0.60756 4.00309 -0.95682",
  60: "m 117.24563 265.90688 v 11.22725",
  61: "m 117.24564 36.550536 v 9.433547",
  62: "M 108.46022 92.868103 V 117.3514",
  63: "m 126.3661 36.550536 v 9.433547",
  64: "m 108.46023 36.550536 v 9.433547",
};

/** Real content bounding box of everything above (centers + gates + spines, G's rotation applied), computed by parsing the actual path coordinates — x:[25.6,208.2] y:[4.0,309.8]. The shared viewBox both renderers use pads this to "18 -4 200 320". */
export const CHART_VIEWBOX = "18 -4 200 320";
