"""Read-only foundation worker. JSON lines on stdin/stdout; never runs student code."""
from __future__ import annotations
import json
import platform
import sys
from pathlib import Path

PROTOCOL = 1
MAX_REQUEST = 131_072  # Includes a full selection of up to 500 program UUIDs.

def read_json(root: Path, relative: str) -> dict:
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("Snapshot reference escapes the workspace")
    return json.loads(target.read_text(encoding="utf-8"))

def handle(request: dict, workspace_root: Path) -> dict:
    if request.get("protocol") != PROTOCOL:
        raise ValueError("Unsupported bridge protocol")
    action = request.get("action")
    params = request.get("params", {})
    if action == "health":
        return {"protocol": PROTOCOL, "python": platform.python_version(), "status": "ready",
                "capabilities": ["health", "snapshot-summary"], "studentCodeExecution": False}
    if action != "snapshot-summary":
        raise ValueError("This foundation worker does not support that operation")
    snapshot = Path(params["snapshotPath"]).resolve()
    if not snapshot.is_relative_to(workspace_root.resolve() / "snapshots"):
        raise ValueError("Snapshot is outside the managed local workspace")
    app = read_json(snapshot, "app.json")
    subject_ref = next((s for s in app["subjects"] if s["id"] == params["subjectId"]), None)
    if subject_ref is None:
        raise ValueError("Subject was not found in the saved snapshot")
    subject = read_json(snapshot, subject_ref["path"])
    selected = set(params.get("programIds", []))
    programs = []
    for ref in subject["programs"]:
        program = read_json(snapshot, ref["path"])
        if program.get("trashedAt") or (selected and program["id"] not in selected):
            continue
        programs.append({"id": program["id"], "number": program["number"], "title": program["title"],
                         "includedSources": sum(bool(s["include"]) for s in program["sources"]),
                         "includedOutputs": sum(bool(o["include"]) for o in program["outputs"])})
    if selected - {p["id"] for p in programs}:
        raise ValueError("Some selected programs are missing or in Trash")
    return {"subject": subject["name"], "programs": sorted(programs, key=lambda p: p["number"]),
            "snapshot": snapshot.name, "note": "Snapshot inspected only. No document generated and no student code executed."}

def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "--workspace-root":
        print("Pass --workspace-root PATH", file=sys.stderr)
        return 2
    root = Path(sys.argv[2]).resolve()
    while True:
        line = sys.stdin.buffer.readline(MAX_REQUEST + 1)
        if not line:
            return 0
        request: dict = {}
        try:
            if len(line) > MAX_REQUEST or not line.endswith(b"\n"):
                raise ValueError("Worker request exceeds its limit")
            request = json.loads(line)
            if not isinstance(request, dict) or not isinstance(request.get("id"), str):
                raise ValueError("Worker request must have an ID")
            result = handle(request, root)
            response = {"protocol": PROTOCOL, "id": request["id"], "ok": True, "result": result}
        except Exception as error:
            response = {"protocol": PROTOCOL, "id": request.get("id") if isinstance(request, dict) else None,
                        "ok": False, "error": str(error)}
        print(json.dumps(response, ensure_ascii=True), flush=True)

if __name__ == "__main__":
    raise SystemExit(main())
