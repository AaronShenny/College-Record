---
name: Desktop foundation boundaries
description: Why the browser preview must remain distinct from native desktop behavior and storage.
---

The browser renderer preview is development-only. The product remains a Windows
desktop application with native local files and per-student Drive storage.
A failed desktop security bridge must fail visibly, not silently fall back to
browser storage.

**Why:** The user chose Electron + React + Python and Drive as the database.
Using a browser preview makes interface development possible here, but silently
switching storage in an installed application could strand a student's work.

**How to apply:** Keep native operations behind a narrow bridge, distinguish
browser-only checks from native verification, and do not present browser tests
as evidence that a Windows installer, clipboard, Word automation, or Drive works.

Inspect the installed Electron types when extending native APIs, rather than
assuming older examples remain valid.

**Why:** The installed Electron release changed clipboard access to an
asynchronous API; familiar older snippets failed against the actual dependency.

**How to apply:** Check the installed API surface before adding clipboard and
other native handlers, and include the main/preload code in typechecking.
