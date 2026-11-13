# Recordly
## Software Requirements Specification

**Version:** 0.4 — Recordly saving and portable subject setup

**Target release:** First version of the Windows desktop application

**Requirements basis:** User-confirmed requirements and workflow discussions

**Approval status:** Reconciles approved implementation decisions; deferred release checks are not certified by this document

## 1. Purpose and document conventions

This document specifies a Windows desktop application that helps students prepare college programming records from their own source code, screenshots, output text, and Word templates. It consolidates the decisions made during requirements discussion. It is a review draft, not an implementation plan or a statement that the application has been built.

Sections 2–8 describe confirmed product scope and functional behavior. Requirement identifiers support review and later acceptance testing. Section 9 contains proposed quality targets that still need approval; confirmed account, storage, and security safeguards are requirements in Section 4. Section 10 distinguishes unanswered version-one decisions from topics explicitly deferred to version 2. Section 11 provides acceptance scenarios derived from confirmed scope, not evidence that tests have been run.

“Shall” describes required behavior within the stated status. “Proposed” and “Open” explicitly identify items that have not been agreed. The approved technology stack and logical Drive storage layout are stated requirements/design decisions; detailed physical schemas, deployment, and unresolved compatibility details are not finalized.

### 1.2 Revision 0.3 summary

This revision reconciles the approved Tauri host with the retained React interface, shared Node storage/Drive services, and lazy directory-packaged Python document engine on Windows 10/11 x64. It also records independently optional per-field font family/size overrides with template defaults and compact source export without modifying stored source files. Account separation, Drive JSON/files, sync-gated cleanup, version-one single-computer use, the supplied PDF extractor and saved immutable generation snapshots remain requirements. Automatic-update signing/hosting and formal release acceptance remain deferred.

### 1.3 Revision 0.4 decisions

- The product is **Recordly**, published by **extapano**, using the supplied geometric R logo. Settings shows the requested footer **An exptapano Product** and disclaimer **INDEPENDENTLY DEVELOPED AND OPERATED. NOT OFFICIALLY AFFLIATED WITH RAJAGIRI COLLEGE OF SOCIAL SCIENCE**. The footer spelling and disclaimer are reproduced as requested.
- Existing application identity, account ownership, credential binding, local cache discovery and legacy Drive-root markers remain compatible; renaming the display name does not authorize moving/deleting existing data. New Drive roots may use Recordly; existing College Record Maker roots remain valid.
- Explicit whole-workspace Local-versus-Drive conflict recovery is now approved and supersedes the previous version-two deferral. Each action requires review of its replacement scope and destructive confirmation, guards the reviewed revisions and remains separate from automatic merging or simultaneous multi-computer use.
- The program editor derives visible content fields from active template mappings and enabled index-column needs. Hidden fields retain their stored values; unmapped required custom definitions do not block generation.
- Students may enable a front-of-combined-record index table and choose its heading, columns, labels, order and mapped text, blank or manual per-program values. Rows represent the selected programs in numeric order. No guessed page numbers, dates or signatures are allowed; page-number columns are not offered in this implementation.
- Portable subject configuration contains reusable mappings, field/source-role definitions, typography and index layout. At export students choose whether to include the DOCX template. Student values, program/source/output content, credentials, owner identity and Drive references are excluded; included templates retain their existing document text and should be reviewed before sharing.
- Configuration import must work before/after subject creation and before/after template upload. Review precedes application; keeping/replacing an existing template is explicit, unmatched mappings wait for compatible template upload, all existing program/value content is preserved, and imported IDs are remapped. Template mappings must be reviewed before generation.
- Normal close and update restart require successful final Drive synchronization. Offline/network/conflict failures keep the app open with local work retained and Retry/return-to-editing actions. This cannot prevent forced termination, power loss or every Windows shutdown.

**Implementation status:** The owner confirmed successful installed Tauri launch, Google sign-in/existing Drive records, editing/saving/reopening, and DOCX/PDF generation/opening. This is not exhaustive acceptance evidence. Formal repeated hardware timings, remaining Windows recovery/installer/failure cases and signed automatic-update setup remain deferred; updates stay disabled until configured and verified.

### 1.1 Terms

| Term | Meaning |
| --- | --- |
| Student | A user signing in with an eligible college Google account. |
| Subject record | A subject’s template, mappings, program content, and generated records within a semester. |
| Program / experiment | A numbered unit containing subject-specific fields, source files, and supplied output. These terms refer to the same record unit here. |
| Variable | A marker in a Word template, such as `[NO]`; its literal name does not determine its mapping. |
| Field | A built-in or custom content value that can supply a template variable. |
| Source-file role | A reusable mapping target such as Main code or Helper code, assigned an actual file within each program. |
| Output item | Student-supplied screenshot/image or editable output text; not output generated by the app executing code. |
| App folder | The visible `Recordly` folder, or an existing compatible `College Record Maker` folder, in the signed-in student’s Drive containing application-managed persistent data. |
| Local cache | Locally saved working content and pending changes that support offline use; not a separate database. |
| Generated version | A retained Word-document output produced by a generation operation. |
| App workspace | The signed-in student’s application-managed Drive data and its local working copy; the exact local cleanup boundary remains subject to the confirmation noted in OPEN-03. |
| Generation snapshot | A consistent, locally saved and validated set of selected content and referenced assets captured for one document-generation job. |

## 2. Product scope

### 2.1 Objective and audience

The application serves students at the user’s college, rather than only its creator or a single class. Each student works with their own Google Drive. The app automates record assembly and formatting, not the creation or verification of academic answers.

### 2.2 Confirmed first-version capabilities

- Windows desktop application with eligible-college-account sign-in.
- Windows 10 and Windows 11 x64 support using Tauri, React, shared Node services and Python.
- Background download of the signed-in student’s app workspace, with account-separated local work and pending sync.
- Automatic checks and verified update downloads, with safe Restart now / Later behavior.
- Semester/subject organization backed by the student’s own Drive.
- One active `.docx` template per subject with reusable variable mappings.
- Built-in fields, custom text/image fields, and separate source-file-role mappings.
- Manual entry and reviewed import from CSV or selectable-text PDF.
- Optional, one-time source-file import from a Windows folder or Drive folder.
- Editable source code, explicit file replacement, and multi-file programs.
- Clipboard screenshot PASTE, image-file selection, and editable output text.
- Individual and combined Word documents, plus PDF export through installed Microsoft Word.
- Local-first autosave, Save Now, offline work on downloaded content, later Drive sync, and recoverable Trash.
- Explicit logout-and-delete-local-files action, gated on successful synchronization of pending uploads.
- Fixed-snapshot background document generation while students continue editing, with partial-failure handling for individual documents.

### 2.3 Explicitly outside first-version scope

- Code execution, compilation, interactive program input, Run/Stop controls, runtime detection or installation, execution timeouts, entry-point configuration, and automatic terminal capture.
- AI-generated code, answers, titles, descriptions, or output.
- OCR or extraction from scanned/image-only PDF pages.
- In-app rendered Word-document preview or a full Word editor.
- A full visual template designer or general rich-text/style editor. Optional per-field font family and size overrides are in scope.
- Template variables inside Word text boxes or shapes.
- Editable table-valued custom fields.
- Per-program templates within one subject and manual program reordering in combined records.
- Live watching, ongoing synchronization, or write-back to original imported source files.
- Combining multiple source files into one mapped code field.
- LibreOffice PDF-conversion fallback.
- Concurrent or offline editing of the same student’s records on multiple computers in version 1; automatic conflict merging.
- Actual Git storage/dependency, manual commits, branches, full revision history, device locking, or a conflict-copy archive.
- Central college storage, shared-template services, administrator/teacher portals, and personal Google-account access.
- Automatic reverse-mapping of edits made in generated Word documents into application fields.

Explicit whole-workspace Local-versus-Drive replacement is approved in revision 0.4. Automatic merging, conflict-copy history and concurrent editing remain excluded. Other exclusions do not commit any feature to a later release.

## 3. Users, environment, and external dependencies

### 3.1 Actor

The confirmed actor is the Student. No administrator, teacher, shared editor, or approval role has been requested.

### 3.2 Environment

- Target platform: Windows 10 and Windows 11 x64 desktop, using Tauri + React + shared Node services + Python. Minimum Windows builds and supported Word versions remain open; other processor architectures are outside the approved initial packaging scope.
- The app shall support personal and shared Windows computers. Only one computer may be active for a student at a time under the version-one workflow.
- Installed Windows desktop Microsoft Word is required for opening generated documents through the agreed inspection workflow and for PDF export. Supported Word versions remain open.
- When an owner-configured signed release feed is enabled, automatic updates shall check in the background and download verified updates. Installation shall coordinate the Tauri interface and bundled Node/Python helpers. Builds without this configuration shall explicitly report updates disabled.
- Google sign-in and Drive require an internet connection for first-time authentication and uncached content.
- Word is not a prerequisite for editing record data or generating ordinary `.docx` documents.
- No Python interpreter, Java JDK, or C compiler is required for student code, because the app will not execute it.
- Availability of college Google OAuth/Drive authorization and any institutional administrator approval must be validated before implementation. The creator’s current Drive connection does not establish authorization for every student.

### 3.3 Persistent storage boundary and approved logical layout

Drive is the authoritative persistent store for app records and configuration; it is not a separate database. Each student’s own Drive shall contain a visible app folder: `Recordly` for new setup, with existing `College Record Maker` roots preserved. Subject folders preserve `semester-XX/subject-name`. Structured metadata is JSON; templates, sources, screenshots, original imports, and generated assets are separate files. This is the approved logical layout, not a complete physical schema:

| Location | Contents and boundary |
| --- | --- |
| `<app-root>/app.json` | Format version, semester/subject IDs, and app-wide preferences; not duplicate authoritative program content. |
| `semester-XX/subject-name/subject.json` | Stable subject ID; active template reference; reusable mappings; field definitions; whole-record values. |
| `templates/template-<id>.docx` | Separate template files; older-template retention remains open. |
| `imports/` | Original PDF/CSV imports retained as separate reference files. |
| `programs/program-<id>/program.json` | Stable program ID; number, title/question, field values, source-role assignments, ordered output items, and asset references. |
| `programs/program-<id>/sources/` and `images/` | Source code and screenshots as separate app-managed assets. Output text remains metadata. Imports are copies; originals are not modified or linked for live updates. |
| `generated/generation-<id>/generation.json` | Stable generation ID, included programs, template reference, creation time, and output references. Requested generated outputs are separate files and remain distinct from editable content. |
| `_trash/` | Recoverable deleted items with original-location metadata. Deletion markers prevent stale offline copies from resurrecting deleted items. Retention/expiry remains open. |

Stable internal IDs shall not depend on display names, program numbers, or paths. Local working files and pending sync queues shall be separated by account. Saves are local-first; an asset shall be uploaded before metadata that publishes its reference. Interrupted multi-file synchronization shall be recoverable rather than assumed atomic. Credentials shall be protected in Windows credential storage, not stored in synced metadata or Drive documents.

## 4. Confirmed functional requirements

### Platform requirements

- **PLAT-01:** The first-version desktop application shall support Windows 10 and Windows 11. Minimum supported Windows builds and processor architectures remain open (OPEN-01).
- **PLAT-02:** Tauri shall own the local native window, restricted commands, secure credential adapter and child-process lifetime. React shall provide the interface; shared Node services shall retain local JSON/files and Drive orchestration; Python shall start lazily for requested document/extraction jobs as an installed directory, not a self-extracting single-file helper. Electron remains an isolated recovery/reference path, not a production Tauri dependency.

### 4.1 Identity and data ownership

- **AUTH-01:** The app shall authenticate students through their Google accounts and allow sign-in only when the verified account email domain is exactly `rajagiri.edu`.
- **AUTH-02:** Personal Google accounts, other domains, and unapproved subdomains shall not satisfy the access rule. A typed email address alone shall not establish eligibility.
- **AUTH-03:** The app shall use each signed-in student’s own Drive for that student’s persistent records; there shall be no central college database or shared record repository.
- **AUTH-04:** First-time Google sign-in shall require connectivity. Previously downloaded work shall support the offline behaviors in SAVE-03; offline session expiry policy remains open.
- **AUTH-05:** On sign-in, the app shall download the signed-in student’s app workspace in the background. Local working files and pending-sync queues shall be separated by account so another student using the same Windows computer cannot be shown the previous account’s workspace.
- **AUTH-06:** The app shall provide an explicit logout-and-delete-local-files action for the signed-in student’s app workspace. It shall complete pending uploads successfully before deleting local workspace files. If offline or synchronization fails, cleanup shall pause and retain local work; this action shall not offer a discard-unsynced-work bypass.
- **AUTH-07:** The download and cleanup boundary is the student’s app workspace and app-managed local copies only, as a stated working interpretation awaiting explicit confirmation (OPEN-03). It shall never authorize deleting unrelated local files, original imported files, or Drive originals.

### 4.2 Semester and subject organization

- **ORG-01:** The app shall organize subject records under its dedicated Drive folder using the hierarchy `semester-XX/subject-name`.
- **ORG-02:** Each subject record shall hold its template, mappings, field definitions and values, programs, source files, output content, configuration, and generated documents.
- **ORG-03:** Students shall be able to create subject records and programs, access their saved content, and move programs or subjects to recoverable Trash.
- **ORG-04:** Each subject record shall have one active template and one associated set of mappings reused across its programs.
- **ORG-05:** Programs shall be addressed by program number and displayed in numeric order. Import validation shall flag missing or duplicate numbers. Exact number syntax and limits remain open.
- **ORG-06:** Each student’s own Drive shall contain a visible app folder, named Recordly for new setup or discovered as a compatible existing College Record Maker root, with subject records organized under `semester-XX/subject-name`. Drive is authoritative persistent storage; no separate database is part of the approved design.
- **ORG-07:** The app shall store structured app, subject, program, and generation metadata as JSON, separately from template, source, screenshot, original PDF/CSV import, and generated-asset files, following the approved logical layout in Section 3.3.
- **ORG-08:** Stable internal app, subject, program, and generation identifiers shall be independent of display names, program numbers, and paths. App metadata shall contain format version, semester/subject IDs, and app-wide preferences, not duplicate authoritative program content.

The `XX` hierarchy token expresses the user’s requested semester naming pattern. Padding, allowed semester values, and duplicate subject-name handling are not yet fixed.

### 4.3 Template upload, variables, and field mapping

- **TPL-01:** Students shall be able to upload a Word `.docx` template for a subject record.
- **TPL-02:** The app shall detect bracketed variables in body paragraphs, tables, headers, and footers. Word text boxes and shapes are not supported variable locations.
- **TPL-03:** The mapping interface shall list each distinct variable once. Repeated occurrences of that variable shall receive the same mapped content.
- **TPL-04:** Students shall map variables explicitly to built-in fields, custom fields, source-file roles, or the selected output sequence. Variable names shall not force a particular mapping.
- **TPL-05:** Custom fields shall support text, including multiline text, and images. Students shall select whole-record or per-program value scope for each custom field.
- **TPL-06:** Whole-record values shall be entered once and reused across programs. Per-program values shall be independently editable for each program.
- **TPL-07:** Students shall be able to configure mapped fields as required or optional. Empty optional values shall produce blank content without automatically removing surrounding template layout.
- **TPL-08:** Subjects shall be able to use a title, a full question, or both according to their template mappings and required-field settings. Neither a universal merged field nor a requirement for both fields shall be imposed.
- **TPL-09:** Template definitions, mappings, and field configuration shall be saved with the subject record in the student’s app folder.
- **TPL-10:** Incomplete template setup shall be saveable. Generation shall be blocked until required mappings and relevant required values are supplied.
- **TPL-11:** Students shall be able to replace a subject’s active template after adding programs. The app shall require mapping review before subsequent generation and preserve existing program data and previously generated documents.
- **TPL-12:** All programs in a subject shall use that subject’s active template and mapping; no per-program template selector is required.
- **TPL-13:** Each source-file role shall map separately to a template variable. Actual source files assigned to that role may differ by program; the app shall not concatenate all selected source files into one code variable.

Example mappings are illustrative, not mandatory variable names: `[NO]` → program number; `[QN]` → question; `[MAIN_CODE]` → Main code role; `[HELPER_CODE]` → Helper code role; `[OUTPUT]` → selected output items; `[LOGO]` → whole-record custom image.

### 4.4 Formatting and images

- **FMT-01:** Template font family and size shall be inherited by default. Each mapped field may independently override font family, font size, both or neither. Compact source export shall normalize platform line endings, remove blank-only source lines and artificial paragraph spacing, and retain indentation and boundaries of nonempty source lines. Output text shall retain intentional blank lines while normalizing platform line endings. These export changes shall not modify stored source or output content.
- **FMT-02:** Image insertion shall support fitting to available width and fitting into a template-defined image area. The exact identification mechanism for a defined area remains open.
- **FMT-03:** Images shall retain their proportions without automatic stretching or cropping.
- **FMT-04:** A screenshot too tall for a page shall shrink to fit the available single-page area, or its smaller designated template area. It shall not be automatically split across pages.
- **FMT-05:** Word-template layout shall determine source-file placement. Source-file selection/order within a program shall not introduce manual reordering of programs in a combined record.

Shrinking tall screenshots can reduce readability. This is an accepted behavior, not a guarantee that all supplied screenshots remain legible. Each screenshot is fitted independently; all output items together are not required to fit on one page.

### 4.5 Manual entry and reviewed PDF/CSV import

- **IMP-01:** Students shall be able to create programs manually and enter the subject-relevant program details without uploading a PDF, CSV, or source folder.
- **IMP-02:** CSV import shall allow student-defined column-to-field mapping rather than demand fixed column names. CSV mapping shall be distinct from Word-variable mapping.
- **IMP-03:** PDF import shall extract program numbers and supplied title/question text from selectable-text PDFs only. It shall not perform OCR or invent shortened titles.
- **IMP-04:** PDFs without usable embedded text shall be identified as unsupported for this import path, with CSV or manual entry offered as alternatives.
- **IMP-05:** Before program creation, the app shall present extracted or mapped entries for student review. Students shall be able to edit text and numbers, join incorrectly split text, remove unwanted entries, and assign text to subject-specific fields.
- **IMP-06:** The import review shall flag missing and duplicate program numbers for correction. Entries whose program numbers already exist in the subject shall be skipped rather than overwrite existing content, and skipped entries shall be identified.
- **IMP-07:** Students shall explicitly confirm the selected valid entries before those entries become programs.
- **IMP-08:** Imported questions shall be saveable without code or output. Required-content checks shall apply later to document generation.
- **IMP-09:** Subject setup shall offer optional source-folder selection after question import; that step shall be skippable.
- **IMP-10:** Future selectable-text PDF extraction shall use the user-supplied `pdf_to_qns` script as its baseline and retain editable import review. It shall not add AI extraction or OCR.

Skip-duplicates applies to duplicate program imports, not to explicit editing, file replacement, or assigning a source file to an existing program.

### 4.6 Source-file import and program editing

- **CODE-01:** Students shall be able to import source files from a selected local Windows folder or a folder in their Drive, or paste code directly.
- **CODE-02:** The app shall suggest file-to-program assignments for student review. Students shall be able to assign or correct every file manually; suggestions shall not be silently treated as final assignments.
- **CODE-03:** Source imports shall create independent app-managed copies. Original files shall not be watched, automatically refreshed, or modified by subsequent app edits.
- **CODE-04:** Each program shall support multiple source files. Students shall select files for document inclusion and assign files to the separate roles required by the subject’s mappings.
- **CODE-05:** The program edit/preview window shall allow editing imported or pasted source code.
- **CODE-06:** A Replace File action shall let a student explicitly replace the app-managed copy within an existing program, with confirmation, without deleting that program or its unrelated content.
- **CODE-07:** Code edits and replacements shall affect the application-managed saved content, not the original imported file.
- **CODE-08:** The program window shall display subject-relevant per-program fields and inherited whole-record values and support Previous Program / Next Program navigation.
- **CODE-09:** When source code changes, the app shall preserve existing output and warn that it may be outdated. This warning shall not block generation or require a separate output-review confirmation.
- **CODE-10:** The app shall not execute or compile student code, verify its correctness, or automatically establish that output matches source code.

Filename identification and source-file selection remain part of editing. Exact placement in a generated record follows the separate file-role mappings and the template, not a combined code block.

### 4.7 Student-supplied output

- **OUT-01:** Every program edit/preview window shall provide a visibly labeled PASTE action for inserting a screenshot/image from the clipboard.
- **OUT-02:** The window shall also provide image-file selection and an Add Text path for entering or pasting editable output text.
- **OUT-03:** A program shall support multiple supplied output items, including screenshots and text. Adding an item shall not implicitly replace earlier items.
- **OUT-04:** Students shall be able to preview images, edit output text, remove items, choose which items appear in the document, and arrange their sequence.
- **OUT-05:** One mapped output variable, such as `[OUTPUT]`, shall insert selected output items sequentially in student-chosen order. Separate output slots are not required.
- **OUT-06:** Content/image preview in the program window shall not constitute a rendered Word-document preview. Students shall inspect document layout by opening the generated document in Word.
- **OUT-07:** Supplied output and associated configuration shall be persisted in the student’s app-managed storage and made available offline when downloaded.

### 4.8 Validation and document generation

- **DOC-01:** The app shall generate an individual `.docx` for a program and a combined subject `.docx`.
- **DOC-02:** Generation shall support one program, a selected group, or the entire subject record.
- **DOC-03:** Combined records shall place included programs in numeric program-number order, with each program starting on a new page. Long programs may occupy multiple pages.
- **DOC-04:** Before generation, the app shall validate required mappings and content for included programs and applicable whole-record fields. It shall identify missing items and affected programs and block generation until they are supplied.
- **DOC-05:** Incomplete programs outside the selected generation set shall not prevent generation of otherwise complete selected programs.
- **DOC-06:** Empty optional fields shall not block generation. The outdated-output warning in CODE-09 shall also remain non-blocking.
- **DOC-07:** Regenerating Word output shall create a new generated version and retain the previous document rather than silently replace it.
- **DOC-08:** The app shall provide a workflow to open generated Word documents in installed desktop Microsoft Word for inspection; it shall not provide an embedded rendered document preview.
- **DOC-09:** PDF export shall use installed Windows desktop Microsoft Word. There shall be no LibreOffice conversion fallback.
- **DOC-10:** If Word is unavailable, the app shall explain that PDF export and the open-in-Word inspection path are unavailable, while allowing record-data editing and ordinary `.docx` generation.
- **DOC-11:** Edits made directly in a generated Word document shall not automatically update the app’s source code, questions, or mapped field values. Regeneration shall use content saved in the app.
- **DOC-12:** Generated documents shall be stored within the student’s app-managed Drive data; generated offline documents shall be eligible for later synchronization.
- **DOC-13:** A background generation job shall use one consistent snapshot of locally saved and validated selected content, source/output assets, active template, and mappings. Students may continue editing; later edits shall not change the running job. The interface shall indicate when newer edits require regeneration.
- **DOC-14:** If an individual document unexpectedly fails during a multi-program individual-generation batch, the app shall continue remaining individual documents, preserve successes, summarize failed items, and allow retrying only failed items.
- **DOC-15:** Combined-record generation shall validate all required content for every included program before starting and shall not silently omit a selected program whose document-generation work fails. The failure/cancellation behavior for a combined output remains open (OPEN-15).

The PDF selection scope, output naming, and retention of successive PDF exports remain open. Word-version preservation does not settle these details.

### 4.9 Saving, offline work, synchronization, and recovery

- **SAVE-01:** The app shall autosave locally and provide Save Now, which completes local saving and then attempts Drive synchronization, including already-saved pending documents/imports. Incomplete program content and incomplete template setup shall be saveable; invalid uncommittable draft fields must be corrected.
- **SAVE-02:** It shall distinguish locally saved, syncing, and successfully saved-to-Drive states rather than claim Drive persistence before upload completion.
- **SAVE-03:** Previously downloaded content shall remain editable offline. Document generation shall be available when all required content/resources are local; PDF export shall still require local Word.
- **SAVE-04:** Uncached Drive content and first-time sign-in shall require connectivity. The app shall not imply that unavailable content is cached.
- **SAVE-05:** Offline changes and generated files shall be retained locally for synchronization after reconnection. Drive shall remain authoritative persistent storage; local working files shall not become a separate database.
- **SAVE-06:** Local saves shall be committed before Drive synchronization. The app shall distinguish locally saved, syncing, and successfully saved-to-Drive states and shall not claim Drive persistence before upload completion.
- **SAVE-07:** Sync queues and working files shall be account-separated. Referenced assets shall be uploaded before metadata that publishes their references, and interrupted multi-file synchronization shall be recoverable.
- **SAVE-08:** Credentials shall be protected in Windows storage and shall not be placed in synced documents or metadata.
- **SAVE-09:** Version 1 shall support one active computer per student. To switch computers, the student shall complete synchronization and close the app on the first computer before using the second. Concurrent or offline multi-computer editing is unsupported; this usage boundary is not a device lock or a guarantee that conflicts are impossible.
- **SAVE-10:** On detected conflicts the app shall offer confirmed whole-workspace Use Local (replace Drive) or Use Drive (replace Local), show available save times and subject counts, explain losing-side data loss, and guard reviewed revisions/inventories. No automatic merging or concurrent-edit guarantee is implied.
- **SAVE-11:** App-data conflict handling shall remain conceptually distinct from generated Word-version retention, duplicate-import skipping, explicit source-file replacement, and recoverable deleted-item Trash.
- **SAVE-12:** Deleted programs and subjects shall move to a recoverable `_trash` area with original-location metadata and disappear from active records. Students shall be able to restore them. Deletion markers shall prevent stale offline copies from resurrecting deleted items.
- **SAVE-13:** Permanent removal shall require separate confirmation. No automatic Trash expiry period is approved in this draft.
- **SAVE-14:** An account-bound background coordinator shall attempt synchronization every three minutes, coalescing timer/manual/close requests instead of overlapping them. It shall operate independently of the visible page, preserve offline changes and avoid downloading unchanged full records.
- **SAVE-15:** Normal close shall finish valid local saves and active document/import publications, then require a clean Drive acknowledgment before exit. Offline, conflict, invalid draft or sync failure shall leave Recordly open with local work retained and actionable Retry/return-to-editing choices. A pristine signed-out app may close without a Drive account.
- **SAVE-16:** A failure before the native service/workspace opens shall not trap the window because no renderer close listener mounted. A native pre-workspace path may close after bootstrap requests drain, with no dirty edits and no service started, preserving all pre-existing cache files. Once a service exists, this shortcut is unavailable; the ordinary saved-and-synced close requirement remains.

### 4.10 Automatic updates

- **UPD-01:** When the signed release feed is configured and verified, version 1 shall check for updates in the background and automatically download verified updates. Until then, builds shall report updates disabled rather than implying a functioning update service.
- **UPD-02:** When an update is ready, the app shall offer Restart now or Later. Updating shall coordinate the Tauri/React interface and bundled Node/Python helpers as one compatible release.
- **UPD-03:** The app shall not restart during editing, extraction, or document generation. Before restarting, it shall finish local saving and successfully synchronize pending Drive changes. Failures shall preserve work and block restart.
- **UPD-04:** Choosing Later or encountering an update-service failure shall not interrupt normal or offline work.
- **UPD-05:** Update hosting, signing arrangements, and recovery from a failed installation remain open decisions (OPEN-01).

## 5. Confirmed end-to-end workflows

### WF-01: Set up a subject and its template

1. Open or create the semester and subject record.
2. Upload the subject’s Word template.
3. Review distinct detected variables; map them to built-in/custom fields, source-file roles, or the output sequence.
4. Configure custom field types and scopes, required/optional status, and applicable image fitting.
5. Save the setup; incomplete configuration may be saved but is not generation-ready.
6. Optionally import numbers and supplied titles/questions from PDF or mapped CSV, using WF-02.
7. Optionally select a local/Drive source folder and review suggested or manual file assignments.
8. After entering required content, generate a completed program and inspect it in Word.

### WF-02: Review PDF/CSV imports

1. Select a CSV or selectable-text PDF.
2. Map CSV columns or extract embedded PDF text.
3. Review editable program entries; correct numbering/text, join split text, remove unwanted entries, and assign subject-relevant fields.
4. Correct invalid/duplicate numbers within the import; identify entries skipped because they already exist.
5. Confirm selected valid entries for creation.
6. Add code and output now or later. Source-folder selection remains optional.

### WF-03: Edit a program

1. Select a program from the subject’s numerically ordered list or add one manually.
2. Edit its subject-specific details; use inherited whole-record values where applicable.
3. Paste, attach, edit, or replace source files and assign them to template roles.
4. Use PASTE, Add Image, and Add Text to build the output sequence; preview, edit, remove, order, and select items.
5. Observe any non-blocking outdated-output warning after code changes.
6. Autosave or select Save Now; distinguish local save from Drive synchronization.
7. Move to the previous/next program or generate output.

### WF-04: Generate and inspect records

1. Choose one, selected, or all programs and the requested supported document output.
2. Validate required content for included programs only.
3. Capture the locally saved and validated selected content, referenced source/output assets, template, and mappings as a consistent generation snapshot.
4. Generate individual outputs in numeric order where applicable, or a combined record with each included program starting on a new page. Preserve successes and offer failed individual items for retry.
5. Retain a new Word version; queue upload if offline. Later edits do not alter this job; indicate if regeneration is needed.
6. Open the generated document in Word for inspection or use Word-backed PDF export.

### WF-05: Work offline, switch computers, and recover deleted content

Use downloaded subjects and resources offline and save locally for later synchronization. Version 1 supports one active computer per student: finish synchronization and close the app on the first computer before switching. Concurrent/offline multi-computer editing is unsupported. If a conflict occurs, review and explicitly confirm which whole workspace to keep; no automatic merging is implied. Move unwanted programs/subjects to recoverable app Trash; restore them or separately confirm permanent deletion.

### WF-06: Sign in and remove a local workspace

On personal or shared Windows computers, sign-in triggers a background download of the signed-in student’s app workspace into account-separated local working files. To log out and delete the local workspace, the student explicitly requests cleanup. Pending uploads must complete successfully first. If the computer is offline or sync fails, cleanup pauses and all local work remains. The working interpretation of the workspace-only deletion boundary awaits explicit confirmation (OPEN-03) and never extends to unrelated computer files or original imports/Drive files.

### WF-07: Apply an automatic update

Once the signed feed is configured and verified, the app checks in the background and automatically downloads a verified update. It offers Restart now or Later and coordinates the Tauri/React interface and bundled Node/Python helpers. It does not restart during editing, extraction, or generation. Before restarting, it finishes local saves and requires successful Drive sync. Later and update-service failures leave normal and offline work available. Without this configuration, updates remain explicitly disabled.

### WF-08: Generate while editing

After selected content is locally saved and validated, capture a consistent snapshot including required assets, template, and mappings. Run generation in the background while the student continues editing. Edits made after capture do not change the running job; identify when newer edits require regeneration. For individual-document batches, preserve successful documents, continue after an individual failure, summarize failures, and allow retrying failed items alone. A selected program shall not be silently omitted from a combined record.

## 6. Logical information model

This model records the approved logical JSON/file layout described in Section 3.3. It does not prescribe a complete physical schema or represent an implemented Drive service.

| Entity | Required information / relationships |
| --- | --- |
| Account context | Verified eligible Google identity, account-owned app data, and separate local workspace/queue. Credentials are held in protected Windows storage, not synced metadata. |
| App metadata | Format version, stable semester/subject IDs, and app-wide preferences; not duplicate authoritative program content. |
| Semester | Stable semester ID and subject records, following `semester-XX/subject-name`. |
| Subject record | Stable subject ID, active template, reusable mappings, field definitions, whole-record values, programs, generated references, and save/sync state. |
| Template | Uploaded `.docx`, detected variables, and supported image-area references; exact area representation is open. |
| Field definition | Built-in/custom target, text/image type where applicable, scope, and required/optional configuration. |
| Mapping | Template variable linked to a field, source-file role, or output sequence. |
| Program | Stable program ID, number, applicable title/question, per-program values, source-role assignments, ordered output items, and asset references. |
| Source file / image | App-managed actual file, filename, and role/inclusion references; original import location creates no live link. Output text is metadata, while screenshots and source code are files. |
| Generated document | Stable generation ID; included programs, template reference, creation time, output references, and retained generated files. Generated assets are separate from editable content. |
| Pending sync | Account-separated, locally saved changes awaiting upload, with enough state to recover interrupted multi-file synchronization. |
| Trash item / deletion marker | Deleted item, original location for restoration, and marker preventing stale offline copies from resurrecting it; retention policy remains open. |
| Generation snapshot | Fixed references/values for selected validated content, source/output assets, template, and mappings used by one running job. |

## 7. Interface boundaries

### 7.1 Desktop application surfaces

The functional surfaces are: sign-in/access status; background workspace-download and account status; semester and subject navigation; template/field mapping with optional typography; PDF/CSV import review; optional source-folder assignment; program editing/content preview; document generation/open-in-Word; save/sync status; recoverable Trash; logout-and-delete-local-files; and updater status with Restart now / Later. These describe required capabilities, not approved visual layouts. The approved desktop stack is Tauri + React + shared Node services + Python.

### 7.2 Google identity and Drive

Authentication shall establish verified account eligibility. Drive integration shall access the student’s own app data in the discovered Recordly/legacy root and user-selected import content. OAuth permissions, folder selection behavior, consent screens, institution approval, and deployment of any supporting authentication components require technical design. No requirement grants broad write access to original import folders. The background download and logout cleanup apply only to account-separated app-workspace data under the working interpretation in AUTH-07; they do not authorize deleting source originals or other local/Drive files.

### 7.3 Clipboard and local files

The PASTE action accepts clipboard image content. Source and screenshot file selection are user-directed operations. Supported image encodings, clipboard variants, maximum sizes, text encodings, and source-file extension handling remain open compatibility details.

### 7.4 Microsoft Word

The integration opens generated documents and converts supported record outputs to PDF through installed Windows desktop Word. Word licensing, installation, automation compatibility, busy-document behavior, and conversion failures must be considered before committing to supported environments.

### 7.5 Update service

The native updater, once configured and release-verified, checks and downloads signed updates in the background and coordinates the Tauri/React interface with bundled Node/Python helpers. It must verify the Tauri signature and approved Windows publisher before permission-based installation. Release hosting/signing and failed-install acceptance remain deferred. An unsigned installer is not an operating update service or release approval.

## 8. Important business-rule distinctions

- Required-content completeness and code/output correctness are different: only missing required content blocks generation; the app does not verify correctness.
- Numeric order applies to programs. Students may arrange output items within a program, and file placement follows template mappings.
- Import skipping protects existing program entries. It does not remove the approved ability to edit code or explicitly replace a source file.
- Drive is authoritative persistent storage, but saves are local-first. Referenced assets precede metadata publication; local working files and pending queues are account-separated.
- Workspace download and cleanup refer only to the app-managed workspace under the explicitly identified working interpretation; they never permit deletion of unrelated files or originals.
- Version 1 assumes one active computer per student. Switching requires sync completion and closing the first app; explicit reviewed Local-versus-Drive replacement is available for recovery, not simultaneous editing.
- Generated Word versions and recoverable deleted-item Trash are distinct from conflict replacement. Neither establishes a conflict-copy archive.
- Background generation uses a fixed snapshot. Editing may continue, but later edits do not mutate the job.
- Individual document failures do not stop the remaining individual batch; selected combined-record programs are not silently omitted.
- An update restart must not interrupt active editing, extraction, or generation; queued uploads must be preserved, but sync completion is not required.
- A subject has one active template, but replacing that template does not rewrite earlier generated documents.
- Content preview is allowed in the program window. Rendered document inspection remains external in Word.
- Importing PDF text is not OCR or AI content generation.
- Offline support applies to available local resources; it does not make first-time authentication or uncached Drive access work without internet. If cleanup requires a pending upload, offline status pauses cleanup and retains local work.

## 9. Proposed quality requirements — not yet approved

The safeguards for account separation, credential handling, local-first durability, asset ordering, and interrupted sync recovery are confirmed requirements in Section 4, not proposals. The recommendations below remain unapproved targets and require review before becoming release acceptance obligations.

- **NFR-P01 — File safety:** Validate file types/sizes, avoid executing imported source or active document content, and define handling of protected, malformed, or unsupported documents.
- **NFR-P02 — Responsive interaction:** Keep imports, synchronization, and document processing from freezing the editing interface. Measurable time limits depend on approved dataset and device baselines.
- **NFR-P03 — Accessibility:** Support keyboard operation, readable control labels, visible focus, and status information that does not rely only on color.
- **NFR-P04 — Diagnostics:** Provide useful error messages while excluding source content, screenshots, credentials, and personal data from diagnostic logging unless separately authorized.
- **NFR-P05 — Rendering validation:** Validate supported templates against representative Word outputs, including split Word text runs, tables, headers/footers, image placement, and combined-record layout.
- **NFR-P06 — Update assurance:** Define measurable release-verification, installation-recovery, and supported-environment targets after the open hosting/signing/recovery decisions are made.

No specific encryption certification, regulatory compliance, performance benchmark, availability guarantee, or sandboxing claim is made by this draft.

## 10. Open decisions and risks

| ID | Unresolved point | Why it matters |
| --- | --- | --- |
| OPEN-01 | Minimum Windows 10/11 builds and Word versions; update hosting, signing, and failed-install recovery. | Defines remaining compatibility and release operations. The approved stack is Tauri + React + shared Node services + Python, initially Windows x64. |
| OPEN-02 | Google OAuth client arrangement, scopes, college administrator approval, and consent requirements. | Eligible domain membership does not guarantee that college policy permits the integration. |
| OPEN-03 | Offline session validity, remaining account-switching details, and explicit confirmation of the stated app-workspace-only download/cleanup boundary. | The agreed cleanup is sync-gated and must preserve work; the working interpretation is not permission to delete unrelated local files, original imports, or Drive originals. |
| OPEN-04 | Exact built-in field catalog, program-number syntax/ranges, semester padding, naming conflicts, and rename behavior. | Makes organization, validation, and imports deterministic. |
| OPEN-05 | Placeholder grammar/case sensitivity, unsupported-location warnings, and how missing optional mappings are resolved. | Detection and validation need precise rules. |
| OPEN-06 | How students designate an image area in Word: table cell, replacement image, or another agreed marker. | Both image-fitting modes are approved, but the mechanism is not. |
| OPEN-07 | Supported template structures: nested tables, header/footer variants, section breaks, numbering, and mixed-layout combination. | Template defaults and optional field typography do not guarantee every Word construct works without a defined compatibility boundary. |
| OPEN-08 | Import encodings, selected PDF pages, complex PDF layouts, supported image types, clipboard formats, and size/count limits. | Bounds input compatibility and resource usage without promising OCR. |
| OPEN-09 | How source filenames are identified in generated content; partial-source updates/import-role collisions. | Separate file mappings must remain compatible with template defaults, independent font family/size overrides and the approved compact-source export, without modifying stored source content. |
| OPEN-10 | Autosave timing, Save Now offline semantics, sync scheduling, cancellation, and progress/error behavior. | Defines when data is locally durable versus stored in Drive; confirmed local-first and recovery safeguards still apply. |
| OPEN-11 | Detailed file compatibility: import encodings, selected PDF pages, complex layouts, image/clipboard formats, and size/count limits. | These bounds affect supported content without changing the confirmed selectable-text-only PDF scope. |
| OPEN-12 | Trash retention, generated-version retention, restoration naming conflicts, and treatment of related generated files when a program is deleted. | Recovery scope and storage usage are not yet fixed. |
| OPEN-13 | Version filenames, retained PDF export versions, PDF scope for individual/combined outputs, and local export destinations. | The three output capabilities are agreed; their detailed controls are not. |
| OPEN-14 | Whether/how Word-only edits to generated documents are uploaded back to Drive, without reverse-mapping into fields. | Opening a generated local copy in Word does not define subsequent file synchronization. |
| OPEN-15 | Combined-output failure/cancellation behavior and PDF-specific failure/cancellation rules. | Individual-document continuation, success preservation, and failed-item retry are confirmed; combined/PDF details are not. |
| OPEN-16 | Approved non-functional targets, test datasets, performance targets, and release acceptance environment. | Proposed quality targets and metrics must not be mistaken for confirmed requirements. |

The earlier Git-like direction remains future context for automatic merging or finer per-program/settings resolution. Revision 0.4 approves explicit reviewed whole-workspace Local-versus-Drive replacement only. It does not approve Git storage, a device lock, full history, manual commits or a conflict-copy archive. Generated versions and deleted-item Trash remain separate.

Principal accepted tradeoffs are reduced readability when tall images shrink; one-active-computer use with no concurrent/offline multi-computer editing; reliance on Microsoft Word for PDF export; and dependence on students to supply truthful, matching code and output. No competing-edit winner is defined for version 1.

## 11. Draft acceptance scenarios

The following scenarios are derived from confirmed requirements. They are intended for later implementation acceptance; they have not been executed. Open details must be resolved before claiming final acceptance.

| ID | Scenario and expected result | Requirements |
| --- | --- | --- |
| AC-01 | A verified `rajagiri.edu` Google account is eligible; a personal account or unapproved domain is rejected. | AUTH-01–03 |
| AC-02 | Two students have separate app data in their own Drives and local workspaces; each workspace follows the agreed semester/subject hierarchy. | AUTH-03, AUTH-05, ORG-01–04 |
| AC-03 | Repeated variables in body text, a table, header, and footer map once and receive consistent content; unsupported text-box variables are outside the supported set. | TPL-02–04 |
| AC-04 | A subject uses both whole-record and per-program custom text/image values; a different subject uses only the title/question fields its template needs. | TPL-05–09 |
| AC-05 | Incomplete setup saves successfully but generation identifies required missing items; optional empty content remains blank. | TPL-07, TPL-10, DOC-04–06 |
| AC-06 | Template replacement preserves program content and existing generated files and requires mapping review before new generation. | TPL-11–12 |
| AC-07 | CSV column mapping and selectable-text PDF extraction both lead to editable review; students correct split text, omit entries, and confirm valid rows. | IMP-02–07 |
| AC-08 | A scanned PDF is not processed with OCR; existing program numbers are skipped and identified without altering saved content. | IMP-03–06 |
| AC-09 | Programs can be created without code/output or a source folder; local and Drive source-folder imports allow reviewed and manual assignments. | IMP-08–09, CODE-01–02 |
| AC-10 | Imported files remain independent: editing or explicitly replacing an app copy leaves the original untouched and preserves other program content. | CODE-03–07 |
| AC-11 | Two source files fill separate mapped roles; no combined-code field is inserted. Previous/Next navigates between programs. | TPL-13, CODE-04, CODE-08 |
| AC-12 | Clipboard PASTE, file-based image input, and editable output text create multiple items that can be previewed, selected, removed, and ordered. | OUT-01–04 |
| AC-13 | One output variable inserts mixed selected items sequentially; source edits preserve these items and display a warning without blocking an otherwise complete record. | OUT-05, CODE-09–10 |
| AC-14 | Image fitting preserves proportions; a tall image shrinks within the available single-page/template area without cropping or automatic splitting. | FMT-01–04 |
| AC-15 | Selecting complete Programs 2 and 10 while Program 3 is incomplete produces numeric order 2, 10, each beginning on a new page; Program 3 does not block the selection. | DOC-02–06 |
| AC-16 | Regeneration retains the prior Word document; opening generated output uses desktop Word rather than an embedded document renderer. | DOC-07–08 |
| AC-17 | Word-backed PDF export works in the agreed installed-Word environment; without Word, the limitation is explained while editing and `.docx` generation remain available. | DOC-09–10 |
| AC-18 | Offline edits save locally with accurate status and later reach Drive. Competing multi-computer edits are not claimed as supported or assigned a version-one winner. | SAVE-01–08, SAVE-10–11 |
| AC-19 | Deleted programs/subjects disappear from active views, can be restored from app Trash with original-location information, and cannot be permanently removed without separate confirmation. | SAVE-12–13 |
| AC-20 | No student-code execution, AI answer generation, OCR, source-folder watching, or automatic reverse-mapping of Word edits is presented as a first-version feature. | Section 2.3, CODE-10, DOC-11 |
| AC-21 | On a shared Windows computer, signing in as a second student downloads that student’s workspace in the background and does not expose the first student’s local workspace or pending queue. | AUTH-05, SAVE-07 |
| AC-22 | Logout-and-delete-local-files waits for all pending uploads to succeed; if offline or an upload fails, cleanup pauses and retains local work without a discard-unsynced bypass. Unrelated local files and all originals remain untouched. | AUTH-06–07 |
| AC-23 | Sync publishes referenced assets before metadata; an interrupted multi-file sync can recover, and credentials are not found in Drive documents or synced metadata. | SAVE-07–08 |
| AC-24 | A verified update downloads in the background; Later or update-service failure leaves normal/offline work usable. Restart waits until editing, extraction, and generation are inactive, saves locally, and requires successful Drive sync. | UPD-01–05 |
| AC-25 | A student switches computers only after synchronization completes and the first computer’s app is closed; simultaneous or offline multi-computer editing is not represented as supported. | SAVE-09–10 |
| AC-26 | A generation job uses the validated local snapshot and its assets/template/mappings. Edits made while it runs do not alter its output, and the interface indicates that newer content requires regeneration. | DOC-04–06, DOC-13 |
| AC-27 | In an individual-document batch, an unexpected failure for one program does not stop remaining programs; completed files are retained, failures are summarized, and retry targets only failed items. | DOC-14 |
| AC-28 | Before a combined record starts, all included required content is validated; an included program is not silently omitted following a generation failure. | DOC-04, DOC-15 |
| AC-29 | Selectable-text PDF extraction uses the supplied `pdf_to_qns` baseline and presents editable review; scanned PDFs receive no OCR or AI extraction. | IMP-03–05, IMP-10 |
| AC-30 | The Drive app folder uses the approved JSON-plus-separate-files layout, stable IDs, generation metadata, recoverable `_trash` with original locations, and deletion markers. Drive remains authoritative; no separate database is introduced. | ORG-06–08, SAVE-07, SAVE-12 |
| AC-31 | The first-version desktop application uses Windows 10/11 x64 and Tauri + React + shared Node services + lazy directory-packaged Python; failed native bridges never fall back to browser storage. | PLAT-01–02 |

## 12. Review and approval

This draft should be reviewed for missing features, incorrect interpretations, and open decisions. Approval of an SRS draft does not by itself authorize application development; the user will explicitly decide when implementation begins.

Suggested next review order: installed Windows recovery/laptop handoff acceptance; OAuth/account lifecycle and the app-workspace-only cleanup interpretation; template/image-area compatibility; retention and export details; then measured quality requirements. Automatic merging and finer conflict granularity remain outside the explicit whole-workspace replacement scope.

The current source of truth is the confirmed scope in this document together with later explicit user corrections. Superseded discussions about executing Python/Java/C code or keeping imported code read-only are not first-version requirements.
