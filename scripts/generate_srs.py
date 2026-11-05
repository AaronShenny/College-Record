"""Export the reviewed Markdown SRS to an editable Word document."""

from pathlib import Path
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/software-requirements-specification.md"
OUTPUT = ROOT / "generated-artifacts/college-record-maker-srs-draft.docx"


def add_inline(paragraph, text):
    for token in re.split(r"(\*\*.*?\*\*|`[^`]+`)", text):
        if not token:
            continue
        run = paragraph.add_run(
            token[2:-2] if token.startswith("**")
            else token[1:-1] if token.startswith("`")
            else token
        )
        if token.startswith("**"):
            run.bold = True
        elif token.startswith("`"):
            run.font.name = "Consolas"
            run.font.size = Pt(9)


def configure(document):
    section = document.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = section.bottom_margin = Inches(0.8)
    section.left_margin = section.right_margin = Inches(0.8)
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.08
    for name in ("Title", "Heading 1", "Heading 2", "Heading 3"):
        style = document.styles[name]
        style.font.name = "Calibri"
        style.font.color.rgb = RGBColor.from_string("183F57")
    header = section.header.paragraphs[0]
    header.text = "COLLEGE WORD RECORD MAKER  |  REQUIREMENTS"
    header.style = document.styles["Caption"]
    footer = section.footer.paragraphs[0]
    footer.add_run("SRS v0.1 • Draft for review   |   Page ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    document.core_properties.title = "College Word Record Maker — SRS"
    document.core_properties.subject = "First-version Windows desktop requirements"
    document.core_properties.author = "Project requirements"
    document.core_properties.comments = "Draft; open decisions are not approved defaults."


def add_table(document, rows):
    table = document.add_table(rows=1, cols=len(rows[0]))
    table.style = "Light Shading Accent 1"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, values in enumerate(rows):
        cells = table.rows[0].cells if index == 0 else table.add_row().cells
        for cell, value in zip(cells, values):
            p = cell.paragraphs[0]
            add_inline(p, value.strip())
            for run in p.runs:
                run.font.size = Pt(9)
                if index == 0:
                    run.bold = True
        props = table.rows[index]._tr.get_or_add_trPr()
        no_split = OxmlElement("w:cantSplit")
        props.append(no_split)
        if index == 0:
            props.append(OxmlElement("w:tblHeader"))
    document.add_paragraph()


def main():
    document = Document()
    configure(document)
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                values = lines[index].strip().strip("|").split("|")
                if not all(re.fullmatch(r"\s*:?-+:?\s*", x) for x in values):
                    rows.append(values)
                index += 1
            add_table(document, rows)
            continue
        if line.startswith("# "):
            document.add_paragraph(line[2:], "Title")
        elif line.startswith("## "):
            text = line[3:]
            if text == "Software Requirements Specification":
                document.add_paragraph(text, "Subtitle")
            else:
                if text.startswith(("4.", "9.", "10.", "11.")):
                    document.add_page_break()
                document.add_heading(text, level=1)
        elif line.startswith("### "):
            document.add_heading(line[4:], level=2)
        elif line.startswith("- "):
            add_inline(document.add_paragraph(style="List Bullet"), line[2:])
        elif re.match(r"^\d+\.\s", line):
            add_inline(document.add_paragraph(style="List Number"), re.sub(r"^\d+\.\s", "", line))
        else:
            add_inline(document.add_paragraph(), line)
        index += 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(f"Created {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
