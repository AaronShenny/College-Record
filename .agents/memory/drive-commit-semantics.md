---
name: Drive commit semantics
description: Why Drive commits and local workspace save revisions must remain separate
---
Every published Drive index is a distinct commit, even when only generated documents or archived imports changed. Publish immutable referenced files before the root index, and acknowledge locally only afterward.

**Why:** Generation runs independently of editing. Reusing the workspace save revision for an extras-only upload makes another cache miss the new documents. Updating referenced files in place before the index can expose a mixed or incomplete record after interrupted sync.

**How to apply:** Keep remote commit identity separate from the local save revision used by pending indicators. Preserve the owning local snapshot identity for recovery if the remote commit succeeded but its local acknowledgement was interrupted. Do not rewrite an unchanged local workspace solely because a remote commit brought generated files; that needlessly invalidates clean editor state.
