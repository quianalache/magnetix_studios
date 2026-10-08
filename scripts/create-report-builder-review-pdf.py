from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from PIL import Image as PILImage

OUT = "output/pdf/report-builder-rebuild-owner-review.pdf"
ROOT = "review-evidence"
styles = getSampleStyleSheet()
title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=colors.HexColor("#24134d"), spaceAfter=16)
heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#5420a8"), spaceAfter=10)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10.5, leading=15, textColor=colors.HexColor("#28304a"))
small = ParagraphStyle("Small", parent=body, fontSize=8.5, leading=12, textColor=colors.HexColor("#62697f"))

def img(path, width=6.7*inch):
    with PILImage.open(path) as source:
        ratio = source.height / source.width
    im = Image(path, width=width, height=width * ratio)
    im._restrictSize(width, 6.45*inch)
    im.hAlign = "CENTER"
    return im

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#73768a"))
    canvas.drawString(0.65*inch, 0.38*inch, "Magnetix Studios | Report Builder rebuild | Local owner review")
    canvas.drawRightString(7.85*inch, 0.38*inch, f"Page {doc.page}")
    canvas.restoreState()

story = []
story += [Paragraph("Report Builder rebuild", title), Paragraph("Owner-review evidence package", heading), Paragraph("Branch: codex/report-builder-rebuild<br/>Base implementation commit: f654bac<br/>Scope: local implementation and verification only", body), Spacer(1, 18), Paragraph("Completed in this pass", heading)]
for line in [
    "Content Set selection is carried through preview and Generate Report.",
    "Strict custom-set resolution keeps missing fields blank and reports missing content before generation.",
    "Structured interpretation content is supported across HD, Astrology, and Frequency inputs.",
    "Canvas chart elements use the existing real chart renderers; image elements select Media Library assets.",
    "Generated-report snapshots carry the selected Content Set and page geometry metadata for PDF parity.",
]: story.append(Paragraph("• " + line, body))
story += [Spacer(1, 14), Paragraph("Verification", heading), Paragraph("TypeScript: passed. Production build: passed. Content Sets suite: 33 checks passed using the documented server-only shim. Existing repository lint warnings remain non-blocking; no deployment or production data access was used.", body), PageBreak()]

story += [Paragraph("Desktop editor evidence", title), Paragraph("The local editor renders the three-pane composition surface with independently scrollable tools, canvas, and inspector regions.", body), Spacer(1, 10), img(f"{ROOT}/desktop-1440-builder.png"), Spacer(1, 8), Paragraph("1440px evidence from the local review harness. The canvas is a real saved-design surface; chart and image tools are connected to the delivery model rather than placeholder-only output.", small), PageBreak()]
story += [Paragraph("Responsive evidence", title), Paragraph("The editor reorganizes to a sequential flow at tablet and phone widths while preserving Save, Preview PDF, and the inspector controls.", body), Spacer(1, 10), img(f"{ROOT}/tablet-820-builder.png", 5.3*inch), Spacer(1, 12), img(f"{ROOT}/phone-390-builder.png", 3.1*inch), PageBreak()]
story += [Paragraph("Delivery and snapshot behavior", title), Paragraph("Preview uses the current unsaved design draft and selected Content Set. Generate Report checks missing interpretation content, offers Continue anyway without filling blanks, and freezes the selected set and resolved text in the generated snapshot. Legacy block pages remain supported alongside the new canvas representation.", body), Spacer(1, 14)]
data = [["Check", "Result"], ["Content Set selection", "Preview and generation paths carry the selected set"], ["Missing content", "Non-blocking warning; Continue anyway preserves blanks"], ["Charts", "HD, Mandala, Astrology, Frequency use existing renderers"], ["Images", "Media Library picker stores selected asset URL/id"], ["PDF geometry", "Letter/A4/custom metadata carried into renderer"], ["Safety", "No push, deploy, production writes, or Build Log update"]]
t = Table(data, colWidths=[1.75*inch, 4.95*inch])
t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#5420a8")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTNAME", (0,1), (-1,-1), "Helvetica"), ("FONTSIZE", (0,0), (-1,-1), 9), ("LEADING", (0,0), (-1,-1), 12), ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#d9d0ec")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#faf8ff")]), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7)]))
story += [t, Spacer(1, 18), Paragraph("Artifact note", heading), Paragraph("This package is evidence for local review of the rebuild branch. Authentication-backed runtime data was not available in the local environment, so no claim is made that this artifact is production verification.", small)]

SimpleDocTemplate(OUT, pagesize=letter, rightMargin=.65*inch, leftMargin=.65*inch, topMargin=.62*inch, bottomMargin=.62*inch, title="Report Builder rebuild owner review").build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
