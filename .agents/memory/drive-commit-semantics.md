---
name: Drive commit semantics
description: Why Drive commits and local workspace save revisions must remain separate
---
Every published Drive index is a distinct commit, even when only generated documents or archived imports changed. Publish immutable referenced files before the root index, and acknowledge locally only afterward.

**Why:** Generation runs independently of editing. Reusing the workspace save revision for an extras-only upload makes another cache miss the new documents. Updating referenced files in place before the index can expose a mixed or incomplete record after interrupted sync.

**How to apply:** Keep remote commit identity separate from the local save revision used by pending indicators. Preserve the owning local snapshot identity for recovery if the remote commit succeeded but its local acknowledgement was interrupted. Do not rewrite an unchanged local workspace solely because a remote commit brought generated files; that needlessly invalidates clean editor state.

Incoming activation must guard the **original** local revision and related-file inventory captured before downloading. Never adopt a newer local pointer as permission to overwrite. Record metadata, generated/import inventories and acknowledgment must recover together; filesystem snapshots alone are not a complete transaction.

**Why:** A local edit can arrive after the editable graph downloads but before generated files finish. Directly writing those extras also makes a failed transfer appear to be genuine unsynced work on retry.

**How to apply:** Stage and validate the full incoming inventory, serialize its final guard/activation with local saves and document/import publication, and retain recoverable rollback information until all live metadata and acknowledgment are committed. Treat uncertain old partials as protected work, not permission to delete.
