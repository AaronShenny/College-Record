import base64
import copy
import io
import os
import unittest
import uuid
from docx import Document
from engine import generate, questions
from templates import inspect, render, validate

def uid():
    return str(uuid.uuid4())

def encoded(document):
    out = io.BytesIO()
    document.save(out)
    return base64.b64encode(out.getvalue()).decode()

def subject_fixture():
    template = Document()
    paragraph = template.add_paragraph()
    paragraph.add_run("Program ").italic = True
    paragraph.add_run("[N").bold = True
    paragraph.add_run("O]").bold = True
    template.add_paragraph("[TITLE]")
    template.add_paragraph("[CODE]")
    template.add_table(rows=1, cols=1).cell(0, 0).text = "[OUTPUT]"
    template.sections[0].header.paragraphs[0].text = "Experiment [NO]"
    template.sections[0].footer.paragraphs[0].text = "Subject [SUBJECT]"
    mappings = {
        "[NO]": {"field": "number", "required": True},
        "[TITLE]": {"field": "title", "required": True},
        "[CODE]": {"field": "source:Main code", "required": True},
        "[OUTPUT]": {"field": "output", "required": True, "imageFit": "width"},
        "[SUBJECT]": {"field": "subject.name", "required": True},
    }
    return {
        "id": uid(), "name": "Data Structures", "semester": 2,
        "template": {"dataBase64": encoded(template), "reviewed": True, "mappings": mappings},
        "fields": [], "programs": [{
            "id": uid(), "number": 3, "title": "Tree traversal", "question": "", "trashedAt": None,
            "sources": [{"include": True, "role": "Main code", "code": "if (x < 2):\n\tprint('[NO]')"}],
            "outputs": [{"include": True, "kind": "text", "text": "one\ntwo"}],
        }],
    }

class EngineTests(unittest.TestCase):
    def test_inspection_finds_split_runs_tables_headers_and_footers(self):
        subject = subject_fixture()
        self.assertEqual(set(inspect(subject["template"]["dataBase64"])["placeholders"]),
                         {"[NO]", "[TITLE]", "[CODE]", "[OUTPUT]", "[SUBJECT]"})

    def test_render_preserves_formatting_and_does_not_expand_student_code(self):
        subject = subject_fixture()
        doc = render(subject, subject["programs"][0])
        self.assertEqual(doc.paragraphs[0].text, "Program 3")
        self.assertTrue(next(r for r in doc.paragraphs[0].runs if r.text == "3").bold)
        self.assertIn("print('[NO]')", "\n".join(p.text for p in doc.paragraphs))
        self.assertEqual(doc.tables[0].cell(0, 0).text, "one\ntwo")
        self.assertEqual(doc.sections[0].header.paragraphs[0].text, "Experiment 3")

    def test_only_required_mapped_content_blocks_generation(self):
        subject = subject_fixture()
        validate(subject, subject["programs"])  # Blank question is not mapped.
        subject["programs"][0]["title"] = ""
        with self.assertRaisesRegex(ValueError, "TITLE"):
            validate(subject, subject["programs"])

    def test_combined_order_new_sections_and_per_program_headers(self):
        subject = subject_fixture()
        other = copy.deepcopy(subject["programs"][0])
        other.update(id=uid(), number=1, title="First program")
        subject["programs"].append(other)
        result = generate({"workspace": {"subjects": [subject]}, "subjectId": subject["id"],
                           "programIds": [p["id"] for p in subject["programs"]], "mode": "combined", "pdf": False})
        self.assertFalse(result["failures"])
        self.assertEqual(len(result["documents"]), 1)
        doc = Document(io.BytesIO(base64.b64decode(result["documents"][0]["dataBase64"])))
        text = "\n".join(p.text for p in doc.paragraphs)
        self.assertLess(text.index("Program 1"), text.index("Program 3"))
        self.assertEqual(len(doc.sections), 2)
        self.assertEqual(doc.sections[0].header.paragraphs[0].text, "Experiment 1")
        self.assertEqual(doc.sections[1].header.paragraphs[0].text, "Experiment 3")

    def test_generation_versions_are_unique(self):
        subject = subject_fixture()
        payload = {"workspace": {"subjects": [subject]}, "subjectId": subject["id"],
                   "programIds": [subject["programs"][0]["id"]], "mode": "individual", "pdf": False}
        first = generate(payload)["documents"][0]
        second = generate(payload)["documents"][0]
        self.assertNotEqual(first["id"], second["id"])
        self.assertNotEqual(first["name"], second["name"])

    @unittest.skipIf(os.name == "nt", "Does not drive an actual installed Word instance in unit tests")
    def test_word_only_pdf_failure_retains_docx(self):
        subject = subject_fixture()
        result = generate({"workspace": {"subjects": [subject]}, "subjectId": subject["id"],
                           "programIds": [subject["programs"][0]["id"]], "mode": "individual", "pdf": True})
        self.assertEqual(result["documents"][0]["format"], "docx")
        self.assertIn("Microsoft Word", result["failures"][0]["message"])

    def test_csv_preserves_quoted_newlines_and_custom_headers(self):
        text = 'Experiment,Topic,Problem\n7,"Lists, stacks","Line one\nLine two"\n'
        result = questions({"name": "questions.csv", "dataBase64": base64.b64encode(text.encode()).decode()})
        self.assertEqual(result["columns"], ["Experiment", "Topic", "Problem"])
        self.assertEqual(result["rows"][0]["Problem"], "Line one\nLine two")

    def test_uploaded_extractor_is_used_for_text_pdf_and_rejects_scans(self):
        import pymupdf
        document = pymupdf.open()
        page = document.new_page()
        page.insert_text((72, 72), "Lab Questions\n1. Write a program to add two numbers.\n2. Write a program to sort a list.")
        result = questions({"name": "questions.pdf", "dataBase64": base64.b64encode(document.tobytes()).decode()})
        self.assertEqual([row["number"] for row in result["entries"]], [1, 2])
        scan = pymupdf.open()
        scan.new_page()
        with self.assertRaisesRegex(ValueError, "selectable text"):
            questions({"name": "scan.pdf", "dataBase64": base64.b64encode(scan.tobytes()).decode()})

    def test_image_output_keeps_aspect_and_fits_single_page(self):
        from PIL import Image
        image = io.BytesIO()
        Image.new("RGB", (100, 4000), "white").save(image, "PNG")
        subject = subject_fixture()
        subject["programs"][0]["outputs"] = [{"include": True, "kind": "image",
            "dataUrl": "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()}]
        doc = render(subject, subject["programs"][0])
        shape = doc.inline_shapes[0]
        section = doc.sections[0]
        self.assertLessEqual(shape.height, section.page_height - section.top_margin - section.bottom_margin)
        self.assertAlmostEqual(shape.width / shape.height, 1 / 40, places=4)

if __name__ == "__main__":
    unittest.main()
