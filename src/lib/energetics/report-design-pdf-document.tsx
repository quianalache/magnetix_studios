import "server-only";
import React from "react";

import { Document, Page, Text, View, Image, Link, StyleSheet } from "@react-pdf/renderer";
import { resolveMandalaColors } from "./mandala-spec";
import { HumanDesignFullChartPdf, MandalaPdf, AstrologyWheelPdf, GeneKeysChartPdf } from "./reading-pdf-document";
import { resolveAstrologyColors } from "./astrology-spec";
import { DEFAULT_DEFINED_FILL } from "./human-design-chart-constants";
import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";
import type { GeneKeysSphereResult } from "./gene-keys";
import type { ChartDesign } from "@/types/chart-design";
import type { ReportPage, ReportBlock, ReportBlockAlign, ChartPieceKind, ReportCanvasElement, ReportPageSize, ReportDesign } from "@/types/report-blocks";
import { shortcodeElementValue } from "@/lib/energetics/report-shortcode-render";
type ReportDesignBrand = ReportDesign["brand"];

/**
 * PDF export for a custom ReportDesign — Phase 2 Build Plan Task 6
 * (2026-08-12). Renders a GeneratedReport's already-resolved `snapshot`
 * (pages already filtered by `visibleIf`, text-block shortcodes already
 * substituted at generation time — see generated-report-service.ts), not
 * a fresh recomputation: the PDF reflects the report record that was
 * actually generated, not whatever the live template/reading looks like
 * today. Chart blocks are the one thing the snapshot doesn't carry (see
 * generated-report.ts's own doc comment on why) — those render off the
 * reading's real, immutable HD/Astrology data, fetched separately.
 *
 * Chart rendering itself is NOT reimplemented here: HumanDesignFullChartPdf/
 * MandalaPdf/AstrologyWheelPdf are the exact same components
 * reading-pdf-document.tsx already built and proved out for the fixed
 * reading PDF, exported from there for reuse (2026-08-12) rather than
 * copied. Same reasoning as ReportDesignViewer reusing its own chart
 * pieces on the web side — one real chart-in-PDF implementation, not two.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#23262b" },
  header: { marginBottom: 16, borderBottom: "1pt solid #e5e5e5", paddingBottom: 10 },
  businessName: { fontSize: 10, color: "#6b6b6b" },
  title: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  forLine: { fontSize: 10, color: "#6b6b6b", marginTop: 2 },
  pageTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  blockWrap: { marginBottom: 8 },
  text: { fontSize: 10, lineHeight: 1.5 },
  divider: { borderBottom: "1pt solid #d4d4d8", marginVertical: 6 },
  buttonBox: { alignSelf: "flex-start", backgroundColor: "#7c3aed", color: "#ffffff", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, fontSize: 10, fontWeight: 700 },
  buttonBoxInert: { alignSelf: "flex-start", backgroundColor: "#e4e4e7", color: "#71717a", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, fontSize: 9 },
  gateChip: { fontSize: 8, border: "1pt solid #d4d4d8", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6, marginRight: 3, marginBottom: 3 },
  missingPiece: { fontSize: 9, color: "#a1a1aa", fontStyle: "italic", border: "1pt dashed #d4d4d8", borderRadius: 8, padding: 10, textAlign: "center" },
  videoBox: { border: "1pt dashed #d4d4d8", borderRadius: 8, padding: 10, fontSize: 9, color: "#71717a" },
  canvas: { position: "relative", flex: 1, overflow: "hidden" },
  canvasText: { position: "absolute", padding: 6, overflow: "hidden" },
  canvasPlaceholder: { position: "absolute", padding: 10, backgroundColor: "#efe7ff", border: "1pt solid #d8c5f5", color: "#5420a8", textAlign: "center" },
});

function pageLabel(page: ReportPage, index: number): string {
  const ordinal = `Page ${index + 1}`;
  const title = page.title.trim();
  return !title || title.toLowerCase() === ordinal.toLowerCase() ? ordinal : `${ordinal} · ${title}`;
}

function textAlignStyle(align: ReportBlockAlign | undefined): "left" | "center" | "right" {
  return align === "center" ? "center" : align === "right" ? "right" : "left";
}

function pdfFontFamily(fontFamily?: string): "Helvetica" | "Times-Roman" | "Courier" {
  return fontFamily === "Helvetica" || fontFamily === "Courier" || fontFamily === "Times-Roman" ? fontFamily : "Helvetica";
}

function ChartPiecePdf({
  piece,
  humanDesign,
  astrology,
  spheres,
  hdDesign,
  mandalaDesign,
  astroDesign,
}: {
  piece: ChartPieceKind;
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
  spheres?: GeneKeysSphereResult[];
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
}) {
  switch (piece) {
    case "human-design-full":
      return humanDesign ? (
        <HumanDesignFullChartPdf profile={humanDesign} hdDesign={hdDesign} />
      ) : (
        <Text style={styles.missingPiece}>Human Design chart isn&apos;t part of this reading.</Text>
      );
    case "human-design-mandala":
      return humanDesign && mandalaDesign ? (
        <MandalaPdf
          profile={humanDesign}
          gateColor={mandalaDesign.chartDefinedColor || DEFAULT_DEFINED_FILL}
          backgroundColor={mandalaDesign.backgroundColor || "#ffffff"}
          personalityColor={mandalaDesign.personalityActivationColor}
          designColor={mandalaDesign.designActivationColor}
          zodiacColor={mandalaDesign.mandalaZodiacColor}
          mandalaColors={resolveMandalaColors(mandalaDesign)}
          gateRingColor={mandalaDesign.mandalaGateRingColor}
          quadrantColor={mandalaDesign.mandalaQuadrantColor}
          hdDesign={hdDesign}
        />
      ) : (
        <Text style={styles.missingPiece}>Mandala chart isn&apos;t part of this reading.</Text>
      );
    case "human-design-gates":
      return humanDesign ? (
        <View style={styles.row}>
          {humanDesign.activatedGates.map((g) => (
            <Text key={g} style={styles.gateChip}>{g}</Text>
          ))}
        </View>
      ) : (
        <Text style={styles.missingPiece}>Activated gates aren&apos;t part of this reading.</Text>
      );
    case "astrology-wheel":
      return astrology ? (
        <AstrologyWheelPdf chart={astrology} colors={resolveAstrologyColors(astroDesign)} />
      ) : (
        <Text style={styles.missingPiece}>Astrology wheel isn&apos;t part of this reading.</Text>
      );
    case "frequency-hologenetic":
      // Added 2026-08-15 (Phase 5) alongside the same chart-block option
      // on the web side (report-design-viewer.tsx) — same shared
      // GeneKeysChartPdf this file's reading-pdf-document.tsx sibling
      // already uses for the standard reading PDF, not a second
      // implementation.
      return spheres && spheres.length > 0 ? (
        <GeneKeysChartPdf spheres={spheres} />
      ) : (
        <Text style={styles.missingPiece}>Frequency profile isn&apos;t part of this reading.</Text>
      );
    default:
      return null;
  }
}

/**
 * Every non-chart block type. Chart blocks are handled separately by the
 * caller (they need reading/chart-design data this component doesn't
 * have) — see the "chart" branch in ReportDesignPdfDocument below.
 *
 * Video/interactive-popup/next-page blocks have no meaningful static-PDF
 * equivalent — deliberate, reported behavior (per the task's own
 * instruction), not a gap to silently paper over. A `url` button is real
 * clickable value in a PDF, so that one renders as an actual react-pdf
 * `Link`; `nextPage`/`popup` render as an inert, clearly-labeled box
 * instead of a broken/dead button.
 */
function ReportBlockPdf({ block }: { block: Exclude<ReportBlock, { type: "chart" }> }) {
  switch (block.type) {
    case "text":
      return <Text style={[styles.text, { textAlign: textAlignStyle(block.align) }]}>{block.html}</Text>;
    case "image":
      // eslint-disable-next-line jsx-a11y/alt-text
      return <Image src={block.url} style={{ width: "100%" }} />;
    case "video":
      return (
        <View style={styles.videoBox}>
          <Text>Video: {block.url}</Text>
        </View>
      );
    case "button":
      if (block.action.kind === "url") {
        return (
          <Link src={block.action.href} style={styles.buttonBox}>
            {block.label}
          </Link>
        );
      }
      return <Text style={styles.buttonBoxInert}>{block.label}</Text>;
    case "divider":
      return <View style={styles.divider} />;
    case "spacer":
      return <View style={{ height: block.heightPx }} />;
    default:
      return null;
  }
}

/** The PDF's standard fonts carry weight/style in the font name (Times-Bold, Helvetica-Oblique, …). */
function pdfStandardFont(fontFamily: string | undefined, fontWeight: number | undefined, italic: boolean | undefined): string {
  const family = pdfFontFamily(fontFamily);
  const bold = (fontWeight ?? 400) >= 600;
  if (family === "Times-Roman") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
  return bold && italic ? `${family}-BoldOblique` : bold ? `${family}-Bold` : italic ? `${family}-Oblique` : family;
}

/** Canvas pages are 816 × 1056 page units (Letter at 96 dpi). */
const CANVAS_W = 816;
const CANVAS_H = 1056;
/** Room the header + page title take above the canvas (generous, so the canvas never spills onto a new page). */
const CANVAS_HEADER_ALLOWANCE = 140;

/**
 * One canvas element at a single uniform scale (2026-10-11): positions,
 * sizes, fonts, padding, radii and letter spacing all scale together, so a
 * page keeps its proportions and nothing below the header is cut off. Text
 * sits in a clipped box (like the web report, padding 10 page units) and
 * is never dropped when a line is a little taller than its box.
 */
function ReportCanvasElementPdf({ element, humanDesign, astrology, spheres, hdDesign, mandalaDesign, astroDesign, scale = 1 }: { element: ReportCanvasElement; humanDesign?: HumanDesignProfile | null; astrology?: AstrologyChart | null; spheres?: GeneKeysSphereResult[]; hdDesign?: ChartDesign | null; mandalaDesign?: ChartDesign | null; astroDesign?: ChartDesign | null; scale?: number }) {
  const st = element.style ?? {};
  const g = element.geometry;
  const box = {
    position: "absolute" as const,
    left: g.x * scale,
    top: g.y * scale,
    width: g.width * scale,
    height: g.height * scale,
    padding: element.type === "shape" || element.type === "frame" ? 0 : 10 * scale,
    overflow: "hidden" as const,
    ...(g.rotation ? { transform: `rotate(${g.rotation}deg)` } : {}),
    opacity: st.opacity ?? 1,
    backgroundColor: element.type === "shape" || element.type === "frame" ? st.backgroundColor || "#efe7ff" : undefined,
    borderWidth: (st.borderWidth || 0) * scale,
    borderColor: st.borderColor || "#d8c5f5",
    borderStyle: st.borderStyle === "dashed" ? ("dashed" as const) : ("solid" as const),
    borderRadius: (st.borderRadius || 0) * scale,
  };
  if (element.type === "image" || element.type === "upload") {
    const url = typeof element.payload.url === "string" ? element.payload.url : "";
    return url ? /* eslint-disable-next-line jsx-a11y/alt-text */ <Image src={url} style={box} /> : <View style={{ ...box, ...styles.canvasPlaceholder }}><Text>Image asset unavailable</Text></View>;
  }
  if (element.type === "chart") return <View style={box}><ChartPiecePdf piece={String(element.payload.piece ?? "human-design-full") as ChartPieceKind} humanDesign={humanDesign} astrology={astrology} spheres={spheres} hdDesign={hdDesign} mandalaDesign={mandalaDesign} astroDesign={astroDesign} /></View>;
  // Callers pass pages through resolvePagesForRender (Shortcodes already Text). Safety net:
  // a Shortcode that reaches here prints its frozen value or nothing, never raw {{token}}.
  const text = element.type === "shortcode" ? shortcodeElementValue(element) : String(element.payload.text ?? "");
  const textStyle = {
    color: st.color || "#18204a",
    fontFamily: pdfStandardFont(st.fontFamily, st.fontWeight, st.italic),
    fontSize: (st.fontSize || 14) * scale,
    lineHeight: st.lineHeight || 1.4,
    letterSpacing: (st.letterSpacing || 0) * scale,
    textAlign: textAlignStyle(st.align),
    textDecoration: st.underline ? ("underline" as const) : undefined,
  };
  // The text is laid out free of the box height (absolute inside it) and clipped by the box,
  // so a line slightly taller than its box shows like it does on the web instead of being dropped.
  const pad = 10 * scale;
  return (
    <View style={{ ...box, padding: 0 }}>
      <Text style={{ ...textStyle, position: "absolute", top: pad, left: pad, width: Math.max(0, box.width - 2 * pad) }}>{text || (element.type === "graphic" ? "Energetic Decoder graphic" : "")}</Text>
    </View>
  );
}

export function ReportDesignPdfDocument({
  title,
  readerName,
  businessName,
  businessLogoUrl,
  pages,
  humanDesign,
  astrology,
  spheres,
  hdDesign,
  mandalaDesign,
  astroDesign,
  pageSize = "a4",
  customPageSize,
  brand,
}: {
  title: string;
  readerName: string;
  businessName: string;
  businessLogoUrl?: string | null;
  /** Already-resolved pages from a GeneratedReport's snapshot — visibleIf-filtered, shortcodes already substituted. Rendered as-is, in order. */
  pages: ReportPage[];
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
  spheres?: GeneKeysSphereResult[];
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
  pageSize?: ReportPageSize;
  customPageSize?: { width: number; height: number } | null;
  brand?: ReportDesignBrand | null;
}) {
  const pdfSize = pageSize === "letter" ? "LETTER" : pageSize === "custom" && customPageSize ? [customPageSize.width, customPageSize.height] as [number, number] : "A4";
  const contentWidth = pageSize === "letter" ? 540 : pageSize === "custom" && customPageSize ? customPageSize.width - 72 : 523;
  const contentHeight = pageSize === "letter" ? 720 : pageSize === "custom" && customPageSize ? customPageSize.height - 72 : 769;
  // One uniform scale that fits the canvas under the header (was width-only fonts + a
  // full-height Y scale, which cut off the bottom of every canvas page).
  const canvasScale = Math.min(contentWidth / CANVAS_W, (contentHeight - CANVAS_HEADER_ALLOWANCE) / CANVAS_H);
  return (
    <Document>
      {pages.map((page, index) => (
        <Page key={page.id} size={pdfSize} style={[styles.page, { backgroundColor: brand?.backgroundColor || "#ffffff" }]}>
          <View style={styles.header}>
            {businessLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={businessLogoUrl} style={{ height: 24, marginBottom: 4 }} />
            ) : (
              <Text style={styles.businessName}>{businessName}</Text>
            )}
            <Text style={[styles.title, { color: brand?.accentColor || "#23262b" }]}>{title}</Text>
            <Text style={styles.forLine}>For {readerName}</Text>
          </View>

          <Text style={styles.pageTitle}>{pageLabel(page, index)}</Text>

          {page.elements && page.elements.length > 0 ? <View style={{ position: "relative", overflow: "hidden", width: CANVAS_W * canvasScale, height: CANVAS_H * canvasScale, marginLeft: (contentWidth - CANVAS_W * canvasScale) / 2 }}>{[...page.elements].sort((a, b) => a.zIndex - b.zIndex).filter((e) => !e.hidden).map((element) => <ReportCanvasElementPdf key={element.id} element={element} humanDesign={humanDesign} astrology={astrology} spheres={spheres} hdDesign={hdDesign} mandalaDesign={mandalaDesign} astroDesign={astroDesign} scale={canvasScale} />)}</View> : <View style={styles.row}>
            {page.blocks.map((block) => (
              <View key={block.id} style={[styles.blockWrap, { width: `${block.widthPct}%` }]}>
                {block.type === "chart" ? (
                  <ChartPiecePdf
                    piece={block.piece}
                    humanDesign={humanDesign}
                    astrology={astrology}
                    spheres={spheres}
                    hdDesign={hdDesign}
                    mandalaDesign={mandalaDesign}
                    astroDesign={astroDesign}
                  />
                ) : (
                  <ReportBlockPdf block={block} />
                )}
              </View>
            ))}
          </View>}
        </Page>
      ))}
    </Document>
  );
}
