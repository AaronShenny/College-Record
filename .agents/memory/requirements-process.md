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

Support use on both personal computers and shared college computers.

**Why:** The user selected “Both” when asked which kinds of computers students would use.

**How to apply:** Do not assume each Windows installation belongs exclusively to one student. Account separation and local-cache handling need a design suitable for shared use. The user subsequently requested background downloads and an explicit logout-and-delete option, rather than selecting the proposed personal/shared modes. The one-active-computer-per-student version-one boundary remains unchanged.

On sign-in, download all workspace files locally in the background and offer an option to log out and delete local files.

**Why:** The user said “When students sign in, the system downloads all the files from the drive locally in background. And an option to logout and delete all the files from the system.”

**How to apply:** Treat background downloading and an explicit logout-and-local-cleanup action as requested behavior, not merely on-demand caching. The working interpretation is the student's app workspace and app-managed local copies, not unrelated Drive or computer files; this scope was stated to the user but has not yet been explicitly confirmed. Do not infer authorization for broad filesystem deletion, deletion of Drive originals, or automatic loss of unsynced edits. Handling pending uploads during cleanup still needs a decision. No application implementation was authorized.

Each student's records should be stored in that student's own Google Drive.

**Why:** The user explicitly chose “Each student’s own Drive” over shared-template storage or one central college Drive.

**How to apply:** Treat per-student Drive ownership as confirmed. Do not assume a central college repository or shared-template service.

The app should format student-provided content.

**Why:** The user selected “Format student-provided content” rather than AI generation or both approaches.

**How to apply:** Scope the record-making workflow around content students supply. Do not carry the legacy scripts' AI generation into the requirements without a new request.

Do not include code execution in the first version. Provide a `PASTE` option in each program's edit/preview window so students can paste output screenshots.

**Why:** The user revised the scope: “for the first version i think code execution would be difficult, i think let the students paste the screenshot, we would give them 'PASTE' option in each program edit preview window.”

**How to apply:** Remove earlier execution requirements from the first-version SRS, including runtime/compiler detection, interactive input, run/stop controls, timeouts, entry-point configuration, and automatic terminal capture. Screenshot paste is clipboard image input, not executing code or rendering a full Word-document preview.

First-version program output supports both student-supplied screenshots and output text.

**Why:** Following removal of code execution, the user explicitly selected “Screenshots and output text.”

**How to apply:** Retain image and editable text output entry without running programs. Provide the requested screenshot PASTE action in each program edit/preview window.

Deleted programs and subject records move to a recoverable app Trash area rather than being permanently removed immediately.

**Why:** The user selected “Move to recoverable Trash.”

**How to apply:** Hide trashed items from active records, allow restoration, and require separate confirmation for permanent removal. Store the recoverable Trash in the app's Drive folder. Automatic expiry or retention duration has not been agreed.

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

**How to apply:** Keep image proportions without cropping or stretching. Allow ordinary image variables to fit available width and designated template areas for precise sizing. The exact image-area mapping mechanism remains open.

Shrink tall screenshots to fit on one page rather than splitting them across pages.

**Why:** The user selected “Shrink to fit one page” after the potential readability reduction was explained.

**How to apply:** Preserve the entire screenshot and its aspect ratio while fitting the available printable area or template-defined image area. Do not split or crop tall screenshots automatically.

Block document generation when required content is missing.

**Why:** The user selected “Block until complete” rather than allowing drafts with warnings.

**How to apply:** Validate required mappings and values before generating documents and identify affected experiments. This does not prohibit saving incomplete work; saving behavior remains a separate requirement.

Reuse the same mapping for the same template across different programs in a subject's record.

**Why:** The user clarified: “for a subject's record, the template and mapping would be same across different programs.”

**How to apply:** Configure the subject record's template and mapping once and apply them to its programs, using each program's own values. Reuse across separate records or semesters has not been confirmed.

Use one template per subject record.

**Why:** The user selected “One template per subject record,” not different templates per program.

**How to apply:** All programs within a subject record use its single template and mapping. Do not introduce per-program template selection.

Allow replacing a subject's template after programs have been added, with mapping review.

**Why:** The user selected “Allow replacement with mapping review.”

**How to apply:** Keep only one active template per subject. Preserve questions, source files, output, custom-field values, and previously generated documents. Review mappings before further generation; newly generated documents use the replacement template.

Support both manual program entry and bulk import of questions from CSV and source files from a folder.

**Why:** The user selected “Both methods” for adding programs to a subject record.

**How to apply:** Include both entry paths in the SRS. CSV columns, source-file matching rules, and duplicate handling remain open requirements.

The template-setup workflow must offer importing program numbers and titles from PDF or CSV, and an optional source-code-folder selection.

**Why:** The user approved the mapping workflow and added “upload the no, titles [extract it from the pdf or csv[map]], select the source code folder [optional].”

**How to apply:** For CSV, map columns to the relevant fields; for PDF, extract program numbers and supplied title/question text. Do not require a source folder to create programs or configure the subject.

The user approved a review-before-creation workflow for PDF/CSV imports.

**Why:** The user selected “Use this import workflow” after reviewing the proposed sequence.

**How to apply:** Show editable extracted/mapped entries before creation; allow corrections, joining incorrectly split text, removing unwanted entries, and assigning text to subject-specific fields. Flag missing/duplicate numbers for correction and skip program numbers already present. Create selected valid entries on confirmation without requiring code/output. Then optionally import a local/Drive source folder with reviewed suggested or manual assignments.

Whether a title and full question are separate depends on the subject.

**Why:** The user answered “depends on the subject” rather than choosing a single global title/question model.

**How to apply:** Let subject-specific template mappings determine whether title, question, or both are used. Do not globally merge the fields, require both for every subject, or automatically invent/shorten titles.

PDF import supports selectable-text PDFs only, not scanned pages or OCR.

**Why:** The user selected “Selectable-text PDFs only” after scanned-PDF recognition was discussed.

**How to apply:** Extract program numbers and titles from embedded PDF text. Do not introduce OCR into first-version scope. Explain when a PDF lacks usable text and direct students to CSV or manual entry.

CSV imports must allow students to map columns to fields rather than require fixed column names.

**Why:** The user selected “Map CSV columns.”

**How to apply:** Keep CSV-to-field mapping distinct from field-to-Word-variable mapping. Source-file matching and duplicate handling still need discussion.

Skip existing program numbers when an import would create duplicate programs or update existing program content.

**Why:** The user selected “Skip existing program numbers” rather than reviewing conflicting updates.

**How to apply:** Do not overwrite existing program content through duplicate imports. Explain which entries were skipped; normal editing and explicit source-file assignment remain distinct from duplicate program imports.

Students can connect a single folder containing all program files for a subject, or copy and paste code. File matching uses automatic suggestions followed by student review, with manual assignment available for every file.

**Why:** The user explicitly described these alternatives and retained manual file assignment.

**How to apply:** Do not require folder-based entry when a student prefers pasted code, or treat suggested matches as final assignments.

Source folders may be on the Windows computer or in Google Drive. Save code, Word documents, configuration, and other app data in a separate app folder in each student's own Drive.

**Why:** The user specified “support either location” and “saving both code and word and configuration etc in a separate app's folder in the students' own drive.”

**How to apply:** Distinguish source folders from the app-managed Drive folder. Source-folder selection is for import, not ongoing synchronization.

Import source files once with no ongoing link to the original files.

**Why:** The user selected “Import once, no ongoing link.”

**How to apply:** Keep imported copies independent in the student's app-managed Drive folder. Do not watch original folders, automatically refresh imported code, or write changes back to originals. Updates from source files require explicit reimport; collision handling remains open.

Allow students to edit imported source code directly in the program edit/preview window and explicitly replace a source file within the existing program.

**Why:** The user corrected their previous read-only choice: “yes yes i made a mistake earlier” and requested a “Replace File action within the existing program.”

**How to apply:** Edits and confirmed file replacement affect the app-managed saved copy, not original source files. Preserve the existing program and its other content when replacing a file. Do not treat the superseded read-only choice as a requirement, reintroduce code execution, or change the skip-duplicates bulk-import rule.

When source code is edited or replaced, warn that existing output may be outdated without blocking document generation.

**Why:** The user selected “Show warning without blocking.”

**How to apply:** Preserve existing screenshots and output text; do not require output-review confirmation before generation. This warning does not waive the separate rule that missing required content blocks generation. The app does not verify code/output correctness.

The user approved the proposed program-editing workflow, including Add Image, Add Text, output-item ordering, and Previous Program / Next Program navigation.

**Why:** The user selected “Use this workflow” after reviewing the complete editing sequence.

**How to apply:** Open a program from the subject's numeric list, edit template-driven per-program fields and source files, inherit whole-record values, and manage output as selectable ordered text/image items. Provide clipboard PASTE, image-file selection, editable output text, image preview, removal, and previous/next navigation. Preserve autosave/Save Now and generate/open-in-Word behavior; do not confuse content preview with rendered Word preview.

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

**How to apply:** Previously downloaded records can be edited offline and documents can be generated when required resources are cached. Queue local changes for upload after reconnection and show unsynced status. First sign-in and uncached Drive content require connectivity.

Resolve conflicting saved changes using the most recently saved version.

**Why:** The user selected “Use most recently saved version” after the risk of overwriting the other changes was explained.

**How to apply:** Specify latest-save-wins conflict resolution rather than mandatory manual comparison. The definition of save time across offline devices and any recovery/history policy still need to be specified; do not assume latest upload means latest save.

PDF export must use installed Microsoft Word, not LibreOffice.

**Why:** The user selected “Require Microsoft Word only” for PDF conversion prerequisites.

**How to apply:** Specify installed Windows desktop Microsoft Word as the PDF conversion prerequisite. Detect its availability and explain when PDF export is unavailable. Do not add LibreOffice fallback or make Word a prerequisite for ordinary record-data editing or DOCX generation. In-app preview behavior remains unconfirmed.

Preview formatted records by opening generated documents in Microsoft Word, not with an in-app document preview.

**Why:** The user selected “Open in Microsoft Word.”

**How to apply:** Include an open-in-Word workflow for generated records. Do not add embedded document rendering or an in-app Word editor to the first-version scope. Handling edits made in Word remains open.

Save a new version whenever a Word document is regenerated, retaining the previous generated document.

**Why:** The user selected “Save a new version” after the risk of losing Word-only edits was explained.

**How to apply:** Do not silently replace previous generated documents. Keep generated-document versioning separate from latest-save-wins conflict resolution for app data. Edits in Word do not automatically update the app's mapped content.

Support autosave and a Save Now action, including saving unfinished records.

**Why:** The user selected “Autosave and Save Now” after local-first saving and later Drive sync were described.

**How to apply:** Save progress locally and sync when connected; show local-save, syncing, and Drive-save states distinctly. Missing required fields block generation, not saving progress.

Restrict sign-in to college-issued Google accounts.

**Why:** The user selected “College-issued Google accounts only.”

**How to apply:** Do not permit unrestricted personal Google accounts. Verify the authenticated Google identity against the confirmed allowed domain, not merely an address typed into the app.

The allowed college Google-account email domain is `rajagiri.edu`.

**Why:** The user supplied this domain when asked which college email domains should be allowed.

**How to apply:** Use exactly this domain in the SRS access requirement; additional domains and subdomains have not been approved.

Organize subject records using `semester-XX/subject-name` under the student's app folder.

**Why:** The user specified “semester-XX/subject-name” when asked about record organization.

**How to apply:** Preserve semester-to-subject hierarchy in the SRS and Drive organization. Each subject record retains its one template and mappings.

One program can contain multiple source files.

**Why:** The user selected “Support multiple source files.”

**How to apply:** Include grouped source files per program in the SRS for content storage and template mapping, not code execution.

Students can select and order which source files appear in the Word record.

**Why:** The user selected “Let students select files” after selection, within-program ordering, and filename identification were described.

**How to apply:** Preserve numeric program order while allowing source-file selection and ordering within each program. Identify included files by filename. The template insertion mechanism remains open.

Use separate file mappings for multi-file programs, not a combined code field.

**Why:** The user selected “Separate file mappings” rather than one combined code field or both.

**How to apply:** Template variables map to reusable file roles such as Main code and Helper code, with actual files assigned per program. Placement follows the template. Do not concatenate all selected files into a single field as an approved feature.

The user approved the template-mapping workflow, including distinct-variable detection and required/optional fields.

**Why:** The user explicitly said “use this mapping workflow.”

**How to apply:** Detect bracketed variables in supported Word locations, show each distinct variable once, map repeated occurrences consistently, and allow built-in fields, custom fields, and source-file roles. Optional empty variables become blank content without removing surrounding layout. Save incomplete setup, but validate required mappings/content before generation; check document layout by opening a generated completed program in Word.

Support multiple saved output captures per program, with students selecting which captures appear in the record.

**Why:** The user selected “Multiple captures per program” after multiple test runs and text-or-image capture choices were described.

**How to apply:** Preserve multiple supplied output items per program rather than implicitly replacing earlier items. Both screenshots and output text are supported. Automatic capture from execution is no longer first-version scope.

Use one output variable to insert a program's selected captures sequentially.

**Why:** The user selected “One output variable” rather than separate output variables or both methods.

**How to apply:** A variable such as `[OUTPUT]` receives the selected captures one after another, accommodating different capture counts per program. Keep this distinct from the confirmed separate mappings for source files.

Discuss the desktop application's features first and eventually create an SRS document before building anything.

**Why:** The user explicitly corrected premature implementation: “before building anything lets just discuss about the desktop application, about the features and eventually we create a SRS document.”

**How to apply:** The user subsequently authorized SRS-based screens only. Visual mockups with sample data are allowed; a working desktop application, live Drive integration, authentication, execution, and document generation still require separate approval. The Electron + React + Python stack is now confirmed; other unapproved suggestions remain proposals.

Use the user's supplied `pdf_to_qns` script as the baseline for the future PDF question extractor.

**Why:** The user explicitly designated the attached script: “this is the script we r gonna use to extract qns from the pdf.”

**How to apply:** Adapt this extractor when PDF import implementation is approved rather than substituting an AI service or unrelated extraction approach. This choice does not authorize wiring extraction into the screens-only mockups. Preserve student review before creating programs.

Use Electron + React + Python for the Windows desktop application.

**Why:** The user explicitly chose “lets go with electron + react + python” during the technology discussion.

**How to apply:** Treat this stack as confirmed for architecture discussion and future implementation. Stack selection alone does not authorize starting application development.

Version 1 must support automatic application updates.

**Why:** The user explicitly selected “Automatic updates” rather than manual installer updates.

**How to apply:** Include an automatic updater in the future desktop application scope. This choice does not authorize implementation.

Use background update checks and automatic downloads, then offer “Restart now” or “Later” to install a verified update.

**Why:** The user selected “Use this update flow” after reviewing the proposed behavior.

**How to apply:** Update the interface and bundled Python helper together. Never restart during editing, extraction, or document generation. Finish local saving and preserve queued Drive uploads before restart; do not require Drive sync to complete first. Choosing Later leaves the current app usable, including offline. Update-service failure must not interrupt normal work. Release hosting, Windows signing, and failed-install recovery remain technical design decisions.

The first release must support Windows 10 and Windows 11.

**Why:** The user selected “Windows 10 and 11” as the first-release compatibility target.

**How to apply:** Include both Windows versions in packaging and compatibility testing. Minimum supported builds and processor architectures remain unspecified; do not silently narrow support to Windows 11.

Students can keep editing while documents generate, with each generation using a fixed snapshot.

**Why:** The user selected “Keep editing during generation” after reviewing snapshot-based background generation.

**How to apply:** Capture the selected program content, source/output assets, template, and mappings consistently for the job after local save and validation. Later edits must not alter the running generation. Indicate when newer edits require regeneration; do not freeze editing for the duration of document jobs. This decision does not authorize application implementation.

Continue generating the remaining individual program documents if one unexpectedly fails.

**Why:** The user selected “Continue remaining programs” after reviewing batch-generation error behavior.

**How to apply:** Preserve successful completed files, identify failed programs and their errors in the result summary, and allow retrying failed items without regenerating successful ones. Required-field validation still happens before generation; this does not allow bypassing missing required content or silently omitting a selected program from a combined record.
