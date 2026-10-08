from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from PIL import Image as PILImage

OUT = "output/pdf/report-builder-rebuild-comprehensive-owner-review.pdf"
ROOT = "review-evidence"
s = getSampleStyleSheet()
title = ParagraphStyle("T", parent=s["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=colors.HexColor("#24134d"), spaceAfter=12)
head = ParagraphStyle("H", parent=s["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#5420a8"), spaceAfter=8)
body = ParagraphStyle("B", parent=s["BodyText"], fontSize=9.5, leading=13, textColor=colors.HexColor("#28304a"))
small = ParagraphStyle("S", parent=body, fontSize=8, leading=10, textColor=colors.HexColor("#62697f"))

def pic(path, width=6.7*inch, max_h=6.3*inch):
    with PILImage.open(path) as im:
        ratio = im.height / im.width
    h = min(width * ratio, max_h)
    return Image(path, width=width if h == width * ratio else width * h / (width * ratio), height=h)

def footer(c, d):
    c.saveState(); c.setFont("Helvetica", 7.5); c.setFillColor(colors.HexColor("#73768a")); c.drawString(.6*inch,.35*inch,"Magnetix Studios | Report Builder rebuild | Local owner review"); c.drawRightString(7.9*inch,.35*inch,f"Page {d.page}"); c.restoreState()

story = [Paragraph("Report Builder rebuild", title), Paragraph("Comprehensive local owner-review evidence", head), Paragraph("Branch: codex/report-builder-rebuild<br/>Starting commit: 097c997<br/>Fixture data is deterministic, Magnetix-created, and local-only.", body), Spacer(1,10), Paragraph("This package visually exercises the committed editor surface and its supporting delivery model. It does not use production authentication or production data.", body), PageBreak()]

def screenshot_page(h, text, path, width=6.7*inch):
    story.extend([Paragraph(h, title), Paragraph(text, body), Spacer(1,8), pic(path, width), PageBreak()])

screenshot_page("1. Desktop builder shell", "Editable title, draft status, undo/redo, zoom, Save, Preview PDF, Add Elements, template categories, fixed-page canvas, and Layers/Element inspector regions.", f"{ROOT}/desktop-full-updated.png")
screenshot_page("2. Text selected + inspector", "The selected text element exposes content, font, size, bold, italic, underline, alignment, color, letter spacing, line height, position/size, lock/hide, and delete controls.", f"{ROOT}/text-inspector-updated.png")
screenshot_page("3. Image selected + real asset", "The canvas shows the actual Magnetix-created fixture image. The image inspector exposes Media Library selection, position/size, lock/hide, and delete.", f"{ROOT}/image-inspector-updated.png")
screenshot_page("4. Real charts on canvas", "The canvas contains actual BodyGraph, Astrology wheel, and Frequency/Hologenetic renderer output. Chart element configuration remains the source of PDF output.", f"{ROOT}/desktop-full-updated.png")
screenshot_page("5. Layers and overlap", "The populated Layers panel shows real text, chart, image, and shape layers with selected state and z-order controls. Drag, resize, rotate handles are implemented on selected elements.", f"{ROOT}/desktop-layers.png")
screenshot_page("6. Shortcodes + Content Set", "Shortcodes are searchable and categorized across birth details, Human Design, interpretation, Astrology, and Frequency. The harness exposes Default plus a blank custom fixture set and uses the same resolver path.", f"{ROOT}/shortcode-inspector-updated.png")
screenshot_page("7. Pages, visibility, templates", "The local fixture includes page thumbnails/titles, a Generator-only visibility condition, and Magnetix structural template insertion from the template library.", f"{ROOT}/pages-panel-updated.png")
screenshot_page("8. Missing-content warning", "Actual fixture warning state: the custom set intentionally lacks Frequency gate 1 giftText. Go back/review and Continue anyway are both available; the warning is non-blocking.", f"{ROOT}/missing-content-warning.png")
screenshot_page("9. Continue anyway", "After continuing, the fixture preview reports that the missing value remains blank and no Default fallback is inserted.", f"{ROOT}/missing-content-continued.png")
screenshot_page("10. Tablet shell", "820px responsive evidence: the editor shell, Add Elements, canvas, inspector flow, Save, and Preview PDF remain accessible without page-level horizontal overflow.", f"{ROOT}/tablet-shell-updated.png")
screenshot_page("11. Phone shell", "390px responsive evidence: top controls, sequential canvas, Add Elements, Pages, Layers, and inspector controls are available without page-level horizontal overflow.", f"{ROOT}/phone-shell-updated.png")

story.extend([Paragraph("12. Actual rendered report PDF", title), Paragraph("The separate example PDF is generated through ReportDesignPdfDocument from the same canvas geometry model and contains three Letter pages with a real image, BodyGraph chart, Astrology wheel, Frequency chart, shape, and text.", body), Spacer(1,8), pic(f"{ROOT}/fixture-pdf-render/scaled-1.png", 5.1*inch, 5.8*inch), PageBreak()])

rows = [["Verification", "Result"], ["Canvas charts", "Real HD, Astrology, Mandala, and Frequency components rendered"], ["Images", "Fixture image renders; Media Library picker is wired for replacement"], ["Freeform", "Drag, resize handle, rotate control, overlap, z-order, undo/redo paths"], ["Content Sets", "Default/custom fixture selector and no-fallback resolver"], ["Warning", "Preview and Generate fixture paths are warning-only"], ["Visibility", "Generator match/non-match fixture states"], ["Responsive", "320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440 measured without page overflow"], ["Safety", "No push, deploy, production writes, migrations, or Build Log update"]]
t = Table(rows, colWidths=[1.55*inch, 5.15*inch]); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#5420a8")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8.5),("LEADING",(0,0),(-1,-1),11),("GRID",(0,0),(-1,-1),.3,colors.HexColor("#d9d0ec")),("VALIGN",(0,0),(-1,-1),"TOP"),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf8ff")]),("PADDING",(0,0),(-1,-1),6)]))
story.extend([Paragraph("13. QA summary", title), Paragraph("TypeScript and the production build are run after the current changes. The existing Content Sets suite remains the regression baseline; additional visual checks use the local fixture harness and Playwright at all requested widths.", body), Spacer(1,12), t, Spacer(1,14), Paragraph("The screenshot folder and actual rendered report PDF are delivered separately alongside this review PDF.", small)])

SimpleDocTemplate(OUT, pagesize=letter, rightMargin=.6*inch, leftMargin=.6*inch, topMargin=.58*inch, bottomMargin=.58*inch, title="Report Builder comprehensive owner review").build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
