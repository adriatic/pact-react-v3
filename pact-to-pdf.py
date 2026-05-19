#!/usr/bin/env python3
# Copyright © 2026 Pact Research LLC. All rights reserved.
# pactresearch.net
"""
pact-to-pdf.py - Converts a PACT .pact notebook export to a readable PDF.
Usage: python3 pact-to-pdf.py <input.pact> [output.pdf]
"""

import json, sys, os, re
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, PageBreak, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas as rl_canvas

def load_pact(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Handle signed format — unwrap payload
    if "payload" in data and "signature" in data:
        return data["payload"]
    return data

def format_timestamp(ms):
    try:
        return datetime.fromtimestamp(ms / 1000).strftime("%B %d, %Y at %I:%M %p")
    except:
        return ""

def format_elapsed(ms):
    if not ms: return ""
    s = ms / 1000
    return f"{s:.1f}s" if s < 60 else f"{int(s//60)}m {int(s%60)}s"

def apply_inline(text):
    """Apply inline bold formatting and strip problematic chars."""
    text = re.sub(r'[^\x00-\x7F\u00C0-\u024F\u2019\u2018\u201C\u201D\u2014\u2013\u00B7\u2022\u2190\u2192\u2194\u00B0]', '', text)
    if text.startswith(">"):
        text = text[1:].strip()
    result = ""
    parts = text.split("**")
    for i, part in enumerate(parts):
        if i % 2 == 1:
            result += f"<b>{part}</b>"
        else:
            result += part
    return result.strip()

def is_table_separator(line):
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    return all(c in "|-: " for c in stripped)

def parse_table_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]

def collect_table(lines, start_idx):
    table_lines = []
    i = start_idx
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("|") or is_table_separator(line):
            table_lines.append(line)
            i += 1
        else:
            break
    return table_lines, i

def build_rl_table(table_lines, styles):
    rows = []
    is_header_row = True

    for line in table_lines:
        if is_table_separator(line):
            is_header_row = False
            continue
        cells = parse_table_row(line)
        if not cells:
            continue
        style = styles["table_header"] if is_header_row else styles["table_cell"]
        row = [Paragraph(apply_inline(cell), style) for cell in cells]
        rows.append(row)
        if is_header_row:
            is_header_row = False

    if not rows:
        return None

    col_count = max(len(row) for row in rows)
    for row in rows:
        while len(row) < col_count:
            row.append(Paragraph("", styles["table_cell"]))

    available_width = 6.5 * inch
    col_width = available_width / col_count

    t = Table(rows, colWidths=[col_width] * col_count, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e639c")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f9f9f9"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

def markdown_to_paragraphs(text, styles):
    paragraphs = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("|") and i + 1 < len(lines) and is_table_separator(lines[i + 1]):
            table_lines, i = collect_table(lines, i)
            rl_table = build_rl_table(table_lines, styles)
            if rl_table:
                paragraphs.append(Spacer(1, 6))
                paragraphs.append(rl_table)
                paragraphs.append(Spacer(1, 6))
            continue

        if is_table_separator(line):
            i += 1
            continue

        if line.startswith("### "):
            paragraphs.append(Paragraph(apply_inline(line[4:].strip()), styles["h3"]))
        elif line.startswith("## "):
            paragraphs.append(Paragraph(apply_inline(line[3:].strip()), styles["h2"]))
        elif line.startswith("# "):
            paragraphs.append(Paragraph(apply_inline(line[2:].strip()), styles["h1"]))
        elif line.strip() in ("---", "***", "___"):
            paragraphs.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        elif line.strip() == "":
            paragraphs.append(Spacer(1, 6))
        elif line.startswith("- ") or line.startswith("* "):
            content = apply_inline(line[2:].strip())
            paragraphs.append(Paragraph(f"• {content}", styles["bullet"]))
        elif len(line) > 2 and line[0].isdigit() and line[1] in ".)" and line[2] == " ":
            content = apply_inline(line[3:].strip())
            paragraphs.append(Paragraph(f"{line[0]}. {content}", styles["bullet"]))
        elif line.strip().startswith("> "):
            content = apply_inline(line.strip()[2:])
            paragraphs.append(Paragraph(f"<i>{content}</i>", styles["blockquote"]))
        else:
            content = apply_inline(line.strip())
            if content:
                paragraphs.append(Paragraph(content, styles["body"]))

        i += 1

    return paragraphs


# ── Page footer ───────────────────────────────────────────────────────────────

def add_page_footer(canvas, doc):
    """Draw attribution footer on every page."""
    canvas.saveState()
    page_width, page_height = letter
    footer_text = "Generated by PACT Research  ·  pactresearch.net  ·  Copyright © 2026 Pact Research LLC"
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#aaaaaa"))
    canvas.drawCentredString(page_width / 2, 0.5 * inch, footer_text)
    canvas.setStrokeColor(colors.HexColor("#eeeeee"))
    canvas.setLineWidth(0.5)
    canvas.line(inch, 0.65 * inch, page_width - inch, 0.65 * inch)
    canvas.restoreState()


# ── Build PDF ─────────────────────────────────────────────────────────────────

def build_pdf(pact_data, output_path):
    notebook_name = pact_data.get("notebook", {}).get("name", "PACT Notebook")
    exported_at = pact_data.get("exportedAt", 0)
    discussions = pact_data.get("discussions", [])
    all_cells = pact_data.get("cells", [])

    cells_by_discussion = {}
    for cell in all_cells:
        did = cell.get("discussionId")
        cells_by_discussion.setdefault(did, []).append(cell)
    for did in cells_by_discussion:
        cells_by_discussion[did].sort(key=lambda c: c.get("createdAt", 0))

    doc = SimpleDocTemplate(output_path, pagesize=letter,
        leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
        title=notebook_name, author="PACT Research")

    S = {
        "title": ParagraphStyle("title", fontSize=22, leading=28, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1a1a2e"), spaceAfter=6, alignment=TA_CENTER),
        "subtitle": ParagraphStyle("subtitle", fontSize=10, leading=14, fontName="Helvetica",
            textColor=colors.HexColor("#888888"), spaceAfter=4, alignment=TA_CENTER),
        "attribution": ParagraphStyle("attribution", fontSize=10, leading=14, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#185FA5"), spaceAfter=4, alignment=TA_CENTER),
        "discussion_title": ParagraphStyle("discussion_title", fontSize=14, leading=18,
            fontName="Helvetica-Bold", textColor=colors.HexColor("#0e639c"),
            spaceBefore=16, spaceAfter=4),
        "discussion_meta": ParagraphStyle("discussion_meta", fontSize=8, leading=12,
            fontName="Helvetica", textColor=colors.HexColor("#aaaaaa"), spaceAfter=8),
        "prompt_label": ParagraphStyle("prompt_label", fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#888888"), spaceBefore=10, spaceAfter=3),
        "prompt_text": ParagraphStyle("prompt_text", fontSize=10, leading=15,
            fontName="Helvetica", textColor=colors.HexColor("#2d2d2d"),
            leftIndent=12, spaceAfter=8, backColor=colors.HexColor("#f5f5f5"), borderPad=6),
        "response_label": ParagraphStyle("response_label", fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#0e639c"), spaceBefore=4, spaceAfter=3),
        "h1": ParagraphStyle("h1", fontSize=14, leading=18, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1a1a2e"), spaceBefore=10, spaceAfter=4),
        "h2": ParagraphStyle("h2", fontSize=12, leading=16, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1a1a2e"), spaceBefore=8, spaceAfter=3),
        "h3": ParagraphStyle("h3", fontSize=11, leading=14, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#333333"), spaceBefore=6, spaceAfter=2),
        "body": ParagraphStyle("body", fontSize=10, leading=15, fontName="Helvetica",
            textColor=colors.HexColor("#2d2d2d"), spaceAfter=3),
        "bullet": ParagraphStyle("bullet", fontSize=10, leading=15, fontName="Helvetica",
            textColor=colors.HexColor("#2d2d2d"), leftIndent=16, spaceAfter=2),
        "blockquote": ParagraphStyle("blockquote", fontSize=9, leading=13, fontName="Helvetica",
            textColor=colors.HexColor("#555555"), leftIndent=20, spaceAfter=4,
            backColor=colors.HexColor("#f0f0f0"), borderPad=4),
        "cell_meta": ParagraphStyle("cell_meta", fontSize=8, fontName="Helvetica",
            textColor=colors.HexColor("#aaaaaa"), spaceAfter=6),
        "table_header": ParagraphStyle("table_header", fontSize=9, leading=12,
            fontName="Helvetica-Bold", textColor=colors.white),
        "table_cell": ParagraphStyle("table_cell", fontSize=9, leading=12,
            fontName="Helvetica", textColor=colors.HexColor("#2d2d2d")),
    }

    story = []

    # ── Cover page ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * inch))
    story.append(Paragraph(notebook_name, S["title"]))
    story.append(Paragraph("pactresearch.net", S["attribution"]))
    story.append(Paragraph(f"Exported from PACT · {format_timestamp(exported_at)}", S["subtitle"]))
    story.append(Paragraph(f"{len(discussions)} discussion(s) · {len(all_cells)} cell(s)", S["subtitle"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0e639c")))
    story.append(Spacer(1, 0.3 * inch))

    # ── Discussions ───────────────────────────────────────────────────────────
    for discussion in discussions:
        did = discussion["id"]
        d_cells = cells_by_discussion.get(did, [])

        story.append(Paragraph(discussion["name"], S["discussion_title"]))
        meta = []
        if discussion.get("createdAt"): meta.append(format_timestamp(discussion["createdAt"]))
        if discussion.get("totalTimeMs"): meta.append(f"Total time: {format_elapsed(discussion['totalTimeMs'])}")
        if meta: story.append(Paragraph(" · ".join(meta), S["discussion_meta"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 8))

        for cell in d_cells:
            prompt = (cell.get("promptText") or "").strip()
            if prompt:
                story.append(Paragraph("PROMPT", S["prompt_label"]))
                for line in prompt.split("\n"):
                    if line.strip():
                        story.append(Paragraph(apply_inline(line.strip()), S["prompt_text"]))

            response = (cell.get("response") or "").strip()
            model = cell.get("model", "").upper()
            if response:
                story.append(Paragraph(f"RESPONSE · {model}" if model else "RESPONSE", S["response_label"]))
                story.extend(markdown_to_paragraphs(response, S))

            if cell.get("createdAt"):
                story.append(Spacer(1, 4))
                story.append(Paragraph(format_timestamp(cell["createdAt"]), S["cell_meta"]))
            story.append(Spacer(1, 12))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee")))
            story.append(Spacer(1, 6))

        story.append(PageBreak())

    if story and isinstance(story[-1], PageBreak):
        story.pop()

    doc.build(story, onFirstPage=add_page_footer, onLaterPages=add_page_footer)
    print(f"✓ PDF saved: {output_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 pact-to-pdf.py <input.pact> [output.pdf]")
        sys.exit(1)
    input_path = sys.argv[1]
    if not os.path.exists(input_path):
        print(f"Error: file not found: {input_path}")
        sys.exit(1)
    output_path = sys.argv[2] if len(sys.argv) >= 3 else os.path.splitext(input_path)[0] + ".pdf"
    build_pdf(load_pact(input_path), output_path)

if __name__ == "__main__":
    main()
