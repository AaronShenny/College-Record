# Reviewed third-party bundle

Before a signed release, create `third-party/` here and add the exact-version
third-party licence texts, notices, inventories and corresponding-source
materials required by `docs/THIRD-PARTY-NOTICES.md`.

The signed-release build refuses to proceed if this directory is missing.
Its contents are copied into the installed `runtime/legal/third-party/` and
included in the tagged source archive. Do not create an empty directory just
to bypass the review.

At minimum review the bundled Python distributions and their native libraries,
Node.js's full licence and third-party notices, bundled JavaScript/font packages,
Rust crates, PyInstaller's bootloader exception, and the WebView2 redistribution
terms. For AGPL/GPL components include the applicable corresponding source, not
just a package name or an unversioned homepage link.

Do not add student records, credentials, developer environment files or
diagnostic exports. This directory must be safe to publish.
