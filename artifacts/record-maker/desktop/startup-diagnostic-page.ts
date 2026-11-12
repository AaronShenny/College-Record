import { PAGE_SIGNAL } from "./startup-diagnostic-core";

export function diagnosticPage(nonce: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'">
<title>College Record Maker — startup check</title>
<style nonce="${nonce}">
body{font:16px/1.6 system-ui,sans-serif;background:#f4f1e8;color:#233e3c;margin:0;padding:48px;max-width:740px}
h1{font-size:30px;margin:0 0 16px}.status{padding:14px 18px;background:#e2eee5;border:1px solid #9db9a6;border-radius:8px;font-weight:600}
li{margin:8px 0}small{display:block;margin-top:26px;color:#58635e}
</style></head><body><h1>Startup diagnostic</h1>
<p class="status" id="status">The minimal page has loaded. Checking JavaScript…</p>
<p>This is a test window, not your record workspace.</p>
<ul><li>No React interface, Google account, Drive, Python, or student records are loaded.</li>
<li>A fresh, isolated browser profile is used. Your existing profile and records are untouched.</li>
<li>The window closes automatically eight seconds after a successful check. The launcher then opens the results folder.</li></ul>
<small>A successful check proves only that this minimal window can load. It does not prove that the full app meets the 15-second goal.</small>
<script nonce="${nonce}">document.getElementById("status").textContent="Minimal page and JavaScript are working. Waiting for the native paint check…";console.info("${PAGE_SIGNAL}");</script>
</body></html>`;
}
