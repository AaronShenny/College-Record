"""DOCX replacement adapted from the student's run-aware Word scripts.

Retains template typography unless a mapped field has an explicit override.
Only student-supplied content is inserted; no AI or source execution.
"""
from __future__ import annotations
import base64
import io
import re
import zipfile
from copy import deepcopy
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from docx.shared import Pt
from PIL import Image

TOKEN = re.compile(r"\[[A-Za-z][A-Za-z0-9_. -]{0,99}\]")
Image.MAX_IMAGE_PIXELS = 40_000_000

def decode(value: str, limit: int = 22_000_000) -> bytes:
    if not isinstance(value, str) or len(value) > limit * 1.4:
        raise ValueError("File exceeds its allowed size")
    data = base64.b64decode(value, validate=True)
    if not data or len(data) > limit:
        raise ValueError("File is empty or exceeds its allowed size")
    return data

def read_template(encoded: str):
    data = decode(encoded)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > 5000 or sum(i.file_size for i in infos) > 80_000_000:
                raise ValueError("Template expands beyond the safe size limit")
            if any("vbaproject" in i.filename.lower() for i in infos):
                raise ValueError("Macro-enabled templates are not supported")
            if any(i.filename.startswith("word/embeddings/") for i in infos):
                raise ValueError("Templates containing embedded executable/OLE objects are not supported.")
            if "word/document.xml" not in archive.namelist():
                raise ValueError("This is not a Word DOCX template")
        doc = Document(io.BytesIO(data))
    except (zipfile.BadZipFile, KeyError) as error:
        raise ValueError("The DOCX template is invalid or protected") from error
    if len(doc.sections) != 1:
        raise ValueError("Use a single-section DOCX template. Page breaks are supported; mixed section layouts are not yet supported.")
    for part in doc.part.package.parts:
        for rel in part.rels.values():
            if rel.is_external and not rel.reltype.endswith("/hyperlink"):
                raise ValueError("Templates with externally linked images or objects are not supported; embed them in Word first.")
    return doc

def stories(doc):
    yield doc._element.body, doc._body
    seen = set()
    for section in doc.sections:
        for name in ("header", "footer", "first_page_header", "first_page_footer", "even_page_header", "even_page_footer"):
            story = getattr(section, name)
            if story.is_linked_to_previous:
                continue
            key = str(story.part.partname)
            if key not in seen:
                seen.add(key)
                yield story._element, story

def paragraphs(doc):
    for root, parent in stories(doc):
        for element in root.iter(qn("w:p")):
            if any(a.tag == qn("w:txbxContent") for a in element.iterancestors()):
                if TOKEN.search("".join(element.itertext())):
                    raise ValueError("Put template variables in paragraphs/tables, not drawing text boxes.")
                continue
            yield Paragraph(element, parent)

def inspect(encoded):
    doc = read_template(encoded)
    tokens = sorted({m.group() for p in paragraphs(doc) for m in TOKEN.finditer(p.text)})
    if not tokens:
        raise ValueError("No [VARIABLE] placeholders were found in the template.")
    return {"placeholders": tokens, "warnings": ["Single-section templates are supported, including nested tables and default/first/even headers and footers. Template typography is the default; optional field font overrides apply when set."]}

def content(subject, program, field):
    if field == "skip":
        return ""
    if field in ("number", "title", "question"):
        return str(program.get(field, ""))
    if field == "subject.name":
        return subject["name"]
    if field in ("semester", "courseCode"):
        return str(subject.get(field, ""))
    if field == "output":
        return [item for item in program["outputs"] if item["include"] and (item.get("text", "").strip() or item.get("dataUrl"))]
    if field.startswith("source:"):
        sources = [s for s in program["sources"] if s["include"] and s["role"] == field[7:]]
        if len(sources) > 1:
            raise ValueError(f"Program {program['number']}: more than one included source uses role {field[7:]}; assign separate roles.")
        return sources[0]["code"] if sources else ""
    if field.startswith("custom:"):
        key = field[7:]
        definition = next((f for f in subject.get("fields", []) if f["id"] == key), None)
        if not definition:
            raise ValueError("A mapping refers to a removed custom field; review the template mapping.")
        owner = subject if definition["scope"] == "subject" else program
        value = owner.get("values", {}).get(key, "")
        return [{"kind": "image", "dataUrl": value}] if value and definition["type"] == "image" else value
    raise ValueError(f"Unknown mapped field: {field}")

def validate(subject, programs):
    template = subject.get("template")
    if not template or not template.get("reviewed"):
        raise ValueError("Upload a template and explicitly review its mappings before generation.")
    actual = inspect(template["dataBase64"])["placeholders"]
    errors = []
    for token in actual:
        mapping = template["mappings"].get(token)
        if not mapping:
            errors.append(f"{token}: select a field or explicitly skip it.")
            continue
        for program in programs:
            value = content(subject, program, mapping["field"])
            if mapping.get("required") and (not value or (isinstance(value, str) and not value.strip())):
                errors.append(f"Program {program['number']}: {token} requires {mapping['field']}.")
    for field in subject.get("fields", []):
        if field["required"]:
            for program in programs:
                value = content(subject, program, "custom:" + field["id"])
                if not value or (isinstance(value, str) and not value.strip()):
                    errors.append(f"Program {program['number']}: {field['label']} is required.")
    if errors:
        raise ValueError("Required content is missing:\n" + "\n".join(dict.fromkeys(errors))[:8000])

def image_size(paragraph, section, mapping, width, height):
    available_w = section.page_width - section.left_margin - section.right_margin
    available_h = section.page_height - section.top_margin - section.bottom_margin
    for ancestor in paragraph._p.iterancestors():
        if ancestor.tag == qn("w:tc"):
            widths = ancestor.findall("./" + qn("w:tcPr") + "/" + qn("w:tcW"))
            if widths and widths[0].get(qn("w:type")) == "dxa":
                available_w = min(available_w, max(1, int(widths[0].get(qn("w:w"), "1"))) * 635)
        if mapping.get("imageFit") == "box" and ancestor.tag == qn("w:tr"):
            heights = ancestor.findall("./" + qn("w:trPr") + "/" + qn("w:trHeight"))
            if heights:
                available_h = min(available_h, max(1, int(heights[0].get(qn("w:val"), "1"))) * 635)
    if mapping.get("widthCm"):
        available_w = min(available_w, float(mapping["widthCm"]) * 360000)
    if mapping.get("heightCm"):
        available_h = min(available_h, float(mapping["heightCm"]) * 360000)
    ratio = min(available_w / width, available_h / height)
    return max(1, int(width * ratio)), max(1, int(height * ratio))

def insert_value(paragraph, anchor, style, value, section, mapping):
    def new_run():
        nonlocal anchor
        element = OxmlElement("w:r")
        if style is not None:
            element.append(deepcopy(style))
        anchor.addnext(element)
        anchor = element
        return Run(element, paragraph)
    items = value if isinstance(value, list) else [{"kind": "text", "text": str(value)}]
    for index, item in enumerate(items):
        if index:
            new_run().add_break()
        run = new_run()
        if item["kind"] == "text":
            # python-docx treats CR and LF as separate breaks. Windows CRLF
            # must be normalized before assigning run.text, not after export.
            text = item["text"].replace("\r\n", "\n").replace("\r", "\n")
            if mapping["field"].startswith("source:"):
                # Compact the exported listing only. Never modify saved source
                # code, indentation, tabs, or spaces inside string literals.
                text = "\n".join(line for line in text.split("\n") if line.strip())
                formatting = paragraph.paragraph_format
                formatting.line_spacing = 1
                formatting.space_before = Pt(0)
                formatting.space_after = Pt(0)
                props = paragraph._p.get_or_add_pPr()
                grid = props.find(qn("w:snapToGrid"))
                if grid is None:
                    grid = OxmlElement("w:snapToGrid")
                    props.insert_element_before(grid, "w:spacing")
                grid.set(qn("w:val"), "0")
            run.text = text
            if text:
                apply_font(run, mapping)
        else:
            raw = decode(item["dataUrl"].split(",", 1)[1], 9_000_000)
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
                size = image_size(paragraph, section, mapping, *image.size)
                png = io.BytesIO()
                image.save(png, format="PNG")
            png.seek(0)
            run.add_picture(png, width=size[0], height=size[1])
    return anchor

def apply_font(run, mapping):
    """Override only inserted text; absent settings preserve copied run/style."""
    family = mapping.get("fontFamily")
    if family is not None:
        if not isinstance(family, str) or not family.strip() or len(family) > 120 or re.search(r"[\x00-\x1f\x7f]", family):
            raise ValueError("Choose a valid field font name.")
        run.font.name = family.strip()
        fonts = run._r.get_or_add_rPr().get_or_add_rFonts()
        for script in ("ascii", "hAnsi", "eastAsia", "cs"):
            fonts.set(qn("w:" + script), family.strip())
        for theme in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme", "csTheme"):
            fonts.attrib.pop(qn("w:" + theme), None)
    size = mapping.get("fontSizePt")
    if size is not None:
        if isinstance(size, bool) or not isinstance(size, (int, float)) or not 1 <= size <= 400 or size * 2 != int(size * 2):
            raise ValueError("Choose a field font size from 1 to 400 pt in half-point steps.")
        run.font.size = Pt(size)
        props = run._r.get_or_add_rPr()
        complex_size = props.find(qn("w:szCs"))
        if complex_size is None:
            complex_size = OxmlElement("w:szCs")
            props.find(qn("w:sz")).addnext(complex_size)
        complex_size.set(qn("w:val"), str(int(size * 2)))

def render(subject, program):
    template = subject["template"]
    doc = read_template(template["dataBase64"])
    for paragraph in paragraphs(doc):
        matches = list(TOKEN.finditer(paragraph.text))
        if matches and "".join(r.text for r in paragraph.runs) != paragraph.text:
            raise ValueError("Put placeholders outside hyperlinks and content controls; ordinary paragraphs, tables and headers/footers are supported.")
        for match in reversed(matches):
            token = match.group()
            mapping = template["mappings"][token]
            runs = paragraph.runs
            offset = 0
            selected = []
            for run in runs:
                end = offset + len(run.text)
                if offset < match.end() and end > match.start():
                    selected.append((run, offset))
                offset = end
            if not selected:
                raise ValueError(f"{token} is inside an unsupported Word structure.")
            first, first_offset = selected[0]
            last, last_offset = selected[-1]
            before = first.text[:match.start() - first_offset]
            after = last.text[match.end() - last_offset:]
            style = deepcopy(first._r.rPr)
            first.text = before
            for run, _ in selected[1:]:
                run.text = ""
            anchor = insert_value(paragraph, first._r, style, content(subject, program, mapping["field"]), doc.sections[0], mapping)
            if after:
                tail = OxmlElement("w:r")
                if last._r.rPr is not None:
                    tail.append(deepcopy(last._r.rPr))
                anchor.addnext(tail)
                Run(tail, paragraph).text = after
    return doc
