"""Optional subject index: real selected-program data, never invented page numbers."""
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from copy import deepcopy
from templates import content


def prepend_index(document, subject, programs):
    config = subject.get("index") or {}
    if not config.get("enabled"):
        return document
    columns = config.get("columns", [])
    if not 1 <= len(columns) <= 12:
        raise ValueError("The enabled index needs between 1 and 12 columns.")
    allowed = {"number", "title", "question", "subject.name", "semester", "courseCode", "blank", "manual"}
    for column in columns:
        field = column["field"]
        if not column["label"].strip():
            raise ValueError("Each index column needs a label.")
        if field not in allowed:
            definition = next((f for f in subject.get("fields", []) if field == "custom:" + f["id"] and f["type"] == "text"), None)
            if not definition:
                raise ValueError("An index column refers to an unsupported or missing text field.")
    # A separate initial section prevents a program-specific header/footer from
    # appearing on the index. Retain the uploaded page geometry and typography.
    index_section = deepcopy(document.sections[0]._sectPr)
    for tag in ("headerReference", "footerReference", "titlePg"):
        for element in list(index_section.findall(qn("w:" + tag))):
            index_section.remove(element)
    heading = document.add_paragraph(config.get("title", "Index"))
    table = document.add_table(rows=1, cols=len(columns))
    # Draw borders directly; uploaded templates need not define 'Table Grid'.
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        line = OxmlElement("w:" + edge)
        line.set(qn("w:val"), "single")
        line.set(qn("w:sz"), "4")
        borders.append(line)
    table._tbl.tblPr.append(borders)
    repeat = OxmlElement("w:tblHeader")
    table.rows[0]._tr.get_or_add_trPr().append(repeat)
    for cell, column in zip(table.rows[0].cells, columns):
        cell.text = column["label"]
        for run in cell.paragraphs[0].runs:
            run.bold = True
    for program in sorted(programs, key=lambda p: p["number"]):
        for cell, column in zip(table.add_row().cells, columns):
            field = column["field"]
            value = "" if field == "blank" else program.get("indexValues", {}).get(column["id"], "") if field == "manual" else content(subject, program, field)
            cell.text = str(value)
    boundary = document.add_paragraph()
    boundary._p.get_or_add_pPr().append(index_section)
    body = document._element.body
    for offset, element in enumerate((heading._p, table._tbl, boundary._p)):
        body.remove(element)
        body.insert(offset, element)
    return document
