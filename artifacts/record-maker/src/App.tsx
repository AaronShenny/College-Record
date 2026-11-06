import "./app.css";
import { AlertTriangle } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useHashRoute } from "@/components/kit";
import { WorkspaceProvider, useStore } from "@/hooks/use-workspace";
import Dashboard from "@/pages/dashboard";
import SubjectPage from "@/pages/subject";
import Editor from "@/pages/editor";
import SettingsPage from "@/pages/settings";
import TrashPage from "@/pages/trash";
import DocumentsPage from "@/pages/documents";

function Routes() {
  const { workspace, loadError, reload } = useStore();
  const parts = useHashRoute();
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
  if (!workspace) {
    return <div className="crm" aria-busy="true"><div className="app-shell"><aside className="sidebar"><div className="skel" style={{ height: 36 }} /><div className="skel" style={{ height: 160 }} /></aside>
      <main style={{ padding: 36, display: "grid", gap: 16, alignContent: "start" }}><span className="sr-only">Loading workspace</span><div className="skel" style={{ height: 40, width: 320 }} /><div className="skel" style={{ height: 130 }} /><div className="skel" style={{ height: 260 }} /></main></div></div>;
  }
  const [a, b, c] = parts;
  let page;
  if (!a) page = <Dashboard />;
  else if (a === "subjects") page = <Dashboard subjectsOnly />;
  else if (a === "subject" && b) page = <SubjectPage id={b} />;
  else if (a === "program" && b && c) page = <Editor sid={b} pid={c} />;
  else if (a === "settings") page = <SettingsPage />;
  else if (a === "trash") page = <TrashPage />;
  else if (a === "documents") page = <DocumentsPage />;
  else page = <Dashboard />;
  return <ErrorBoundary resetKey={parts.join("/")}>{page}</ErrorBoundary>;
}

function App() {
  return <WorkspaceProvider><Routes /></WorkspaceProvider>;
}

export default App;
