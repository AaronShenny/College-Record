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
  "services/host-workflows.ts", "services/native-session.ts", "services/service-protocol.ts",
  "services/store.ts", "services/drive-sync.ts", "services/google-auth.ts",
  "src/lib/contracts.ts", "src/lib/dashboard-summary.ts", "src/lib/program-checks.ts",
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
