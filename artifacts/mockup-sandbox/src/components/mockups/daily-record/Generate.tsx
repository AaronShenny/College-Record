import { useEffect } from "react";
import "./_next.css";
import SubjectPage from "./_next/pages/subject";
import { WorkspaceProvider, useStore } from "./_next/hooks/use-workspace";
function Seeded() {
  const { workspace, setGenerationChoice } = useStore();
  useEffect(() => { if (workspace) setGenerationChoice("sample-subject", { programIds: ["sample-1", "sample-2", "sample-program"], mode: "combined" }); }, [!!workspace, setGenerationChoice]); // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => (document.querySelector('[data-testid="button-open-generate"]') as HTMLButtonElement | null)?.click(), 300); return () => clearTimeout(t); }, []);
  if (!workspace) return null;
  return <SubjectPage id="sample-subject" />;
}
export function Generate() {
  return <WorkspaceProvider><Seeded /></WorkspaceProvider>;
}
