import { createElement, createRow, createSection } from "@/lib/pages-funnels/v2/nodes";
import type { PageSectionTree } from "@/types/pages-funnels-v2";

/**
 * Development fixture proving the V2 tree composes and renders correctly —
 * not wired into any route, Firestore document, or the live editor. Used
 * during Phase A validation to smoke-test `SectionView`/`RowView`/
 * `ColumnView`/`ElementView` against real (if small) data instead of only
 * type-checking the shapes in isolation.
 *
 * Two sections, matching the two examples called for in the Phase A spec:
 *   1. A single Column with Heading + Text + Button, one-column layout.
 *   2. A two-column Row: text content in one column, an Image in the other.
 */
export function buildDemoSectionTree(): PageSectionTree {
  const headingText = createElement("heading");
  headingText.content = { text: "Grow your list with a page that converts", level: "h1", alignment: "left" };

  const bodyText = createElement("text");
  bodyText.content = {
    text: "Magnetix helps you build native pages made of the same blocks you can click and edit individually.",
    alignment: "left",
  };

  const ctaButton = createElement("button");
  ctaButton.content = { text: "Get Started", link: "#", openInNewTab: false, style: "primary", alignment: "left" };

  const introSection = createSection([
    createRow("1col"),
  ]);
  introSection.rows[0].columns[0].elements = [headingText, bodyText, ctaButton];

  const twoColHeading = createElement("heading");
  twoColHeading.content = { text: "Built for creators", level: "h2", alignment: "left" };

  const twoColText = createElement("text");
  twoColText.content = { text: "Every element in this column is independently selectable and editable.", alignment: "left" };

  const image = createElement("image");
  image.content = { src: "", alt: "Product screenshot", link: "" };

  const featureRow = createRow("2col");
  featureRow.columns[0].elements = [twoColHeading, twoColText];
  featureRow.columns[1].elements = [image];

  const featureSection = createSection([featureRow]);

  return [introSection, featureSection];
}
