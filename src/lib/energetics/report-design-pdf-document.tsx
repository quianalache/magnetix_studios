import "server-only";

import { Document, Page, Text, View, Image, Link, StyleSheet } from "@react-pdf/renderer";
import { HumanDesignFullChartPdf, MandalaPdf, AstrologyWheelPdf, GeneKeysChartPdf } from "./reading-pdf-document";
import { DEFAULT_DEFINED_FILL } from "./human-design-chart-constants";
import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";
import type { GeneKeysSphereResult } from "./gene-keys";
import type { ChartDesign } from "@/types/chart-design";
import type { ReportPage, ReportBlock, ReportBlockAlign, ChartPieceKind } from "@/types/report-blocks";

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
});

function textAlignStyle(align: ReportBlockAlign | undefined): "left" | "center" | "right" {
  return align === "center" ? "center" : align === "right" ? "right" : "left";
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
        <AstrologyWheelPdf chart={astrology} wheelAccentColor={astroDesign?.wheelAccentColor || "#7c3aed"} />
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
}) {
  return (
    <Document>
      {pages.map((page) => (
        <Page key={page.id} size="A4" style={styles.page}>
          <View style={styles.header}>
            {businessLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={businessLogoUrl} style={{ height: 24, marginBottom: 4 }} />
            ) : (
              <Text style={styles.businessName}>{businessName}</Text>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.forLine}>For {readerName}</Text>
          </View>

          {page.title && <Text style={styles.pageTitle}>{page.title}</Text>}

          <View style={styles.row}>
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
          </View>
        </Page>
      ))}
    </Document>
  );
}
