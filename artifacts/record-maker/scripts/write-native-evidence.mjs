import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "tauri/service-host.ts", "tauri/service-host.test.ts", "tauri/src-tauri/Cargo.toml",
  "tauri/src-tauri/Cargo.lock", "tauri/src-tauri/src/lib.rs", "tauri/src-tauri/src/protocol.rs",
  "tauri/src-tauri/src/service.rs", "tauri/src-tauri/src/vault.rs", "tauri/src-tauri/src/summary.rs",
  "tauri/src-tauri/src/runtime_paths.rs", "tauri/src-tauri/src/saved_session.rs",
  "tauri/src-tauri/src/close_policy.rs",
  "tauri/src-tauri/src/legacy_cache.rs", "tauri/src-tauri/src/app/mod.rs",
  "tauri/src-tauri/src/app/startup.rs", "tauri/src-tauri/src/app/adapters.rs",
  "tauri/src-tauri/src/app/updates.rs", "tauri/src-tauri/tauri.conf.json",
  "src/lib/tauri-bridge.ts", "src/components/startup-dashboard.tsx", "src/tauri-main.ts",
  "services/host-workflows.ts", "services/native-session.ts", "services/service-protocol.ts",
  "services/store.ts", "services/drive-sync.ts", "services/google-auth.ts",
  "services/local-transaction.ts", "services/download-inventory.ts", "services/processing.ts",
  "services/download-activation.test.ts", "services/sync.test.ts", "services/google-auth.test.ts",
  "src/hooks/use-workspace.tsx", "src/lib/workflow-api.ts",
  "src/lib/contracts.ts", "src/lib/dashboard-summary.ts", "src/lib/program-checks.ts",
  "src/lib/subject-configuration.ts", "src/components/subject-config.tsx", "src/components/index-setup.tsx",
  "src/components/close-progress.tsx", "src/components/cloud-panel.tsx", "src/pages/editor.tsx",
  "services/recordly.test.ts", "python/index_table.py", "python/test_recordly_index.py",
  "public/recordly-logo.svg", "public/recordly-logo.png", "public/recordly-icon.ico",
];
const sourceHashes = {};
for (const filename of files) sourceHashes[filename] = createHash("sha256").update(await fs.readFile(path.join(root, filename))).digest("hex");
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false });
if (revision.status !== 0) throw new Error("Could not identify the checked-out source revision.");
const destination = path.resolve(root, "../../generated-artifacts/tauri-foundation");
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(path.join(destination, "verification-context.json"), JSON.stringify({
  purpose: "Native migration foundation checks, not a release or startup acceptance result",
  gitRevision: revision.stdout.trim(), platform: process.platform, osRelease: os.release(),
  architecture: process.arch, nodeVersion: process.versions.node, sourceHashes,
}, null, 2));
