import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import word_pdf

class WordPdfTests(unittest.TestCase):
    def test_successful_conversion_does_not_change_docx(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "record.docx"
            source.write_bytes(b"original DOCX")
            class Process:
                returncode = 0
                def wait(self, timeout=None):
                    source.with_suffix(".pdf").write_bytes(b"%PDF-1.4 fixture\n%%EOF")
                    return 0
            with patch.object(word_pdf.sys, "platform", "win32"), patch.object(word_pdf.subprocess, "Popen", return_value=Process()):
                self.assertEqual(word_pdf.convert(source), b"%PDF-1.4 fixture\n%%EOF")
            self.assertEqual(source.read_bytes(), b"original DOCX")

    def test_word_timeout_is_bounded_and_never_kills_unowned_word(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "record.docx"
            source.write_bytes(b"original DOCX")
            source.with_suffix(".word-request.status.json").write_text(json.dumps({
                "stage": "opening-document", "pid": 123, "owned": False,
            }))
            class Process:
                killed = False
                def wait(self, timeout=None):
                    if timeout is not None:
                        self.timeout = timeout
                        raise subprocess.TimeoutExpired("fixture", timeout)
                    return 0
                def kill(self):
                    self.killed = True
            process = Process()
            with patch.object(word_pdf.sys, "platform", "win32"), patch.object(word_pdf.subprocess, "Popen", return_value=process), patch.object(word_pdf.subprocess, "run") as kill_word:
                with self.assertRaisesRegex(ValueError, "timed out after 30 seconds.*opening-document"):
                    word_pdf.convert(source)
                self.assertEqual(process.timeout, 30)
                self.assertTrue(process.killed)
                kill_word.assert_not_called()
            self.assertEqual(source.read_bytes(), b"original DOCX")

    def test_office_failure_exposes_safe_stage_and_code_not_private_exception(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "record.docx"
            source.write_bytes(b"original DOCX")
            source.with_suffix(".word-request.status.json").write_text(json.dumps({
                "stage": "starting-word", "failed": True, "code": "0x80080005",
            }))
            class Process:
                def wait(self, timeout=None):
                    return 1
            with patch.object(word_pdf.sys, "platform", "win32"), patch.object(word_pdf.subprocess, "Popen", return_value=Process()):
                with self.assertRaisesRegex(ValueError, "starting-word.*0x80080005"):
                    word_pdf.convert(source)

if __name__ == "__main__":
    unittest.main()
