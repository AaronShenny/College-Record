---
name: Product scope and requirements process
description: User-confirmed platform, storage requirement, and discussion-first scope.
---

The user wants a Windows desktop application for college Word-record making, with Google Drive integration and Drive as the database.

**Why:** The user explicitly specified Windows and “db is drive.”

**How to apply:** Keep these as requirements during feature discussions; do not substitute a browser app or introduce a separate database without agreement.

The intended audience is “Anyone at my college,” not only the creator or their classmates.

**Why:** The user selected this audience during requirements discussion.

**How to apply:** Discuss student data ownership, shared resources, and access permissions before finalizing the SRS. Do not assume that college-wide use implies college administration or a central Drive.

Each student's records should be stored in that student's own Google Drive.

**Why:** The user explicitly chose “Each student’s own Drive” over shared-template storage or one central college Drive.

**How to apply:** Treat per-student Drive ownership as confirmed. Do not assume a central college repository or shared-template service.

The app should format student-provided content.

**Why:** The user selected “Format student-provided content” rather than AI generation or both approaches.

**How to apply:** Scope the record-making workflow around content students supply. Do not carry the legacy scripts' AI generation into the requirements without a new request.

Discuss the desktop application's features first and eventually create an SRS document before building anything.

**Why:** The user explicitly corrected premature implementation: “before building anything lets just discuss about the desktop application, about the features and eventually we create a SRS document.”

**How to apply:** Stay in requirements discussion and SRS preparation until the user asks to proceed with implementation. Previously suggested technologies and features are proposals, not approved requirements.
