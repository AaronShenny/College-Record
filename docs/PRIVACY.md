# Recordly privacy

Recordly is independently developed and operated by extapano; it is not an
official college application.

- Students provide content, source code, screenshots and document templates.
  The desktop app caches these and generated documents in the student's local
  account workspace, and synchronizes them to the student's own Google Drive
  when they connect their account.
- Google sign-in uses the system browser. Desktop credentials are protected by
  Windows account-bound encryption. Google handles authentication; Recordly
  does not ask for the student's Google password.
- Automatic synchronization occurs after sign-in and periodically while using
  a connected account. Save Now saves locally and synchronizes to Drive.
  Closing/updating waits for the required save/sync safeguards. Offline work
  stays local until synchronization can complete.
- Update-enabled builds contact the configured GitHub release endpoint and
  download available updates. GitHub receives ordinary connection information
  such as an IP address and HTTP request metadata. Recordly's update flow does
  not upload student records or diagnostic logs.
- Word is invoked locally for preview/PDF export. Word's own settings and
  Microsoft's privacy terms apply to Word.
- Diagnostic files stay local unless the user chooses to export and share them.
  Review diagnostic exports before sharing: filenames, timings, errors and
  environment details can reveal information. Do not publish raw logs.
- Sign out and clear local files removes the app-managed local workspace after
  successful synchronization. It does not promise secure erasure, delete copies
  students exported elsewhere, or automatically delete their Google Drive files.
- The browser development preview stores its own development data locally and
  is not the native Windows account/Drive implementation.

Third-party policies: [Google](https://policies.google.com/privacy),
[GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement),
[Microsoft](https://privacy.microsoft.com/privacystatement).

Maintainers must review this document against each public release's actual
behavior and publish a monitored privacy contact before public launch.
