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

Support template variables in body paragraphs, tables, headers, and footers.

**Why:** The user selected “Include headers and footers” rather than body/tables only or also including text boxes.

**How to apply:** Include these four locations in the SRS. Text boxes and shapes are not part of the confirmed first-version scope.

Support both fit-to-available-width image insertion and template-defined image areas.

**Why:** The user selected “Support both” for template-controlled image sizing.

**How to apply:** Keep image proportions without cropping or stretching. Allow ordinary image variables to fit available width and designated template areas for precise sizing. Tall-image overflow behavior and the exact image-area mapping mechanism remain open.

Block document generation when required content is missing.

**Why:** The user selected “Block until complete” rather than allowing drafts with warnings.

**How to apply:** Validate required mappings and values before generating documents and identify affected experiments. This does not prohibit saving incomplete work; saving behavior remains a separate requirement.

Reuse the same mapping for the same template across different programs in a subject's record.

**Why:** The user clarified: “for a subject's record, the template and mapping would be same across different programs.”

**How to apply:** Configure the subject record's template and mapping once and apply them to its programs, using each program's own values. Reuse across separate records or semesters has not been confirmed.

Use one template per subject record.

**Why:** The user selected “One template per subject record,” not different templates per program.

**How to apply:** All programs within a subject record use its single template and mapping. Do not introduce per-program template selection.

Support both manual program entry and bulk import of questions from CSV and source files from a folder.

**Why:** The user selected “Both methods” for adding programs to a subject record.

**How to apply:** Include both entry paths in the SRS. CSV columns, source-file matching rules, and duplicate handling remain open requirements.

CSV imports must allow students to map columns to fields rather than require fixed column names.

**Why:** The user selected “Map CSV columns.”

**How to apply:** Keep CSV-to-field mapping distinct from field-to-Word-variable mapping. Source-file matching and duplicate handling still need discussion.

Students can connect a single folder containing all program files for a subject, or copy and paste code. File matching uses automatic suggestions followed by student review, with manual assignment available for every file.

**Why:** The user explicitly described these alternatives and retained manual file assignment.

**How to apply:** Do not require folder-based entry when a student prefers pasted code, or treat suggested matches as final assignments.

Source folders may be on the Windows computer or in Google Drive. Save code, Word documents, configuration, and other app data in a separate app folder in each student's own Drive.

**Why:** The user specified “support either location” and “saving both code and word and configuration etc in a separate app's folder in the students' own drive.”

**How to apply:** Distinguish source folders from the app-managed Drive folder. Source-folder selection is for import, not ongoing synchronization.

Import source files once with no ongoing link to the original files.

**Why:** The user selected “Import once, no ongoing link.”

**How to apply:** Keep imported copies independent in the student's app-managed Drive folder. Do not watch original folders, automatically refresh imported code, or write changes back to originals. Updates from source files require explicit reimport; collision handling remains open.

First-version document outputs include a Word file per program, a combined subject Word record, and PDF export.

**Why:** The user selected all three output options.

**How to apply:** Include all three in the SRS. Combined-record ordering, pagination, selection, and PDF conversion prerequisites remain to be discussed.

Always arrange programs in the combined record in program-number order.

**Why:** The user selected “Always use program-number order” rather than allowing rearrangement.

**How to apply:** Use numeric order, not filename alphabetical order. Do not add manual reordering. Inclusion selection and page-break behavior remain unconfirmed.

Each program must start on a new page in the combined record.

**Why:** The user selected “Start each on a new page.”

**How to apply:** Separate successive programs with a new-page boundary; do not interpret this as requiring every program to fit on a single page.

Students can generate documents for one program, selected programs, or the entire subject record.

**Why:** The user selected “Selected programs or entire record” after the selection behavior was explained.

**How to apply:** Preserve numeric ordering and new-page boundaries for selected programs. Required-content validation applies to included programs; incomplete programs outside the selection do not block generation.

Support working offline and syncing to Drive later.

**Why:** The user selected “Work offline, sync later.”

**How to apply:** Previously downloaded records can be edited offline, code can run with local tools, and documents can be generated when required resources are cached. Queue local changes for upload after reconnection and show unsynced status. First sign-in and uncached Drive content require connectivity.

Resolve conflicting saved changes using the most recently saved version.

**Why:** The user selected “Use most recently saved version” after the risk of overwriting the other changes was explained.

**How to apply:** Specify latest-save-wins conflict resolution rather than mandatory manual comparison. The definition of save time across offline devices and any recovery/history policy still need to be specified; do not assume latest upload means latest save.

Discuss the desktop application's features first and eventually create an SRS document before building anything.

**Why:** The user explicitly corrected premature implementation: “before building anything lets just discuss about the desktop application, about the features and eventually we create a SRS document.”

**How to apply:** Stay in requirements discussion and SRS preparation until the user asks to proceed with implementation. Previously suggested technologies and features are proposals, not approved requirements.
