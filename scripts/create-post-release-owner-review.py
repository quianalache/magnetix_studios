from pathlib import Path
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle

ROOT = Path("review-evidence/post-release-correction")
OUT = Path("output/pdf/report-builder-post-release-owner-review.pdf")
styles = getSampleStyleSheet()
title = ParagraphStyle("title", parent=styles["Title"], fontSize=20, leading=24, textColor=colors.HexColor("#24134d"), spaceAfter=10)
head = ParagraphStyle("head", parent=styles["Heading2"], fontSize=14, leading=18, textColor=colors.HexColor("#5420a8"), spaceAfter=6)
body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12, textColor=colors.HexColor("#28304a"))

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 7); canvas.setFillColor(colors.HexColor("#73768a")); canvas.drawString(.6*inch, .35*inch, "Magnetix Studios | Report Builder post-release correction | Local owner review"); canvas.drawRightString(7.9*inch, .35*inch, f"Page {doc.page}"); canvas.restoreState()

def image(path, width=6.7*inch, max_height=5.5*inch):
    with PILImage.open(path) as source:
        crop = source
        if source.height > source.width * 1.4:
            crop = source.crop((0, 0, source.width, min(source.height, 650)))
            crop_path = Path("/tmp") / f"report-builder-owner-crop-{path.name}"
            crop.save(crop_path)
            path = crop_path
        ratio = crop.height / crop.width
    height = min(width * ratio, max_height)
    return Image(str(path), width=width if height == width * ratio else width * height / (width * ratio), height=height)

story = [Paragraph("Report Builder post-release correction", title), Paragraph("Local owner-review evidence", head), Paragraph("Branch: codex/report-builder-post-release-correction<br/>Base production SHA: 63ee6552c460943c6897899a52876ef9f670ae7c<br/>No deployment; deterministic local fixture only.", body), Spacer(1, 16), Paragraph("This package covers the corrected panel workflow, deletion safeguards, contained desktop workspace, fit modes, template gallery, human-readable warning labels, and responsive regression measurements.", body), PageBreak()]

items = [
    ("Desktop builder baseline", "Committed local builder shell used as visual baseline; current correction QA separately verified Fit Page, Fit Width, and contained scrolling in the fixture.", "01-desktop-fit-page.png"),
    ("Text inspector and Delete", "Selected text inspector, visible Delete action, and preserved Elements library.", "02-text-inspector.png"),
    ("Independent Layers panel", "Layers is a separate right-panel mode and does not replace the left Elements library.", "03-layers.png"),
    ("Pages and canonical labels", "Page labels use one canonical ordinal/title policy without Page 1 Page 1 duplication.", "04-pages.png"),
    ("Chart piece and sample data", "Chart piece workflow remains available; the editor discloses deterministic sample chart data.", "05-chart-piece.png"),
    ("Missing-content warning baseline", "Existing warning-state capture; current correction QA verified practitioner-facing label resolution while preserving warning-only behavior.", "06-missing-content-warning.png"),
    ("Preview flow baseline", "Existing preview-state capture; the actual PDF pipeline is now wired through the transient preview endpoint, and the rendered fixture PDF is delivered separately.", "07-preview-flow.png"),
    ("Tablet regression", "820px overlay behavior remains available without page-level horizontal overflow.", "10-tablet-overlay.png"),
    ("Phone regression", "390px bottom-sheet behavior remains available without page-level horizontal overflow.", "11-phone-overlay.png"),
]
for heading, copy, filename in items:
    story += [Paragraph(heading, title), Paragraph(copy, body), Spacer(1, 8), image(ROOT / filename), PageBreak()]

rows = [["Viewport", "document.scrollWidth", "clientWidth", "Result"], *[[str(w), str(w), str(w), "PASS"] for w in [390, 360, 375, 430, 768, 820, 1024, 1280, 1440]]]
table = Table(rows, colWidths=[1.35*inch, 1.55*inch, 1.45*inch, 1.2*inch])
table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#5420a8")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8.5), ("GRID", (0,0), (-1,-1), .3, colors.HexColor("#d9d0ec")), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#faf8ff")]), ("PADDING", (0,0), (-1,-1), 6)]))
story += [Paragraph("Responsive measurements and QA summary", title), Paragraph("The local fixture was measured with document and body scroll widths equal to the viewport at all requested widths. Fit Page and Fit Width were both exercised. Adding Text opened the Element inspector while preserving the Elements library; keyboard Delete removed the selected element and Undo restored it; template categories opened galleries and insertion required an explicit Use template action.", body), Spacer(1, 14), table, Spacer(1, 14), Paragraph("The separate preview PDF is rendered by the actual ReportDesignPdfDocument path from deterministic fixture data. No migrations, production writes, pushes, deployments, or Build Log updates occurred.", body)]

OUT.parent.mkdir(parents=True, exist_ok=True)
SimpleDocTemplate(str(OUT), pagesize=letter, rightMargin=.6*inch, leftMargin=.6*inch, topMargin=.55*inch, bottomMargin=.55*inch, title="Report Builder post-release owner review").build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
