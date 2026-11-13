# Third-party licensing and release checklist

Recordly's original application is AGPL-3.0-or-later. This file is a review aid,
not a claim that all dependency obligations have been discharged.

| Component | Upstream licence / distribution requirement |
| --- | --- |
| PyMuPDF / MuPDF | AGPL or commercial dual licence. This free build uses the AGPL route. Supply corresponding source and notices for the exact distributed versions. |
| python-docx | MIT; retain notices. |
| docxcompose | MIT; retain notices. |
| Pillow | HPND and bundled third-party notices; retain applicable notices. |
| PyInstaller | GPL with bootloader exception; retain the exception and applicable notices. |
| pywin32 | Retain the distributed Python Software Foundation/other applicable notices. |
| Tauri and Rust dependencies | Retain the licences of the exact Cargo.lock-resolved dependencies (commonly MIT/Apache-2.0, but inspect the full graph). |
| Node.js | MIT plus its included third-party notices; distribute its licence with node.exe. Do not re-sign it with Recordly's certificate. |
| React / bundled JavaScript dependencies | Retain exact-version licence texts and notices, including transitive packages. |
| Fontsource fonts | Retain the font-specific SIL OFL or other licences. |
| WebView2 redistributable | Microsoft's redistribution terms apply. Treat as a system runtime, not Recordly-owned source; obtain SignPath confirmation of the bundled runtime's eligibility. |
| Microsoft Word | User-installed prerequisite; not redistributed. |

Before a production signing run, review the exact Python wheel, Node/pnpm and
Cargo dependency inventories, collect their licence texts and any required
corresponding source, and include them with the distribution. Do not infer
licences solely from package names or this summary. The build copies the legal
directory into runtime resources, but maintainers must supply the complete
third-party notice/source bundle after reviewing the resolved versions.

The release workflow requires the maintainer's `RECORDLY_LICENSE_REVIEWED=true`
confirmation. Leave it unset until that review and packaging work is complete.
Setting a flag is not a substitute for satisfying these obligations.

The logo and Recordly name are not a licence to impersonate the original
publisher. Third-party college names, user templates, uploads, records and
screenshots are not relicensed as application source.
