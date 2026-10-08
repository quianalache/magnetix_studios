import "server-only";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { ReportDesignPdfDocument } from "../src/lib/energetics/report-design-pdf-document";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import type { ReportPage } from "../src/types/report-blocks";

const image = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#5420a8"/><circle cx="500" cy="100" r="70" fill="#f0c7df"/><text x="42" y="78" fill="white" font-size="28">Magnetix Studios</text></svg>`).toString("base64")}`;
const pages: ReportPage[] = [
  { id: "cover", title: "Cover", visibleIf: null, blocks: [], elements: [
    { id: "title", type: "text", zIndex: 0, geometry: { x: 52, y: 72, width: 600, height: 60 }, style: { fontSize: 28, fontWeight: 700, color: "#18204a" }, payload: { text: "Your Energetic Blueprint" } },
    { id: "image", type: "image", zIndex: 1, geometry: { x: 52, y: 160, width: 700, height: 220 }, payload: { url: image, alt: "Magnetix Studios image" } },
    { id: "chart", type: "chart", zIndex: 2, geometry: { x: 470, y: 430, width: 270, height: 350 }, payload: { piece: "human-design-full" } },
    { id: "shape", type: "shape", zIndex: 0, geometry: { x: 52, y: 820, width: 700, height: 70 }, style: { backgroundColor: "#efe7ff", borderRadius: 16 }, payload: { shape: "rectangle" } },
    { id: "copy", type: "text", zIndex: 3, geometry: { x: 74, y: 840, width: 600, height: 30 }, style: { fontSize: 15, color: "#5420a8" }, payload: { text: "A map for alignment, purpose, and flow." } },
  ] },
  { id: "astrology", title: "Astrology", visibleIf: null, blocks: [], elements: [{ id: "astro", type: "chart", zIndex: 0, geometry: { x: 70, y: 100, width: 650, height: 650 }, payload: { piece: "astrology-wheel" } }] },
  { id: "frequency", title: "Frequency", visibleIf: null, blocks: [], elements: [{ id: "frequency", type: "chart", zIndex: 0, geometry: { x: 70, y: 100, width: 650, height: 650 }, payload: { piece: "frequency-hologenetic" } }] },
];

async function main() {
  const stream = await renderToStream(<ReportDesignPdfDocument title="Your Energetic Blueprint" readerName={REPORT_BUILDER_FIXTURE_READING.name} businessName="Magnetix Studios" pages={pages} humanDesign={REPORT_BUILDER_FIXTURE_READING.humanDesign} astrology={REPORT_BUILDER_FIXTURE_READING.astrology} spheres={REPORT_BUILDER_FIXTURE_READING.spheres} pageSize="letter" />);
  stream.pipe(createWriteStream("output/pdf/report-builder-fixture-example.pdf"));
  await finished(stream);
  console.log("output/pdf/report-builder-fixture-example.pdf");
}
void main();
