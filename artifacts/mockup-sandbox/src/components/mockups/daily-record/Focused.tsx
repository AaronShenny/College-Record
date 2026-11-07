import "./_next.css";
import Editor from "./_next/pages/editor";
import { WorkspaceProvider, useStore } from "./_next/hooks/use-workspace";
function Loaded() { const { workspace } = useStore(); return workspace ? <Editor sid="sample-subject" pid="sample-program" /> : null; }
export function Focused() {
  return <WorkspaceProvider><Loaded /></WorkspaceProvider>;
}
