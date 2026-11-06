#!/usr/bin/env python3
"""Extract editable question records from a text-based PDF.

Install the only runtime dependency with ``python -m pip install pymupdf``.
See ``python pdf_to_qns.py --help`` for command examples.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence, TextIO

try:
    import pymupdf
except ImportError as error:  # pragma: no cover - exercised by CLI users without the dependency
    raise SystemExit(
        "PyMuPDF is required. Install it with: python -m pip install pymupdf"
    ) from error


PROMPT = re.compile(
    r"^(?:write|create|define|develop|design|implement|construct|build|explain|"
    r"describe|discuss|compare|evaluate|calculate|find|determine|prove|show|"
    r"demonstrate|what|why|how|which|list|state|identify|analyse|analyze)\b",
    re.IGNORECASE,
)
STRONG_TASK = re.compile(
    r"^(?:(?:write|create|develop|design|implement|construct|build)\s+(?:an?\s+)?"
    r"(?:java\s+|python\s+|c\+\+\s+)?(?:program|application|class|function|method|algorithm)|"
    r"(?:explain|describe|discuss|compare|evaluate|calculate|find|determine|prove|"
    r"what|why|how|which)\b)",
    re.IGNORECASE,
)
END_SECTION = re.compile(
    r"^(?:references?\b|bibliography\b|instruments to evaluate\b|detailed session plan\b|"
    r"course outcomes?\b|co[-–]pso\b|general details of the course\b)",
    re.IGNORECASE,
)
QUESTION_SECTION = re.compile(
    r"^(?:(?:lab\s+)?cycle\s+\d+\b|(?:section|part)\s+[A-Z\d]+\s*[:.)–-]|"
    r"(?:lab|practical|programming)\s+(?:exercises|questions|assignments)\b|"
    r"(?:assignment\s+)?questions\s*[:–-]?\s*$)",
    re.IGNORECASE,
)
MARKER = re.compile(
    r"^(?:(question|ques|q)\s*(?:(?:no\.?|number)\s*:?\s*)?\.?\s*)?"
    r"(\(?)((?:\d{1,3}|[ivx]{1,6}))\s*([.)\]:-])(?!\d)\s*(.*)$",
    re.IGNORECASE,
)
BARE_MARKER = re.compile(r"^(?:question|ques|q)\s*\.?\s*(\d{1,3}|[ivx]{1,6})\s*$", re.IGNORECASE)
INLINE_MARKER = re.compile(
    r"\s+(\d{1,3})[.)](?!\d)\s*(?=(?:write|create|define|develop|design|implement|"
    r"explain|describe|discuss|compare|calculate|find|determine|what|why|how)\b|$)",
    re.IGNORECASE,
)
NESTED_LIST_END = re.compile(
    r"(?:options|operations|features|steps|requirements|tasks|following)\s*(?:to|include|are)?\s*:\s*$",
    re.IGNORECASE,
)
UNSCOPED_NUMERIC_TEXT = re.compile(r"^\d(?:\s|$)")
LEADING_CLOSING_PUNCTUATION = re.compile(r"^[,.;:!?%)\]}]")


@dataclass
class SourceLine:
    text: str
    page: int
    inline: bool = False


@dataclass
class Section:
    topic: str
    lines: list[SourceLine] = field(default_factory=list)
    scoped: bool = False


@dataclass
class Question:
    number: str
    topic: str
    question: str
    source_pages: list[int]
    confidence: str

    def export_record(self) -> dict[str, object]:
        return {
            "number": self.number,
            "topic": self.topic,
            "question": self.question,
            "sourcePages": self.source_pages,
            "confidence": self.confidence,
        }


def normalise(text: str) -> str:
    return re.sub(r"[\u200b-\u200d\ufeff]", "", text).replace("\u00a0", " ").strip()


def text_for_page(page: pymupdf.Page) -> list[str]:
    """Reconstruct lines from positioned PDF spans, retaining layout breaks."""
    positioned: list[tuple[str, float, float, float, float]] = []
    page_dict = page.get_text("dict")
    for block in page_dict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not isinstance(text, str) or not text.strip():
                    continue
                bbox = span.get("bbox", (0, 0, 0, 0))
                x0, y0, x1, y1 = (float(value) for value in bbox)
                positioned.append((text, x0, y0, x1 - x0, abs(y1 - y0)))

    positioned.sort(key=lambda item: (item[2], item[1]))
    rows: list[list[tuple[str, float, float, float, float]]] = []
    for item in positioned:
        row = next(
            (
                candidate
                for candidate in rows
                if abs(candidate[0][2] - item[2])
                <= max(2, min(candidate[0][4], item[4]) * 0.3)
            ),
            None,
        )
        if row is None:
            rows.append([item])
        else:
            row.append(item)

    output: list[str] = []
    previous_y: float | None = None
    previous_height = 10.0
    for row in rows:
        row.sort(key=lambda item: item[1])
        y = row[0][2]
        height = max((item[4] or 10 for item in row), default=10)
        if previous_y is not None and y - previous_y > max(previous_height, height) * 2:
            output.append("")

        line_text = ""
        previous: tuple[str, float, float, float, float] | None = None
        for item in row:
            text, x, _y, width, _height = item
            gap = x - (previous[1] + previous[3]) if previous else 0
            has_space = bool(
                previous
                and (re.search(r"\s$", previous[0]) or re.match(r"^\s", text))
            )
            needs_space = bool(
                line_text
                and (has_space or gap > 1.25)
                and not LEADING_CLOSING_PUNCTUATION.match(text.lstrip())
            )
            if needs_space and not line_text.endswith(" "):
                line_text += " "
            line_text += text.strip()
            previous = item
        if line_text.strip():
            output.append(line_text.strip())
        previous_y = y
        previous_height = height
    return output


def parse_page_range(value: str, page_count: int) -> list[int]:
    if page_count < 1:
        raise ValueError("The PDF does not contain any pages to extract.")
    value = value.strip()
    if not value:
        return list(range(1, page_count + 1))
    pages: set[int] = set()
    for item in value.split(","):
        match = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?", item.strip())
        if not match:
            raise ValueError('Enter page numbers or ranges such as "2-5, 8".')
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < 1:
            raise ValueError("Page numbers must be positive whole numbers.")
        if start > end:
            raise ValueError("Page ranges must start with the smaller page number.")
        if end > page_count:
            raise ValueError(f"This PDF has {page_count} pages. Choose pages from 1 to {page_count}.")
        pages.update(range(start, end + 1))
    return sorted(pages)


def _detect_marker(text: str) -> tuple[str, str, bool] | None:
    match = MARKER.match(text)
    if match:
        explicit, opening, number, separator, rest = match.groups()
        if opening == "(" and separator != ")":
            return None
        return number, rest, bool(explicit)
    bare = BARE_MARKER.match(text)
    if bare:
        return bare.group(1), "", True
    return None


def _split_inline(line: SourceLine) -> list[SourceLine]:
    positions = [match.start(1) for match in INLINE_MARKER.finditer(line.text)]
    if not positions:
        return [line]
    offsets = [0, *positions, len(line.text)]
    return [
        SourceLine(line.text[start:end].strip(), line.page, index > 0)
        for index, (start, end) in enumerate(zip(offsets, offsets[1:]))
        if line.text[start:end].strip()
    ]


def _sections_for(pages: Sequence[tuple[int, Sequence[str]]]) -> list[Section]:
    lines = [
        SourceLine(normalise(text), page_number)
        for page_number, page_lines in pages
        for text in page_lines
    ]
    has_sections = any(QUESTION_SECTION.search(line.text) for line in lines)
    sections: list[Section] = []
    current: Section | None = None
    if not has_sections:
        current = Section("", scoped=False)
        sections.append(current)
    for line in lines:
        if QUESTION_SECTION.search(line.text):
            current = Section(line.text, scoped=True)
            sections.append(current)
            continue
        if END_SECTION.search(line.text):
            current = None
            continue
        if current is not None:
            current.lines.append(line)
    return sections


def _record(number: str, topic: str, lines: Sequence[SourceLine], confidence: str) -> Question:
    nonempty = [line for line in lines if line.text.strip()]
    return Question(
        number=number,
        topic=topic,
        question="\n".join(line.text for line in nonempty).strip(),
        source_pages=sorted({line.page for line in nonempty}),
        confidence=confidence,
    )


def _numeric_value(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def _parse_section(section: Section) -> list[Question]:
    output: list[Question] = []
    current_number: str | None = None
    current_lines: list[SourceLine] = []
    current_confidence = "medium"
    nested_list = False
    topic = section.topic

    def finish() -> None:
        nonlocal current_number, current_lines, nested_list
        if current_number is not None and any(line.text.strip() for line in current_lines):
            output.append(_record(current_number, topic, current_lines, current_confidence))
        current_number = None
        current_lines = []
        nested_list = False

    for line in (part for source_line in section.lines for part in _split_inline(source_line)):
        if not line.text:
            continue
        marker = _detect_marker(line.text)
        if marker:
            number, marker_text, explicit = marker
            next_number = int(current_number or (output[-1].number if output else "0")) + 1
            marker_numeric = _numeric_value(number)
            if line.inline and marker_numeric != next_number:
                if current_number is not None:
                    current_lines.append(line)
                continue
            nested = bool(
                current_number is not None
                and nested_list
                and not explicit
                and not STRONG_TASK.search(marker_text)
            )
            if nested:
                current_lines.append(line)
                continue
            if marker_text and UNSCOPED_NUMERIC_TEXT.match(marker_text) and not explicit:
                if current_number is not None:
                    current_lines.append(line)
                continue
            finish()
            expected = len(output) + 1
            sequential = marker_numeric == expected
            current_number = number
            current_lines = [SourceLine(marker_text, line.page)] if marker_text else []
            current_confidence = (
                "high" if section.scoped and sequential and PROMPT.search(marker_text) else "medium"
            )
        elif current_number is not None:
            current_lines.append(line)
        elif PROMPT.search(line.text):
            current_number = str(len(output) + 1)
            current_lines = [line]
            current_confidence = "medium"
        elif section.scoped and not output and len(line.text) < 120:
            topic += f" {line.text}"
        if current_number is not None and NESTED_LIST_END.search(line.text):
            nested_list = True
    finish()
    return output


def parse_questions(pages: Sequence[tuple[int, Sequence[str]]]) -> list[Question]:
    sections = _sections_for(pages)
    questions = [question for section in sections for question in _parse_section(section)]
    if questions or any(section.scoped for section in sections):
        return questions

    paragraphs: list[list[SourceLine]] = []
    for section in sections:
        paragraph: list[SourceLine] = []
        for line in section.lines:
            if not line.text:
                if paragraph:
                    paragraphs.append(paragraph)
                paragraph = []
            else:
                paragraph.append(line)
        if paragraph:
            paragraphs.append(paragraph)
    return [
        _record(str(index), "", paragraph, "low")
        for index, paragraph in enumerate(paragraphs, start=1)
    ]


def extract_questions(pdf_path: Path, page_range: str = "") -> list[Question]:
    try:
        document = pymupdf.open(pdf_path)
    except (pymupdf.FileDataError, OSError) as error:
        raise ValueError(f"Could not open PDF: {error}") from error
    try:
        if document.page_count < 1:
            raise ValueError("The PDF does not contain any pages to extract.")
        selected_pages = parse_page_range(page_range, document.page_count)
        pages = [(number, text_for_page(document[number - 1])) for number in selected_pages]
    finally:
        document.close()
    character_count = sum(len(re.sub(r"\s", "", "".join(lines))) for _, lines in pages)
    if character_count == 0:
        raise ValueError(
            "No selectable text was found. This looks like a scanned or image-only PDF, "
            "which this tool cannot read."
        )
    return parse_questions(pages)


def questions_to_csv(questions: Iterable[Question], output: TextIO) -> None:
    writer = csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerow(["number", "topic", "question", "source_pages", "confidence"])
    for question in questions:
        writer.writerow(
            [
                question.number,
                question.topic,
                question.question,
                "; ".join(str(page) for page in question.source_pages),
                question.confidence,
            ]
        )


def questions_to_json(source_file: str, questions: Sequence[Question]) -> str:
    return json.dumps(
        {
            "sourceFile": source_file,
            "exportedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            ),
            "questions": [question.export_record() for question in questions],
        },
        ensure_ascii=False,
        indent=2,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract question drafts from selectable-text PDFs locally. Scanned/image-only "
            "PDFs are not supported; review the extracted records before use."
        ),
        epilog=(
            "Installation: python -m pip install pymupdf\n"
            "Examples:\n"
            "  python pdf_to_qns.py course.pdf\n"
            "  python pdf_to_qns.py course.pdf --pages '3-6, 8' --format json\n"
            "  python pdf_to_qns.py course.pdf -o reviewed-questions.csv"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("pdf", type=Path, help="input PDF file")
    parser.add_argument(
        "-p", "--pages", default="", metavar="RANGE",
        help='optional pages/ranges, e.g. "3-6, 8" (default: all pages)',
    )
    parser.add_argument(
        "-f", "--format", choices=("csv", "json"), default=None,
        help="export format (defaults to the output filename extension, or csv)",
    )
    parser.add_argument(
        "-o", "--output", type=Path, metavar="PATH",
        help="output file path (default: <input-name>-questions.<format>)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_format = args.format or (
        args.output.suffix.lower().lstrip(".") if args.output and args.output.suffix else "csv"
    )
    if output_format not in {"csv", "json"}:
        parser.error('Output format must be "csv" or "json".')
    if args.output is not None and args.output.suffix and args.output.suffix.lower() != f".{output_format}":
        parser.error("The output file extension must match the selected format.")

    try:
        questions = extract_questions(args.pdf, args.pages)
        output_path = args.output or args.pdf.with_name(
            f"{args.pdf.stem}-questions.{output_format}"
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_format == "csv":
            with output_path.open("w", encoding="utf-8-sig", newline="") as output:
                questions_to_csv(questions, output)
        else:
            output_path.write_text(
                questions_to_json(args.pdf.name, questions) + "\n", encoding="utf-8"
            )
    except (ValueError, OSError, pymupdf.FileDataError) as error:
        parser.error(str(error))
    print(f"Exported {len(questions)} question(s) to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
