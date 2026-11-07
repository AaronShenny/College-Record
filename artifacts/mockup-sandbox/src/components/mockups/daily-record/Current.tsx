import "./_group.css";
import Editor from "./_current/pages/editor";
import { WorkspaceProvider, useStore } from "./_current/hooks/use-workspace";
function LoadedEditor() {
  const { workspace } = useStore();
  return workspace ? <Editor sid="sample-subject" pid="sample-program" /> : <div>Loading sample editor…</div>;
}
export function Current() {
  return <WorkspaceProvider><LoadedEditor /></WorkspaceProvider>;
}
