import { BrandMark } from "./kit";
import { useState } from "react";
import { AlertTriangle, FileKey, LogIn, RefreshCw } from "lucide-react";
import { configureGoogle, connectDrive } from "@/lib/workflow-api";
import { errMsg, useStore } from "@/hooks/use-workspace";

/** Required sign-in for packaged desktop builds. Adapted from the approved SignIn mockup. */
export function DesktopSignIn() {
  const { cloud, cloudError, refreshCloud, reload } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key); setErr(null);
    try { await fn(); const s = await refreshCloud(); if (s?.connected) after?.(); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(null); }
  };
  const unknown = !cloud;

  return (
    <div className="crm sign-in">
      <div className="signin-bar"><div className="brand"><BrandMark /><span><span className="brand-name">Recordly</span><span className="brand-sub">by extapano</span></span></div></div>
      <main className="signin-layout">
        <section className="signin-story">
          <div className="eyebrow">A quieter way to finish the record</div>
          <h1>Make room for<br /><em>the work itself.</em></h1>
          <p>Bring your own code, outputs and subject template together in one orderly study space.</p>
          <div className="signin-sheet" aria-hidden="true"><i /><i /><i /><span>[MAIN_CODE]</span><i /><i /></div>
        </section>
        <section className="signin-card" aria-labelledby="signin-h">
          <div className="eyebrow">Student access</div>
          <h2 id="signin-h">Sign in to your workspace</h2>
          {unknown ? (
            cloudError ? <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>Account status could not be read.</b> {cloudError}</span></div>
              : <div role="status" style={{ display: "grid", gap: 8 }}><span className="hint">Checking your account…</span><div className="skel" style={{ height: 44 }} /></div>
          ) : (<>
            <p className="muted" style={{ margin: 0 }}>Use your Rajagiri Google account. Sign-in opens in your system browser; this app never asks for your password.</p>
            {!cloud.configured && <div className="notice"><AlertTriangle size={14} /><span>This installation has no Google desktop client yet. Load the OAuth client JSON file you were given.</span></div>}
            {!cloud.configured && <button className="btn" disabled={!!busy} onClick={() => void run("configure", configureGoogle)} data-testid="button-signin-configure"><FileKey size={14} /> {busy === "configure" ? "Choosing file…" : "Load OAuth client JSON"}</button>}
            <button className="btn primary google-btn" disabled={!!busy || !cloud.configured} onClick={() => void run("connect", connectDrive, reload)} data-testid="button-signin-google">
              <LogIn size={14} /> {busy === "connect" ? "Waiting for browser sign-in…" : "Continue with Google"}</button>
            {cloud.message && <div className="notice blue"><span>{cloud.message}</span></div>}
          </>)}
          {err && <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{err}</span></div>}
          {(unknown || err) && <button className="btn small" disabled={!!busy} onClick={() => { setErr(null); void refreshCloud(); }} data-testid="button-signin-retry"><RefreshCw size={12} /> Check again</button>}
          <div className="domain-rule"><b>rajagiri.edu only</b><p>Personal Google accounts and other domains are not accepted.</p></div>
          <div className="domain-rule"><b>First sign-in needs internet</b><p>Once signed in on this computer, you can keep working offline. Changes sync when you are back online.</p></div>
          <div className="domain-rule"><b>Your own Drive</b><p>Records stay in your account. Local development drafts are kept separate and are never attached to your Google account.</p></div>
        </section>
      </main>
    </div>
  );
}
