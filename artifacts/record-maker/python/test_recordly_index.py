import base64
import copy
import io
import unittest
from docx import Document
from engine import generate
from templates import validate
from test_engine import subject_fixture, uid


class RecordlyIndexTests(unittest.TestCase):
    def payload(self, subject, mode="combined", selected=None):
        return {"workspace": {"schemaVersion": 1, "subjects": [subject]}, "subjectId": subject["id"],
                "programIds": selected or [p["id"] for p in subject["programs"]], "mode": mode, "pdf": False}

    def test_selected_programs_create_one_ordered_index_with_manual_and_blank_columns(self):
        subject = subject_fixture()
        original = subject["programs"][0]
        second = copy.deepcopy(original)
        second.update(id=uid(), number=1, title="First", indexValues={"date": "2026-11-13"})
        third = copy.deepcopy(original)
        third.update(id=uid(), number=2, title="Not selected")
        subject["programs"] = [original, third, second]
        subject["index"] = {"enabled": True, "title": "Experiment list", "columns": [
            {"id": "number", "label": "No.", "field": "number"},
            {"id": "title", "label": "Experiment", "field": "title"},
            {"id": "date", "label": "Completed", "field": "manual"},
            {"id": "signature", "label": "Signature", "field": "blank"},
        ]}
        before = copy.deepcopy(subject)
        result = generate(self.payload(subject, selected=[original["id"], second["id"]]))
        self.assertEqual(result["failures"], [])
        document = Document(io.BytesIO(base64.b64decode(result["documents"][0]["dataBase64"])))
        self.assertEqual(document.paragraphs[0].text, "Experiment list")
        self.assertEqual(document.sections[0].header.paragraphs[0].text, "")
        self.assertEqual(document.sections[1].header.paragraphs[0].text, "Experiment 1")
        self.assertEqual(len(document.tables[0].rows), 3)
        self.assertEqual([c.text for c in document.tables[0].rows[1].cells], ["1", "First", "2026-11-13", ""])
        self.assertEqual([c.text for c in document.tables[0].rows[2].cells], ["3", "Tree traversal", "", ""])
        self.assertEqual(subject, before)

    def test_disabled_or_individual_output_never_prepends_an_index(self):
        subject = subject_fixture()
        subject["index"] = {"enabled": True, "title": "Index", "columns": [{"id": "a", "label": "No.", "field": "number"}]}
        for mode, enabled in [("individual", True), ("combined", False)]:
            subject["index"]["enabled"] = enabled
            result = generate(self.payload(subject, mode))
            document = Document(io.BytesIO(base64.b64decode(result["documents"][0]["dataBase64"])))
            self.assertEqual(document.paragraphs[0].text, "Program 3")

    def test_index_custom_text_uses_subject_or_program_scope_and_rejects_unknown_fields(self):
        subject = subject_fixture()
        subject["fields"] = [{"id": "batch", "label": "Batch", "type": "text", "scope": "subject", "required": False}]
        subject["values"] = {"batch": "B"}
        subject["index"] = {"enabled": True, "title": "Index", "columns": [{"id": "batch", "label": "Batch", "field": "custom:batch"}]}
        result = generate(self.payload(subject))
        document = Document(io.BytesIO(base64.b64decode(result["documents"][0]["dataBase64"])))
        self.assertEqual(document.tables[0].rows[1].cells[0].text, "B")
        subject["index"]["columns"][0]["field"] = "page-number"
        result = generate(self.payload(subject))
        self.assertEqual(result["documents"], [])
        self.assertIn("unsupported", result["failures"][0]["message"])

    def test_unmapped_required_custom_field_does_not_block_generation(self):
        subject = subject_fixture()
        subject["fields"] = [{"id": "unused", "label": "Unused question", "type": "text", "scope": "program", "required": True}]
        validate(subject, subject["programs"])

    def test_enabled_index_with_no_columns_fails_without_creating_output(self):
        subject = subject_fixture()
        subject["index"] = {"enabled": True, "title": "Index", "columns": []}
        result = generate(self.payload(subject))
        self.assertEqual(result["documents"], [])
        self.assertTrue(result["failures"])
