# Daily workflow and interaction counts

The redesign separates everyday code/output editing from subject setup.
Existing records and document engines are unchanged.

## Shortest normal paths

Counts below exclude typing, choosing a file in the operating-system picker,
scrolling, and deliberately changing output options. They count explicit UI
activations; a workflow being easier to find is not counted as a click reduction.

| Task and starting point | Before | After |
| --- | --- | --- |
| Open a particular program from home | Subject, program: 2 | Subject, program: 2; Continue opens the most recently edited program in 1 |
| Switch to the next program in the editor | 1 | 1 |
| Paste a screenshot in the editor | 1, in the output section | 1, also available in the sticky editing toolbar |
| Generate the current program from the editor | Documents, choose subject if needed, check program, start: 3–4 | Generate, start: 2 |
| Generate all programs from the subject list | Generate records, select all, start: 3 | Generate all, start: 2 |
| Generate an existing checked list selection | No subject-list selection; select again on Documents | Generate selected, start: 2, excluding the earlier checkbox selections |
| Edit the question | Directly visible | Open Question & fields, then edit; missing-question shortcut opens and focuses it |

## Navigation

- Subjects is the home destination, with search and semester filtering.
- A subject keeps template mapping, import, saved versions and subject editing
  together, separately from the program list's main actions.
- The editor keeps program navigation, title/number, Paste screenshot,
  Generate and Next close to daily work.
- Question and custom/inherited fields are in a named expandable section.
  Missing required fields have direct shortcuts.
- Generate opens with the current subject and program selection supplied.
  Change allows selecting different programs; the dialog does not start a job
  until the user explicitly presses Generate.
- Documents remains available for generation and saved-version history.
- Settings and Trash remain named destinations.

## Data safeguards

- Save Now and autosave remain available; local save and Drive status remain
  distinct even though they share a compact status area.
- Invalid local draft fields block page/program navigation and generation
  instead of disappearing when an editor unmounts.
- Generation still takes an immutable snapshot and can run while editing.
- Missing required content, unreviewed mappings and processing failures are
  not bypassed by the new shortcuts.
- Native account isolation, safe cleanup, Windows clipboard and Microsoft Word
  conversion are unchanged. Browser verification is not Windows verification.

## Release verification

Check at 1366×768 and 1440×900: subject discovery, editor primary actions,
generation dialog, keyboard focus, no horizontal document scrolling, draft
preservation across navigation, actual generated files, and saved versions after
reload. On Windows also verify native screenshot paste, Google reconnect,
offline/Drive status and Microsoft Word PDF conversion.
