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

Support both student-supplied output text/screenshots and running student-provided code to capture output.

**Why:** The user selected “Support both methods” for program output.

**How to apply:** Include both output paths in the SRS. Runtime prerequisites and execution safeguards still need discussion; code execution does not imply AI generation.

First-version code execution must support Python, Java, and C.

**Why:** The user explicitly selected these three languages.

**How to apply:** Scope execution requirements to these languages; do not include C++ by default. Runtime setup remains an open requirement.

Students should type input interactively during program execution.

**Why:** The user selected “Type interactively during execution,” not prepared input or both.

**How to apply:** Specify an interactive input/output experience for Python, Java, and C. Do not assume a separate prepared-input mode is required.

Students can choose per experiment whether captured output is inserted as editable text or a terminal image.

**Why:** The user selected “Choose per experiment” for output appearance in Word records.

**How to apply:** Preserve this choice at experiment level rather than enforcing one output format for an entire subject.

Students upload a Word template containing variables such as `[NO]`, and the app provides an option to map those variables.

**Why:** The user explicitly requested uploaded templates with variable mapping and further discussion of this feature.

**How to apply:** Treat template upload and user-controlled variable mapping as confirmed. Detection rules, available fields, custom fields, formatting, and mapping reuse remain to be discussed; do not assume mappings solely from placeholder names.

Template mappings must support both built-in and student-created custom fields.

**Why:** The user selected “Built-in and custom fields.”

**How to apply:** Do not restrict mapping targets to a fixed built-in list. Custom field types and value scopes still need discussion.

First-version custom fields support text and images.

**Why:** The user selected “Text and images” rather than text only or text, images, and tables.

**How to apply:** Include multiline text and image-valued custom fields in requirements discussions. Do not assume editable table-valued custom fields are required.

Each custom field can have either whole-record or per-experiment value scope.

**Why:** The user selected “Allow both scopes.”

**How to apply:** Whole-record values are entered once and reused across experiments; per-experiment values can differ for each experiment. Keep scope selectable rather than inferred from a field's name.

Use template formatting only; do not provide field-level formatting overrides in the app.

**Why:** The user selected “Use template formatting only.”

**How to apply:** Preserve the Word template's formatting when inserting mapped content. Do not carry proposed font/size override controls into the SRS. Image sizing and placeholder placement rules remain open.

Discuss the desktop application's features first and eventually create an SRS document before building anything.

**Why:** The user explicitly corrected premature implementation: “before building anything lets just discuss about the desktop application, about the features and eventually we create a SRS document.”

**How to apply:** Stay in requirements discussion and SRS preparation until the user asks to proceed with implementation. Previously suggested technologies and features are proposals, not approved requirements.
