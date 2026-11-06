import { useState } from "react";
import { AlertTriangle, Cpu, Info, Lock, Play, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { PageHead } from "@/components/kit";
import { bridge } from "@/lib/bridge";
import { pendingItemCount, type WorkerResult } from "@/lib/contracts";
import { activePrograms, activeSubjects, errMsg, pad, useStore } from "@/hooks/use-workspace";

type Job = { state: "idle" | "running" | "success" | "error"; result?: WorkerResult; error?: string; at?: string };

function JobView({ job, idleText }: { job: Job; idleText: string }) {
  if (job.state === "idle") return <p className="hint">{idleText}</p>;
  if (job.state === "running") return <div role="status" style={{ display: "grid", gap: 6 }}><span className="badge blue" style={{ justifySelf: "start" }}><i className="dot busy" />Running in background · you can keep editing</span><div className="skel" style={{ height: 60 }} /></div>;
  if (job.state === "error") return <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>Failed.</b> {job.error}</span></div>;
  return <div style={{ display: "grid", gap: 6 }}>
    <span className="badge good" style={{ justifySelf: "start" }}>Completed · job {job.result?.jobId}</span>
    <pre className="result" data-testid="text-job-result">{JSON.stringify(job.result?.result, null, 2)}</pre>
  </div>;
}

export default function SettingsPage() {
  const { runtime, runtimeError, workspace, save } = useStore();
  const [py, setPy] = useState<Job>({ state: "idle" });
  const [snap, setSnap] = useState<Job>({ state: "idle" });
  const subjects = activeSubjects(workspace!);
  const [sid, setSid] = useState<string>("");
  const [pids, setPids] = useState<Set<string>>(new Set());
  const subject = subjects.find(s => s.id === sid);

  const run = async (set: (j: Job) => void, fn: () => Promise<WorkerResult>) => {
    set({ state: "running" });
    try { set({ state: "success", result: await fn(), at: new Date().toISOString() }); }
    catch (e) { set({ state: "error", error: errMsg(e) }); }
  };

  return (
    <Shell active="settings" crumb="Settings">
      <div className="page">
        <PageHead eyebrow="Preferences" title="Settings" description="What this build can and cannot do, shown honestly." />
        <div className="settings-grid">
          <section className="panel panel-pad">
            <div className="section-title"><h2>Runtime</h2>{runtime && <span className={`badge ${runtime.mode === "desktop" ? "good" : "warn"}`}>{runtime.mode === "desktop" ? "Installed desktop" : "Browser preview"}</span>}</div>
            {runtimeError ? <div className="notice red"><AlertTriangle size={14} />Runtime could not be read: {runtimeError}</div> : !runtime ? <div className="skel" style={{ height: 110 }} /> : (
              <dl className="kv" data-testid="text-runtime">
                <dt>Mode</dt><dd>{runtime.mode}</dd>
                <dt>Version</dt><dd className="mono">{runtime.version}</dd>
                <dt>Platform</dt><dd>{runtime.platform}</dd>
                <dt>Storage</dt><dd>{runtime.storageLabel}</dd>
                <dt>Python helper</dt><dd>{runtime.pythonAvailable === null ? "Unknown until checked" : runtime.pythonAvailable ? "Available" : "Not available"}</dd>
                <dt>Last local save</dt><dd>{save.savedAt ? new Date(save.savedAt).toLocaleString() : "Not saved in this session"}</dd>
                <dt>Pending sync items</dt><dd>{pendingItemCount(workspace!)} (held locally until Drive sync exists)</dd>
              </dl>
            )}
          </section>

          <section className="panel panel-pad">
            <div className="section-title"><h2>Account and Drive</h2><span className="badge neutral">Not connected</span></div>
            <div className="notice blue"><Info size={14} /><span>Google sign-in and Drive sync are not part of this build. You are using a local workspace that is not tied to any Google or college account. All edits stay pending locally.</span></div>
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <button className="btn" disabled aria-describedby="logout-why" data-testid="button-logout-delete"><Lock size={13} /> Log out and delete local files</button>
              <p id="logout-why" className="hint" style={{ margin: 0 }}>Blocked: your {pendingItemCount(workspace!)} local item(s) have never been synced to Drive. Deleting local files now would lose your work, so this stays disabled until Drive sync is available.</p>
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="section-title"><h2><Cpu size={16} style={{ verticalAlign: "-2px" }} /> Python helper</h2></div>
            <p className="hint" style={{ marginTop: 0 }}>Checks that the bundled helper starts. It never runs your programs.</p>
            <button className="btn primary" onClick={() => void run(setPy, () => bridge.checkPython())} disabled={py.state === "running"} data-testid="button-check-python"><Play size={13} /> Check Python helper</button>
            <div style={{ marginTop: 12 }}><JobView job={py} idleText="Not checked yet." /></div>
          </section>

          <section className="panel panel-pad">
            <div className="section-title"><h2><Search size={16} style={{ verticalAlign: "-2px" }} /> Inspect saved snapshot</h2></div>
            <p className="hint" style={{ marginTop: 0 }}>Asks the helper to read what is saved on disk for selected programs. Unsaved edits are not included.</p>
            {subjects.length === 0 ? <p className="hint">Create a subject first.</p> : <>
              <label><span className="field-label">Subject</span>
                <select value={sid} onChange={e => { setSid(e.target.value); setPids(new Set()); }} data-testid="select-snapshot-subject">
                  <option value="">Choose a subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              {subject && <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0", display: "grid", gap: 4, maxHeight: 160, overflow: "auto" }}>
                <legend className="field-label">Programs ({pids.size} selected)</legend>
                {activePrograms(subject).length === 0 && <span className="hint">This subject has no programs.</span>}
                {activePrograms(subject).map(p => <label key={p.id} className="inclusion"><input type="checkbox" className="check" checked={pids.has(p.id)} onChange={e => { const n = new Set(pids); if (e.target.checked) n.add(p.id); else n.delete(p.id); setPids(n); }} /> <span className="mono">{pad(p.number)}</span> {p.title || "Untitled"}</label>)}
              </fieldset>}
              <button className="btn primary" style={{ marginTop: 12 }} disabled={!subject || pids.size === 0 || snap.state === "running"} onClick={() => void run(setSnap, () => bridge.inspectSnapshot(sid, [...pids]))} data-testid="button-inspect-snapshot"><Play size={13} /> Inspect snapshot</button>
            </>}
            <div style={{ marginTop: 12 }}><JobView job={snap} idleText="No inspection run yet." /></div>
          </section>

          <section className="panel panel-pad" style={{ gridColumn: "1 / -1" }}>
            <div className="section-title"><h2>Updates</h2><span className="badge neutral">Later milestone</span></div>
            <p className="hint" style={{ margin: 0 }}>This build does not check for or install updates. Version {runtime?.version ?? "unknown"} stays as installed.</p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
