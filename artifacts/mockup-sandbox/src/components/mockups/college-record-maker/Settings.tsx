import "./_group.css";
import { useState } from "react";
import { Chrome, PageHead } from "./_shared/Chrome";

type ConfirmAction = "signout" | "cleanup" | null;

export function Settings() {
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const showNotice = (message: string) => {
    setConfirmAction(null);
    setNotice(message);
  };

  return <Chrome active="Settings"><div className="page settings-page">
    <PageHead eyebrow="Your workspace" title="Settings" description="Account and sync, in one place." />

    <div className="settings-grid">
      <section className="panel account-panel" aria-labelledby="account-heading">
        <div className="panel-heading">
          <div>
            <span className="kicker">Account</span>
            <h2 id="account-heading">Rajagiri student</h2>
          </div>
        </div>
        <div className="account-row">
          <span className="account-avatar" aria-hidden="true">RS</span>
          <div className="account-copy">
            <b>student@rajagiri.edu</b>
            <small>College account</small>
          </div>
        </div>
        <button className="btn reconnect-button" onClick={() => showNotice("Demo only — account connection is unavailable.")}>Reconnect account</button>
      </section>

      <section className="panel sync-panel" aria-labelledby="sync-heading">
        <div className="sync-heading">
          <div>
            <span className="kicker">Google Drive</span>
            <h2 id="sync-heading">Not connected</h2>
          </div>
          <button className="btn primary" onClick={() => showNotice("Demo only — no sync was started.")}>Sync now</button>
        </div>
        <div className="sync-summary" aria-label="Sync status">
          <div><span className="status-dot pending" /><span><b>On this PC</b><small>2 changes waiting</small></span></div>
          <span className="status-divider" aria-hidden="true" />
          <div><span className="status-dot disconnected" /><span><b>In Drive</b><small>Not connected</small></span></div>
        </div>
      </section>
    </div>

    <section className="panel updates-row" aria-labelledby="updates-heading">
      <div><h2 id="updates-heading">App updates</h2><span>Not checked</span></div>
      <button className="btn" onClick={() => showNotice("Demo only — update status was not checked.")}>Check for updates</button>
    </section>

    <details className="technical-details">
      <summary>Details</summary>
      <div className="details-content">
        <p>Record data is stored locally until Drive is connected. Sync and update controls on this screen are visual prototypes.</p>
        <p>Microsoft Word is needed to open generated documents and export PDF; it is not needed for ordinary DOCX generation.</p>
      </div>
    </details>

    <section className="account-actions" aria-label="Other account actions">
      <button className="btn ghost" onClick={() => setConfirmAction("signout")}>Sign out</button>
      <span className="action-separator" aria-hidden="true" />
      <button className="btn danger" onClick={() => setConfirmAction("cleanup")}>Delete local files</button>
    </section>

    {notice && <div className="settings-toast" role="status">
      <span>{notice}</span>
      <button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button>
    </div>}

    {confirmAction && <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setConfirmAction(null);
    }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="kicker">{confirmAction === "cleanup" ? "Local files" : "Account"}</span>
        <h2 id="confirm-title">{confirmAction === "cleanup" ? "Delete local files?" : "Sign out?"}</h2>
        {confirmAction === "cleanup"
          ? <p>Only continue after your changes have synced successfully. Originals and files in Drive will remain untouched. This demo will not delete anything.</p>
          : <p>This demo will not sign you out or change the connected account.</p>}
        <div className="dialog-actions">
          <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
          <button className="btn danger" onClick={() => showNotice(confirmAction === "cleanup" ? "Demo only — no local files were deleted." : "Demo only — you are still signed in.")}>
            {confirmAction === "cleanup" ? "Delete local files" : "Sign out"}
          </button>
        </div>
      </section>
    </div>}

    <style>{`
      .settings-page{max-width:1050px}
      .settings-grid{display:grid;grid-template-columns:minmax(250px,.82fr) minmax(0,1.55fr);gap:16px;align-items:start}
      .account-panel,.sync-panel{padding:20px}
      .panel-heading,.sync-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .panel-heading{margin-bottom:19px}
      .panel-heading h2,.sync-heading h2{font-size:21px;margin:5px 0 0}
      .sample-label{font-size:10px;letter-spacing:.03em;color:#765b2f;background:var(--gold-pale);border:1px solid #e5d8b7;border-radius:99px;padding:5px 9px}
      .account-row{display:flex;align-items:center;gap:12px;padding:13px;background:#f2f0e8;border:1px solid #e4e2d8;border-radius:8px}
      .account-avatar{width:38px;height:38px;flex:none;border-radius:50%;background:#e0e8de;color:#446a59;display:grid;place-items:center;font-size:12px;font-weight:700}
      .account-copy{min-width:0;flex:1}
      .account-copy b,.account-copy small{display:block}
      .account-copy b{font-size:11px;overflow-wrap:anywhere}
      .account-copy small{font-size:10px;color:var(--muted);margin-top:3px}
      .reconnect-button{margin-top:12px}
      .updates-row{margin-top:14px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:14px}
      .updates-row h2{font-size:18px;margin:0 0 4px}
      .updates-row span{font-size:11px;color:var(--muted)}
      .sync-heading{margin-bottom:16px}
      .sync-summary{display:flex;align-items:center;gap:18px;padding:13px 14px;background:#f3f2eb;border:1px solid #e7e5dc;border-radius:8px}
      .sync-summary>div{display:flex;align-items:center;gap:9px;min-width:0}
      .sync-summary>div>span:last-child{display:grid;gap:2px}
      .sync-summary b{font-size:11px}
      .sync-summary small{font-size:10px;color:var(--muted)}
      .status-dot{width:9px;height:9px;flex:none;border-radius:50%}
      .status-dot.pending{background:#c39345}
      .status-dot.disconnected{background:#aab2ac}
      .status-divider{width:1px;height:29px;background:#d9d9ce}
      .record-list{margin-top:12px}
      .record-row{min-height:54px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #eceae1;padding:8px 3px}
      .record-row:last-child{border-bottom:0}
      .record-mark{width:28px;height:30px;flex:none;display:grid;place-items:center;border:1px solid #d9d9ce;border-radius:5px;background:#f6f5ef;color:var(--teal);font:600 14px 'Newsreader',serif}
      .record-name{flex:1;min-width:0}
      .record-name b,.record-name small{display:block}
      .record-name b{font-size:11px}
      .record-name small{font-size:9px;color:var(--muted);margin-top:3px}
      .sync-note{margin:8px 0 0;font-size:9px;color:var(--muted)}
      .technical-details{margin-top:14px;border:1px solid var(--line);border-radius:8px;background:rgba(255,253,247,.55)}
      .technical-details summary{cursor:pointer;padding:11px 14px;color:#4e625f;font-size:11px;font-weight:700}
      .technical-details summary::marker{color:var(--rust)}
      .details-content{padding:0 14px 12px;border-top:1px solid #e5e4da}
      .details-content p{font-size:10px;line-height:1.55;color:var(--muted);margin:10px 0 0}
      .account-actions{display:flex;align-items:center;gap:5px;margin-top:22px}
      .action-separator{height:18px;width:1px;background:var(--line);margin:0 5px}
      .cleanup-warning{font-size:10px;color:#786a52;margin:7px 0 0}
      .btn.danger{color:#974630;border-color:#dfc0b2;background:#fff9f4}
      .settings-toast{position:fixed;right:24px;bottom:20px;z-index:10;display:flex;align-items:center;gap:14px;background:var(--teal-dark);color:#fffdf7;padding:11px 13px;border-radius:8px;font-size:11px;box-shadow:var(--shadow)}
      .settings-toast button{border:0;background:none;color:inherit;font-size:17px;line-height:1}
      .dialog-backdrop{position:fixed;inset:0;z-index:20;background:rgba(32,45,48,.28);display:grid;place-items:center;padding:20px}
      .confirm-dialog{width:min(100%,410px);padding:21px;background:var(--surface);border:1px solid var(--line);border-radius:11px;box-shadow:var(--shadow)}
      .confirm-dialog h2{font-size:23px;margin:6px 0}
      .confirm-dialog p{font-size:12px;color:var(--muted);line-height:1.6;margin:9px 0 18px}
      .dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      @media(max-width:760px){.settings-grid{grid-template-columns:1fr}.account-panel,.sync-panel{padding:16px}}
      @media(max-width:480px){.account-row{flex-wrap:wrap}.account-row .btn{width:100%}.sync-summary{gap:10px;padding:11px}.sync-summary b{font-size:10px}.sync-summary small{font-size:9px}.sync-heading{align-items:flex-start}}
    `}</style>
  </div></Chrome>;
}
