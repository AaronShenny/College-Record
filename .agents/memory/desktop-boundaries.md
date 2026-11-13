---
name: Desktop foundation boundaries
description: Why the browser preview must remain distinct from native desktop behavior and storage.
---

The browser renderer preview is development-only. The product remains a Windows
desktop application with native local files and per-student Drive storage.
A failed desktop security bridge must fail visibly, not silently fall back to
browser storage.

**Why:** The user chose Drive as the database and subsequently requested a full
Tauri migration preserving all existing logic rather than a rewrite. They confirmed
that Google sign-in/existing Drive records, editing/saving/reopening, and DOCX/PDF
generation/opening worked in the installed Tauri app, supporting reuse of the
existing record and document logic behind a native host.
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

Required uploaded runtime sources must be explicitly included in Git; local
file existence alone does not prove that a clean Windows CI checkout has them.

**Why:** This environment globally ignores uploaded assets, which can leave
local extraction tests passing while GitHub builds fail on a missing script.

**How to apply:** When adopting uploaded code as a runtime dependency, check
Git inclusion and narrowly exempt only that required source, not all uploads.

Keep implementation acceptance separate from production release acceptance.

**Why:** After confirming the installed Tauri app's core workflows, the user
explicitly chose to close implementation and defer the remaining release checks.

**How to apply:** Preserve the remaining performance, installer/recovery and signed
update work as explicit deferred scope. Do not describe unperformed checks as
passed or infer authorization to publish, enable updates or remove the fallback.
