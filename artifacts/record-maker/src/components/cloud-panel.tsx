import { useEffect, useRef, useState } from "react";
import { AlertTriangle, GitCompare, FileKey, LogIn, LogOut, RefreshCw, RotateCcw } from "lucide-react";
import { Modal, fmtTime } from "./kit";
import { checkUpdates, configureGoogle, connectDrive, logoutCleanup, restartForUpdate, syncDrive, type ConflictReview } from "@/lib/workflow-api";
import { cloudLabel, errMsg, useStore } from "@/hooks/use-workspace";

export function CloudPanel() {
  const { runtime, reload, notify, cloud: status, cloudError, refreshCloud, isClean: clean, syncNow, reviewConflict, resolveConflict } = useStore();
  const [review, setReview] = useState<ConflictReview | null>(null);
  const [pick, setPick] = useState<"local" | "drive" | null>(null);
  const [conflictAck, setConflictAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const cleanRef = useRef(clean); cleanRef.current = clean;
  const desktop = runtime?.mode === "desktop";

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string, reloadAfter = false) => {
    setBusy(key); setErr(null);
    try {
      await fn(); await refreshCloud(); if (ok) notify(ok);
      if (reloadAfter && cleanRef.current) reload();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(null); }
  };
  const logout = async () => {
    setBusy("logout"); setErr(null);
    try {
      const synced = await syncDrive();
      if (synced.pending || synced.state !== "synced") throw new Error(synced.message || "Sync did not finish, so nothing was deleted.");
      await logoutCleanup(); await refreshCloud();
      setConfirm(false); setAck(false); notify("Signed out. Cached account files were removed.");
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(null); }
  };
  const cloudBusy = !!busy || !!status?.busy;

  return (
    <div data-testid="panel-cloud">
      <div className="settings-account-grid">
        <section className="panel settings-account-card" aria-labelledby="settings-account-heading">
          <span className="kicker">Account</span>
          <h2 id="settings-account-heading">{status?.account?.name ?? (status ? "College account" : "Checking account…")}</h2>
          <div className="settings-identity">
            <span className="settings-avatar" aria-hidden="true">{status?.account?.name?.trim().slice(0, 1).toUpperCase() || "G"}</span>
            <div><b>{status?.account?.email ?? "Not signed in"}</b><small>{status?.connected ? "College account" : "Use your rajagiri.edu account"}</small></div>
          </div>
          {!status?.connected && <button className="btn" disabled={!desktop || cloudBusy || !clean || !status?.configured} onClick={() => void run("connect", connectDrive, "Google Drive connected.", true)} data-testid="button-connect-drive"><LogIn size={13} /> {busy === "connect" ? "Waiting for sign-in…" : "Connect Google account"}</button>}
          {status?.connected && status.state === "error" && /authoriz|access.*expir|reconnect|sign.?in/i.test(status.message ?? "") && <button className="btn" disabled={!desktop || cloudBusy || !clean} onClick={() => void run("connect", connectDrive, "Google account reconnected.", true)} data-testid="button-reconnect-drive"><LogIn size={13} /> {busy === "connect" ? "Waiting for sign-in…" : "Sign in again"}</button>}
          {status?.connected && <button className="btn small ghost settings-signout" disabled={cloudBusy || !clean} onClick={() => setConfirm(true)} data-testid="button-logout-delete"><LogOut size={13} /> Sign out & clear local files</button>}
          {desktop && <details className="settings-connection-details">
            <summary>Connection setup</summary>
            <button className="btn small" disabled={cloudBusy || status?.connected || !clean} onClick={() => void run("configure", configureGoogle, "Google desktop client loaded.")} data-testid="button-configure-google"><FileKey size={13} /> {busy === "configure" ? "Choosing file…" : "Load OAuth client JSON"}</button>
          </details>}
        </section>
        <section className="panel settings-sync-card" aria-labelledby="settings-drive-heading">
          <div className="settings-sync-head">
            <div><span className="kicker">Google Drive</span><h2 id="settings-drive-heading" data-testid="status-cloud">{status ? cloudLabel(status).text : "Checking…"}</h2></div>
            <button className="btn primary" disabled={!desktop || !status?.connected || cloudBusy || !clean} onClick={() => void run("sync", syncNow, "Sync finished.", true)} data-testid="button-sync-drive"><RefreshCw size={13} /> {busy === "sync" || status?.busy ? "Syncing…" : "Sync now"}</button>
          </div>
          <div className="settings-sync-summary">
            <div><b>On this PC</b><small>{!clean ? "Unsaved changes" : !status ? "Checking…" : status.pending ? "Changes waiting to sync" : "Saved locally"}</small></div>
            <div><b>In Drive</b><small>{!status ? "Checking…" : !status.connected ? "Not connected" : status.state === "synced" && !status.pending && clean ? "Up to date" : "Not yet up to date"}</small></div>
          </div>
          {status?.lastSyncAt && <p className="hint settings-last-sync">Last sync {fmtTime(status.lastSyncAt)}</p>}
          {!desktop && <p className="hint settings-last-sync">Google sign-in is available in the installed desktop app.</p>}
        </section>
      </div>
      {status?.state === "conflict" && <div className="notice red" role="alert" style={{ marginTop: 10 }} data-testid="notice-conflict"><AlertTriangle size={14} /><span style={{ flex: 1 }}><b>This PC and Drive both changed.</b> Nothing is overwritten until you choose which workspace to keep.</span>
        <button className="btn small" disabled={!!busy} onClick={async () => { setBusy("review"); setErr(null); try { setReview(await reviewConflict()); setPick(null); setConflictAck(false); } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); } }} data-testid="button-review-conflict"><GitCompare size={13} /> {busy === "review" ? "Loading…" : "Review conflict"}</button></div>}
      {status?.state === "error" && status.message && <div className="notice red" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>{status.message}</span></div>}
      {(err || cloudError) && <div className="notice red" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>{err || cloudError}</span></div>}
      {!clean && <p className="hint">Save or fix your edits before connecting, syncing or signing out, so they stay with the right account.</p>}
      <Modal open={!!review} onClose={() => { if (!busy) setReview(null); }} title="Resolve sync conflict"
        footer={<><button className="btn" autoFocus disabled={!!busy} onClick={() => setReview(null)} data-testid="button-cancel-conflict">Cancel</button>
          <button className="btn danger" disabled={!pick || !conflictAck || !!busy} data-testid="button-confirm-conflict" onClick={async () => {
            if (!review || !pick) return; setBusy("resolve"); setErr(null);
            try { await resolveConflict(review.token, pick); await refreshCloud(); setReview(null); notify(pick === "local" ? "Drive replaced with this PC's workspace." : "This PC replaced with the Drive workspace."); if (pick === "drive" && cleanRef.current) reload(); }
            catch (e) { setErr(errMsg(e)); } finally { setBusy(null); }
          }}>{busy === "resolve" ? "Replacing…" : pick === "drive" ? "Replace this PC with Drive" : pick === "local" ? "Replace Drive with this PC" : "Choose a side"}</button></>}>
        {review && <div style={{ fontSize: 13, display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>The whole workspace for <b>{review.account}</b> is replaced by one side. Subjects are not merged.</p>
          <div className="choice-list">
            <label><input type="radio" name="conflict-side" checked={pick === "local"} onChange={() => { setPick("local"); setConflictAck(false); }} data-testid="radio-conflict-local" />
              <span><b>Keep this PC</b> · {review.localSubjects} subject(s){review.localSavedAt ? `, saved ${fmtTime(review.localSavedAt)}` : ""}<br /><small className="muted">The Drive copy ({review.remoteSubjects} subject(s)) is overwritten and its changes are lost.</small></span></label>
            <label><input type="radio" name="conflict-side" checked={pick === "drive"} onChange={() => { setPick("drive"); setConflictAck(false); }} data-testid="radio-conflict-drive" />
              <span><b>Keep Drive</b> · {review.remoteSubjects} subject(s){review.remoteSavedAt ? `, saved ${fmtTime(review.remoteSavedAt)}` : ""}<br /><small className="muted">This PC's workspace ({review.localSubjects} subject(s)) is overwritten and its changes are lost.</small></span></label>
          </div>
          {pick && <label className="required-toggle"><input type="checkbox" className="check" checked={conflictAck} onChange={e => setConflictAck(e.target.checked)} data-testid="check-conflict-ack" /> I understand the {pick === "local" ? "Drive" : "PC"} workspace will be replaced</label>}
          {err && <div className="notice red"><AlertTriangle size={14} /><span>{err}</span></div>}
        </div>}
      </Modal>
      <Modal open={confirm} onClose={() => { if (!busy) { setConfirm(false); setAck(false); } }} title="Log out and delete local files?"
        footer={<><button className="btn" disabled={!!busy} onClick={() => { setConfirm(false); setAck(false); }}>Cancel</button>
          <button className="btn danger" disabled={!ack || !!busy} onClick={() => void logout()} data-testid="button-confirm-logout">{busy === "logout" ? "Syncing, then removing…" : "Sync, log out and delete"}</button></>}>
        <div style={{ fontSize: 13, display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>First, everything is synced to Drive. Only if that sync succeeds, this deletes <b>only the app-managed cached workspace and generated files for {status?.account?.email ?? "the signed-in account"}</b> on this computer.</p>
          <p style={{ margin: 0 }}>It does <b>not</b> delete: your files in Google Drive, original files you imported from elsewhere, copies you exported or saved outside the app, other unrelated files, or separate local-development drafts.</p>
          <p style={{ margin: 0 }}>It does not sign you out of Google in your web browser.</p>
        </div>
        {err && <div className="notice red"><AlertTriangle size={14} /><span>{err}</span></div>}
        <label className="required-toggle"><input type="checkbox" className="check" checked={ack} onChange={e => setAck(e.target.checked)} data-testid="check-logout-ack" /> I understand local files for this account will be deleted</label>
      </Modal>
    </div>
  );
}

export function UpdatesPanel() {
  const { runtime, isClean: clean } = useStore();
  const [st, setSt] = useState<{ state: string; message?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const readyToRestart = !!st && /ready|downloaded/i.test(st.state);
  const active = !!st && /check|download|available|progress/i.test(st.state) && !readyToRestart;
  const check = async (quiet = false) => { if (!quiet) setBusy("check"); setErr(null); try { setSt(await checkUpdates()); } catch (e) { setErr(errMsg(e)); } finally { if (!quiet) setBusy(null); } };
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void check(true); }, 4000);
    return () => window.clearInterval(t);
  }, [active]);
  const restart = async () => { setBusy("restart"); setErr(null); try { await restartForUpdate(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); } };
  return (
    <section className="panel settings-updates">
      <div className="settings-update-head">
        <div><h2>App updates</h2><span className="hint" data-testid="status-update">Version {runtime?.version ?? "unknown"} · {st?.state ?? "Not checked"}</span></div>
        <div className="settings-update-buttons">
          <button className="btn" disabled={!!busy} onClick={() => void check()} data-testid="button-check-updates"><RefreshCw size={13} /> {busy === "check" ? "Checking…" : "Check for updates"}</button>
          {readyToRestart && <button className="btn primary" disabled={!!busy || !clean} onClick={() => void restart()} data-testid="button-restart-update"><RotateCcw size={13} /> {busy === "restart" ? "Restarting…" : "Restart to update"}</button>}
        </div>
      </div>
      {st?.message && <div className="notice blue" style={{ marginBottom: 10 }}><span>{st.message}</span></div>}
      {err && <div className="notice red" role="alert" style={{ marginBottom: 10 }}><AlertTriangle size={14} /><span>{err}</span></div>}
      {readyToRestart && !clean && <p className="hint">Restart waits until unsaved or invalid edits are saved or fixed.</p>}
    </section>
  );
}
