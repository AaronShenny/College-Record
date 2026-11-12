import type { DesktopBridge, Workspace } from "../src/lib/contracts";
import { frames, invoke, mark, pageSignals, waitFor, fail } from "./signals";

const unavailable = async (): Promise<never> => { throw new Error("Disabled in startup comparison; real files and Drive are never accessed."); };
let load: Promise<Workspace> | undefined;
const bridge: DesktopBridge = Object.freeze({
  getRuntime: async () => ({
    mode: "desktop" as const, version: "startup-test-0.1.0", platform: "win32",
    storageLabel: "Isolated synthetic benchmark", driveConnected: false, pythonAvailable: false,
    requiresSignIn: false, workspaceRevision: "synthetic-v1", workspaceAccount: null,
  }),
  loadWorkspace: () => load ||= invoke<Workspace>("load_fixture"),
  saveWorkspace: unavailable, importSource: unavailable, pasteImage: unavailable,
  checkPython: unavailable, inspectSnapshot: unavailable,
  workflow: async (action: string) => {
    if (action === "cloud-status") return { connected: false, configured: false, busy: false,
      pending: false, state: "local", revision: "synthetic-v1" };
    throw new Error("This startup comparison has no production workflow access.");
  },
});
// Install BEFORE importing the real UI, so its bridge cannot select IndexedDB.
Object.defineProperty(window, "recordMaker", { value: bridge, writable: false });

async function run() {
  await pageSignals();
  const [{ createRoot }, { WorkspaceProvider }, { default: Dashboard }] = await Promise.all([
    import("react-dom/client"), import("../src/hooks/use-workspace"), import("../src/pages/dashboard"),
    import("../src/index.css"), import("../src/app.css"),
  ]);
  createRoot(document.getElementById("root")!).render(<WorkspaceProvider><Dashboard /></WorkspaceProvider>);
  const button = await waitFor(() => document.querySelector<HTMLButtonElement>('[data-testid="button-new-subject"]'));
  const rows = document.querySelectorAll('[data-testid^="link-subject-"]');
  if (rows.length !== 4) throw new Error("Synthetic dashboard was not rendered");
  await frames();
  await mark("dashboardPainted");
  button.click();
  await waitFor(() => document.querySelector('[data-testid="input-subject-name"]'));
  const cancel = document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-subject"]');
  if (!cancel) throw new Error("Real dashboard interaction failed");
  cancel.click();
  await waitFor(() => !document.querySelector('[data-testid="input-subject-name"]'));
  await frames();
  await mark("interactionComplete");
  await new Promise(r => setTimeout(r, 250));
  await mark("responsive");
  document.getElementById("test-status")!.textContent = "ISOLATED TEST · 4 subjects / 80 programs loaded · Dashboard interaction passed";
}
void run().catch(fail);
