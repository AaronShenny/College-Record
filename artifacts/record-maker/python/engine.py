"""Real import/generation engine, callable from the native worker or dev preview."""
from __future__ import annotations
import base64
import csv
import contextlib
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION_START
from docxcompose.composer import Composer
from templates import decode, inspect, render, validate

EXTRACTOR_NAME = "pdf_to_qns_1793905163999.py"

def extractor():
    frozen = getattr(sys, "frozen", False)
    source = (Path(sys._MEIPASS) / "extractor" if frozen else Path(__file__).resolve().parents[3] / "attached_assets") / EXTRACTOR_NAME
    spec = importlib.util.spec_from_file_location("approved_pdf_extractor", source)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

def number(value):
    if str(value).isdigit():
        return int(value)
    roman = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
    text = str(value).lower()
    if not text or any(c not in roman for c in text):
        return None
    total, previous = 0, 0
    for char in reversed(text):
        n = roman[char]
        total += -n if n < previous else n
        previous = max(previous, n)
    return total or None

def questions(payload):
    name = payload["name"].lower()
    raw = decode(payload["dataBase64"])
    if name.endswith(".csv"):
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise ValueError("Save the CSV with UTF-8 encoding before importing.") from error
        reader = csv.DictReader(io.StringIO(text))
        columns = reader.fieldnames or []
        if not columns or len(columns) != len(set(columns)) or len(columns) > 100:
            raise ValueError("CSV needs distinct header names and at most 100 columns.")
        rows = []
        for index, row in enumerate(reader):
            if index >= 500:
                raise ValueError("Import at most 500 rows at a time.")
            if None in row:
                raise ValueError(f"CSV row {index + 2} has more columns than its header.")
            rows.append({k: v or "" for k, v in row.items()})
        return {"columns": columns, "rows": rows, "warnings": []}
    if not name.endswith(".pdf"):
        raise ValueError("Select a text-based PDF or a UTF-8 CSV.")
    with tempfile.TemporaryDirectory() as temp:
        filename = Path(temp) / "questions.pdf"
        filename.write_bytes(raw)
        found = extractor().extract_questions(filename, payload.get("pages", ""))
    entries = [{"number": number(q.number), "title": q.topic, "question": q.question,
                "sourcePages": q.source_pages, "confidence": q.confidence} for q in found]
    if not entries:
        raise ValueError("No questions were detected. Try a different page range, CSV, or manual entry.")
    if len(entries) > 500:
        raise ValueError("Select fewer PDF pages; at most 500 questions can be reviewed at once.")
    return {"entries": entries, "warnings": ["Review numbering, topic/title and question text before adding programs. No OCR or generated answers were used."]}

def copy_story(source, target):
    target.is_linked_to_previous = False
    for child in list(target._element):
        target._element.remove(child)
    for child in source._element:
        clone = deepcopy(child)
        for node in clone.iter():
            for attr in (qn("r:embed"), qn("r:link"), qn("r:id")):
                rid = node.get(attr)
                if not rid:
                    continue
                rel = source.part.rels[rid]
                if rel.reltype.endswith("/image") and not rel.is_external:
                    new_rid, _ = target.part.get_or_add_image(io.BytesIO(rel.target_part.blob))
                elif rel.is_external:
                    new_rid = target.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
                else:
                    raise ValueError("Combined headers/footers contain an unsupported embedded relationship.")
                node.set(attr, new_rid)
        target._element.append(clone)

def combine(documents):
    master = documents[0]
    composer = Composer(master)
    for document in documents[1:]:
        master.add_section(WD_SECTION_START.NEW_PAGE)
        composer.append(document)
        target_section = master.sections[-1]
        target_section.start_type = WD_SECTION_START.NEW_PAGE
        source_section = document.sections[0]
        for name in ("header", "footer", "first_page_header", "first_page_footer", "even_page_header", "even_page_footer"):
            source_story = getattr(source_section, name)
            if not source_story.is_linked_to_previous:
                copy_story(source_story, getattr(target_section, name))
    return master

def make_record(doc, subject, programs, temp, combined=False):
    identifier = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    stem = re.sub(r"[^A-Za-z0-9-]+", "-", subject["name"]).strip("-")[:35] or "record"
    filename = f"{stem}-{'combined' if combined else 'program-' + str(programs[0]['number']).zfill(2)}-{timestamp.replace(':','').replace('.','')}-{identifier[:8]}.docx"
    path = Path(temp) / filename
    doc.save(path)
    raw = path.read_bytes()
    return {"id": identifier, "name": filename, "format": "docx", "subjectId": subject["id"],
            "programIds": [p["id"] for p in programs], "createdAt": timestamp, "byteLength": len(raw),
            "dataBase64": base64.b64encode(raw).decode()}, path

def pdf_record(record, filename):
    if os.name != "nt":
        raise ValueError("PDF export requires Microsoft Word on Windows. The DOCX version was retained.")
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    word = None
    opened = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        word.AutomationSecurity = 3  # Never enable macros from imported content.
        opened = word.Documents.Open(str(filename.resolve()), ReadOnly=True, AddToRecentFiles=False, UpdateLinks=0)
        output = filename.with_suffix(".pdf")
        opened.ExportAsFixedFormat(str(output), 17)
        raw = output.read_bytes()
        return {**record, "id": str(uuid.uuid4()), "format": "pdf", "name": output.name,
                "byteLength": len(raw), "dataBase64": base64.b64encode(raw).decode()}
    except Exception as error:
        raise ValueError("Microsoft Word PDF export failed. The DOCX version was retained; check Word installation and activation.") from error
    finally:
        if opened is not None:
            opened.Close(False)
        if word is not None:
            word.Quit()
        pythoncom.CoUninitialize()

def generate(payload):
    workspace = payload["workspace"]
    subject = next((s for s in workspace["subjects"] if s["id"] == payload["subjectId"] and not s.get("trashedAt")), None)
    if not subject:
        raise ValueError("The selected subject is missing or in Trash.")
    selected = set(payload.get("programIds", []))
    programs = sorted([p for p in subject["programs"] if p["id"] in selected and not p.get("trashedAt")], key=lambda p: p["number"])
    if not programs or {p["id"] for p in programs} != selected:
        raise ValueError("Select at least one active program; some selected programs are missing.")
    if payload["mode"] not in ("individual", "combined"):
        raise ValueError("Choose individual or combined document generation.")
    validate(subject, programs)  # Entire requested set validates before any generation.
    result = {"documents": [], "failures": [], "snapshotAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    with tempfile.TemporaryDirectory() as temp:
        groups = [programs] if payload["mode"] == "combined" else [[p] for p in programs]
        for group in groups:
            try:
                docs = [render(subject, p) for p in group]
                doc = combine(docs) if len(docs) > 1 else docs[0]
                record, filename = make_record(doc, subject, group, temp, payload["mode"] == "combined")
                result["documents"].append(record)
                if payload.get("pdf"):
                    try:
                        result["documents"].append(pdf_record(record, filename))
                    except Exception as error:
                        result["failures"].append({"number": group[0]["number"] if len(group) == 1 else None, "message": str(error)})
            except Exception as error:
                result["failures"].append({"number": group[0]["number"] if len(group) == 1 else None, "message": str(error)})
    return result

def handle(action, payload):
    if action == "open-word":
        if os.name != "nt":
            raise ValueError("Opening a record in Microsoft Word requires the installed Windows application.")
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
        try:
            word = win32com.client.Dispatch("Word.Application")
            word.AutomationSecurity = 3
            word.Visible = True
            word.Documents.Open(str(Path(payload["filename"]).resolve()), UpdateLinks=0, AddToRecentFiles=False)
        except Exception as error:
            raise ValueError("Microsoft Word could not open this document. Check desktop Word installation and activation.") from error
        finally:
            pythoncom.CoUninitialize()
        return {"opened": True}
    if action == "inspect-template":
        return inspect(payload["dataBase64"])
    if action == "import-questions":
        return questions(payload)
    if action == "generate":
        return generate(payload)
    raise ValueError("Unsupported document operation")

if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            result = handle(request["action"], request["payload"])
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
