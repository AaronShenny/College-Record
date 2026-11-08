import "./app.css";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useHashRoute } from "@/components/kit";
import { WorkspaceProvider, useStore } from "@/hooks/use-workspace";
import { DesktopSignIn } from "@/components/desktop-sign-in";
import Dashboard from "@/pages/dashboard";
import SubjectPage from "@/pages/subject";
import Editor from "@/pages/editor";
import SettingsPage from "@/pages/settings";
import TrashPage from "@/pages/trash";
import DocumentsPage from "@/pages/documents";
import TemplatePage from "@/pages/template";
import ImportPage from "@/pages/import";
import { workspaceAccess } from "@/lib/workspace-access";
import { syncDrive } from "@/lib/workflow-api";
import { errMsg } from "@/hooks/use-workspace";

function InitialDriveError() {
  const { cloud, reload, refreshCloud } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = async () => {
    setBusy(true); setError("");
    try { await syncDrive(); await refreshCloud(); reload(); }
    catch (e) { setError(errMsg(e)); await refreshCloud(); }
    finally { setBusy(false); }
  };
  return <div className="crm" style={{ display: "grid", placeItems: "center", padding: 24 }}>
    <div className="panel panel-pad" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 28 }}>Your Drive records haven’t loaded yet</h1>
      <p>There are no records cached on this computer. That does not mean your Drive is empty.</p>
      <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{error || cloud?.message || "Drive sync could not finish. Check your connection and try again."}</span></div>
      <button className="btn primary" disabled={busy} onClick={() => void retry()} data-testid="button-retry-initial-sync">{busy ? "Trying again…" : "Retry Drive sync"}</button>
    </div>
  </div>;
}

function Routes() {
  const { workspace, workspaceRevision, loadError, reload, runtime, cloud, drafts, notify } = useStore();
  const parts = useHashRoute(() => {
    if (!drafts.size) return true;
    notify("Fix the highlighted draft fields before changing pages. Your entered values are still here.", "error");
    return false;
  });
  const access = workspaceAccess(runtime, cloud, workspace, workspaceRevision);
  const readyScreen = access === "sign-in" ? "sign-in" : workspace && access === "ready" && !loadError ? "dashboard" : null;
  useEffect(() => {
    if (!readyScreen || !window.recordMaker?.reportReady) return;
    // Two frames allow the real screen to paint; a skeleton never counts as
    // an interactive dashboard in native startup diagnostics.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        void window.recordMaker?.reportReady?.(readyScreen).catch(error => console.error("Desktop readiness could not be reported", error));
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [readyScreen]);
  if (access === "sign-in") return <DesktopSignIn />;
  if (loadError) {
    return <div className="crm" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div className="panel panel-pad" style={{ maxWidth: 480 }} role="alert">
        <div className="eyebrow">Workspace not loaded</div>
        <h1 style={{ fontSize: 28 }}>Your records could not be opened</h1>
        <div className="notice red"><AlertTriangle size={14} />{loadError}</div>
        <p className="hint">Nothing was changed or cleared. Editing stays locked until the saved workspace loads, so an empty workspace can never overwrite it.</p>
        <button className="btn primary" onClick={reload} data-testid="button-retry-load">Try again</button>
      </div>
    </div>;
  }
  if (access === "sync-error") return <InitialDriveError />;
  if (!workspace || access === "opening") {
    return <div className="crm" aria-busy="true"><div className="app-shell"><aside className="sidebar"><div className="skel" style={{ height: 36 }} /><div className="skel" style={{ height: 160 }} /></aside>
      <main style={{ padding: 36, display: "grid", gap: 16, alignContent: "start" }}><p role="status">{cloud?.connected && (!workspace || workspace.subjects.length === 0) ? "Loading your records from Google Drive…" : access === "opening" ? "Opening your account’s records…" : "Loading your saved records…"}</p><p className="hint">Please wait before creating records. Your Drive has not been confirmed empty. Existing cached records open locally while sync runs in the background.</p><div className="skel" style={{ height: 40, width: 320 }} /><div className="skel" style={{ height: 130 }} /><div className="skel" style={{ height: 260 }} /></main></div></div>;
  }
  const [a, b, c] = parts;
  let page;
  if (!a) page = <Dashboard />;
  else if (a === "subjects") page = <Dashboard subjectsOnly />;
  else if (a === "subject" && b) page = <SubjectPage id={b} />;
  else if (a === "program" && b && c) page = <Editor sid={b} pid={c} />;
  else if (a === "settings") page = <SettingsPage />;
  else if (a === "trash") page = <TrashPage />;
  else if (a === "documents") page = <DocumentsPage sid={b} />;
  else if (a === "template" && b) page = <TemplatePage sid={b} />;
  else if (a === "import" && b) page = <ImportPage sid={b} />;
  else page = <Dashboard />;
  return <ErrorBoundary resetKey={parts.join("/")}>{page}</ErrorBoundary>;
}

function App() {
  return <WorkspaceProvider><Routes /></WorkspaceProvider>;
}

export default App;
