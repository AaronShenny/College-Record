---
name: Approved Drive storage design
description: User-approved storage proposal and its unresolved sync and retention boundaries.
---

Use a visible `College Record Maker` folder in each student's own Drive, preserving `semester-XX/subject-name`. Store structured metadata as JSON and code, images, templates, and generated documents as separate files; do not introduce a separate database.

**Why:** The user selected “Use this structure” after reviewing this complete proposal.

**How to apply:** Treat the following as the approved design for future implementation, not an existing implementation:

```text
College Record Maker/
  app.json
  semester-XX/
    subject-name/
      subject.json
      templates/template-<id>.docx
      imports/original-question-paper.pdf
      programs/program-<id>/
        program.json
        sources/
        images/
      generated/generation-<id>/
        generation.json
        <requested document outputs>
  _trash/
```

- App metadata holds format version, semester/subject IDs, and app-wide preferences, not duplicate authoritative program contents.
- Subject metadata holds active template, reusable mappings, field definitions, and whole-record values.
- Program metadata holds number, title/question, field values, source roles, ordered output items, and asset references. Output text is metadata; screenshots and source code remain separate actual files.
- Use permanent internal IDs independent of display names, program numbers, and paths.
- One-time imports copy sources into app-managed storage without modifying the original folder. Retain imported PDF/CSV originals for reference.
- Generated outputs are separate from editable content. Each generation records its included programs, template reference, creation time, and output references; only requested outputs need exist.
- Recoverable Trash retains original locations; sync needs deletion markers so stale offline copies cannot resurrect deleted items.
- Credentials never belong in synced metadata or Drive documents; use secure Windows credential storage.
- Keep account-separated local working files and a pending sync queue. Save locally first, distinguish local and Drive status, and upload referenced assets before metadata that publishes their references. Recover interrupted multi-file sync rather than assume Drive has group transactions.

Handle conflicts independently per program and separately for subject settings. Each winning program version includes its fields, source-file references, and ordered output items as a consistent unit; do not merge fields from competing versions. Edits to different programs can both survive synchronization. Generated Word versions remain separate additions.

**Why:** The user selected “Separate programs and subject settings” after reviewing this conflict-granularity proposal.

**How to apply:** Apply most-recently-saved-wins within each saved item, not to an entire subject because one program changed. Do not substitute most-recently-uploaded-wins.

Do not retain recoverable copies of overwritten conflict versions.

**Why:** The user explicitly selected “Do not keep conflict copies” after being told that overwritten edits would not be recoverable through that feature.

**How to apply:** Keep only the winning active program or subject-settings version through conflict resolution; do not add a conflict-copy archive. This does not change retained generated Word versions or recoverable deleted-item Trash. It does not authorize deleting existing data during architecture discussion.

Still unresolved: PDF and older-template retention, automatic Trash expiry, trusted save timestamps, equal-time handling, and deletion-versus-edit conflicts.

**Why:** These items were expressly left open in the accepted proposal; approving the structure did not resolve them.

**How to apply:** Discuss them separately. Storage-design approval does not authorize creating folders in Drive or beginning application development.
