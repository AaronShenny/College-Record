"""Bounded Word automation in an isolated helper, never the document worker."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import time

TIMEOUT_SECONDS = 30

def _status(filename: Path, **data):
    temporary = filename.with_suffix(".tmp")
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(filename)

def run_helper(request_path: Path) -> int:
    request_path = request_path.resolve()
    data = json.loads(request_path.read_text(encoding="utf-8"))
    source = Path(data["source"]).resolve()
    target = Path(data["target"]).resolve()
    status = request_path.with_suffix(".status.json")
    if source.parent != request_path.parent or target.parent != source.parent or source.suffix.lower() != ".docx" or target.suffix.lower() != ".pdf":
        raise ValueError("Invalid Word conversion paths.")
    stage = "starting-word"
    word = opened = None
    pid = None
    owned = False
    creation_time = None
    import pythoncom
    pythoncom.CoInitialize()
    try:
        from win32com.client import dynamic
        import win32process
        import win32api
        started = time.time()
        _status(status, stage=stage)
        # Dynamic dispatch avoids broken/stale generated win32com caches.
        dispatch = pythoncom.CoCreateInstance(
            pythoncom.CLSIDFromProgID("Word.Application"), None,
            pythoncom.CLSCTX_LOCAL_SERVER, pythoncom.IID_IDispatch)
        word = dynamic.Dispatch(dispatch)
        try:
            pid = win32process.GetWindowThreadProcessId(word.Hwnd)[1]
            handle = win32api.OpenProcess(0x0400, False, pid)
            try:
                creation_time = win32process.GetProcessTimes(handle)["CreationTime"].timestamp()
                owned = creation_time >= started
            finally:
                handle.Close()
        except Exception:
            owned = False  # Never terminate a process whose ownership is uncertain.
        word.Visible = False
        word.DisplayAlerts = 0
        word.AutomationSecurity = 3
        stage = "opening-document"
        _status(status, stage=stage, pid=pid, owned=owned, creationTime=creation_time)
        opened = word.Documents.Open(str(source), ConfirmConversions=False,
            ReadOnly=True, AddToRecentFiles=False, UpdateLinks=0, Visible=False)
        stage = "exporting-pdf"
        _status(status, stage=stage, pid=pid, owned=owned, creationTime=creation_time)
        opened.ExportAsFixedFormat(str(target), 17, OpenAfterExport=False)
        _status(status, stage="pdf-written", pid=pid, owned=owned, creationTime=creation_time)
        return 0
    except Exception as error:
        code = getattr(error, "hresult", None)
        _status(status, stage=stage, pid=pid, owned=owned, creationTime=creation_time,
                code=f"0x{code & 0xffffffff:08X}" if isinstance(code, int) else "unavailable", failed=True)
        return 1
    finally:
        if opened is not None:
            try:
                opened.Close(False)
            except Exception:
                pass
        # Only close a Word process demonstrably created for this helper.
        if word is not None and owned:
            try:
                word.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()

def convert(source: Path) -> bytes:
    if sys.platform != "win32":
        raise ValueError("PDF export requires Microsoft Word on Windows. The DOCX version was retained.")
    source = source.resolve()
    target = source.with_suffix(".pdf")
    request = source.with_suffix(".word-request.json")
    status = request.with_suffix(".status.json")
    request.write_text(json.dumps({"source": str(source), "target": str(target)}), encoding="utf-8")
    command = [sys.executable]
    if not getattr(sys, "frozen", False):
        command.append(str(Path(__file__).with_name("worker.py")))
    command += ["--word-pdf", str(request)]
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    timed_out = False
    try:
        process.wait(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        process.wait()
    try:
        details = json.loads(status.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        details = {}
    if timed_out and details.get("owned") and isinstance(details.get("pid"), int):
        # Never taskkill all Word processes or the user's pre-existing Word.
        try:
            import win32api
            import win32process
            handle = win32api.OpenProcess(0x0400, False, details["pid"])
            try:
                same_process = win32process.GetProcessTimes(handle)["CreationTime"].timestamp() == details.get("creationTime")
            finally:
                handle.Close()
            if same_process:
                subprocess.run(["taskkill", "/PID", str(details["pid"]), "/T", "/F"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
        except Exception:
            pass
    if target.exists() and not details.get("failed"):
        raw = target.read_bytes()
        if raw.startswith(b"%PDF-") and b"%%EOF" in raw[-1024:]:
            return raw
    stage = details.get("stage", "starting-word")
    code = details.get("code", "unavailable")
    reason = "timed out after 30 seconds" if timed_out else "failed"
    raise ValueError(f"Microsoft Word PDF export {reason} during {stage} (Office code: {code}). "
                     "The DOCX was retained. Open Word manually, finish activation or any dialogs, "
                     "then retry PDF export. If it still fails, repair Microsoft Office.")
