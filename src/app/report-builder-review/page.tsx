import { ReportEditor } from "@/components/energetic-decoder/report-editor";
import type { ReportDesign } from "@/types/report-blocks";
import { ReportBuilderReviewFlows } from "@/components/energetic-decoder/report-builder-review-flows";

const fixtureImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%235420a8'/%3E%3Cstop offset='1' stop-color='%23f0c7df'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23g)'/%3E%3Ccircle cx='500' cy='100' r='70' fill='%23fff' fill-opacity='.45'/%3E%3Cpath d='M0 290 Q170 205 320 290 T640 250 V360 H0Z' fill='%23fff' fill-opacity='.28'/%3E%3Ctext x='42' y='78' fill='white' font-size='28' font-family='Georgia'%3EMagnetix Studios%3C/text%3E%3Ctext x='42' y='116' fill='white' font-size='16' font-family='Arial'%3EAligned for purpose, impact, and flow%3C/text%3E%3C/svg%3E";

const design: ReportDesign = {
  id: "local-review-fixture",
  subAccountId: "local-review",
  agencyId: "local-review",
  title: "Your Energetic Blueprint",
  status: "draft",
  layoutVersion: 2,
  pageSize: "letter",
  contentSetId: "default",
  pages: [
    { id: "cover", title: "Cover", visibleIf: null, blocks: [], elements: [
      { id: "hero", type: "text", zIndex: 3, geometry: { x: 58, y: 76, width: 540, height: 100 }, style: { fontFamily: "Georgia", fontSize: 34, fontWeight: 700, color: "#18204a" }, payload: { text: "Your Energetic Blueprint" } },
      { id: "image", type: "image", zIndex: 1, geometry: { x: 58, y: 210, width: 700, height: 260 }, style: { borderRadius: 18 }, payload: { url: fixtureImage, alt: "Magnetix Studios celestial landscape" } },
      { id: "chart", type: "chart", zIndex: 2, geometry: { x: 490, y: 500, width: 260, height: 330 }, payload: { piece: "human-design-full" } },
      { id: "shape", type: "shape", zIndex: 0, geometry: { x: 40, y: 860, width: 730, height: 95 }, style: { backgroundColor: "#efe7ff", borderRadius: 20 }, payload: { shape: "rectangle" } },
      { id: "intro", type: "text", zIndex: 4, geometry: { x: 78, y: 883, width: 640, height: 52 }, style: { fontSize: 16, color: "#5420a8" }, payload: { text: "A map for alignment, purpose, and flow." } },
    ] },
    { id: "content", title: "Your Chart", visibleIf: null, blocks: [], elements: [
      { id: "shortcode", type: "shortcode", zIndex: 1, geometry: { x: 60, y: 70, width: 620, height: 70 }, style: { fontSize: 24 }, payload: { token: "full_name" } },
      { id: "astro", type: "chart", zIndex: 0, geometry: { x: 60, y: 180, width: 420, height: 420 }, payload: { piece: "astrology-wheel" } },
    ] },
    { id: "frequency", title: "Frequency", visibleIf: null, blocks: [], elements: [{ id: "freq", type: "chart", zIndex: 0, geometry: { x: 80, y: 90, width: 650, height: 650 }, payload: { piece: "frequency-hologenetic" } }] },
    { id: "generator", title: "Generator only", visibleIf: { attribute: "type", operator: "equals", value: "Generator" }, blocks: [], elements: [{ id: "generator-text", type: "text", zIndex: 0, geometry: { x: 70, y: 90, width: 660, height: 150 }, style: { fontSize: 24 }, payload: { text: "Generator strategy: respond, then move with satisfaction." } }] },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function ReportBuilderReviewFixture() {
  return <><ReportBuilderReviewFlows /><ReportEditor subAccountId="local-review" initial={design} /></>;
}
