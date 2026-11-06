# Build College Record Maker on your Windows PC

This builds the first Windows x64 installer. It does not require GitHub.

## 1. Install the build tools

- Node.js **22 LTS**, with npm.
- Python **3.12 x64**, including the Python launcher.
- Microsoft Word desktop is needed for testing Word preview/PDF export, not for building.

Open a new **PowerShell** window after installing these tools.

## 2. Copy the whole source project

In Replit's Files panel, open the three-dot menu and choose **Download as zip**.
Extract it to a short local directory such as `C:\RecordMaker`. Keep the whole
workspace: the app uses sibling packages and the original PDF extractor in
`attached_assets`. Do not copy only the app subfolder or an old Linux `node_modules`.

Open PowerShell in the extracted folder containing the root `package.json` and
`pnpm-workspace.yaml`.

## 3. Install dependencies

```powershell
npm install --global pnpm@10.26.1
pnpm install --frozen-lockfile
$env:RECORD_MAKER_PYTHON = py -3.12 -c "import sys; print(sys.executable)"
& $env:RECORD_MAKER_PYTHON -m pip install -r artifacts/record-maker/python/build-requirements.txt
```

Use `pnpm` for this workspace; the npm command above only installs that tool.

## 4. Provide the Google application registration

Keep the original downloaded Google **Desktop app** OAuth JSON outside the
project, for example in Downloads. The secret stored in Replit does not
automatically become an environment variable on your own computer.

```powershell
$env:GOOGLE_DESKTOP_CLIENT_JSON_PATH = Read-Host "Full path to your downloaded Google Desktop OAuth JSON"
node artifacts/record-maker/scripts/check-google-config.mjs
```

Enter the file path without surrounding quotes. The check prints only a format
validation result, never the JSON contents. Do not commit the JSON or paste it
into chat. This is the app registration; students' tokens/passwords do not
belong here. The installer bundles the registration so students won't need to
provide developer credentials.

## 5. Check and build

Run the commands one at a time. If a command fails, stop instead of continuing
with a partially built app.

```powershell
pnpm --filter @workspace/record-maker run typecheck
pnpm --filter @workspace/record-maker run test:desktop
& $env:RECORD_MAKER_PYTHON -m unittest discover -s artifacts/record-maker/python -p "test_*.py" -v
pnpm --filter @workspace/record-maker run desktop:package
explorer.exe generated-artifacts\desktop
```

The output folder contains the installer ending in `Setup.exe`. It includes
Electron and the packaged Python helper. End users do not need Node or Python.
There is no Windows installer already built in the Replit source download.

Without a configured signing certificate, this first local test installer is
unsigned and Windows may show a trust warning. Check that you built it yourself
and verify its origin; do not disable Windows security protections globally.
Do not distribute it college-wide as a verified signed release.

## 6. Test the installed app

1. Sign in with a verified `rajagiri.edu` Google account.
2. Confirm an app folder is created in that student's Drive.
3. Create a subject, upload/map a template and add a program with code/output.
4. Generate a DOCX; open it in Word, then try PDF export.
5. Close Word and the app, reopen it, and check that records persist.
6. Temporarily disconnect the network, edit/save, reconnect and confirm pending changes sync.
7. Only after confirming the Drive copy, test the explicitly confirmed
   logout-and-delete-local-cache action. Verify it leaves Drive data and original files untouched.

Google API enablement, consent/test-user settings and college administrator
policies may affect login. A locally valid JSON format is not proof of live
Google authorization. Capture the app's error message if login is blocked;
never share access/refresh tokens or the OAuth JSON.

Automatic updates remain unconfigured until a signed release and HTTPS update
feed are set up. See `artifacts/record-maker/DESKTOP.md` for release details.
