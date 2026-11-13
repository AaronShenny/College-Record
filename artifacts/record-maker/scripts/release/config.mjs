import fs from "node:fs";
import path from "node:path";

export const appRoot = path.resolve(import.meta.dirname, "../..");
export const workspaceRoot = path.resolve(appRoot, "../..");
export function versionOf(root = appRoot) {
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Production releases require a stable X.Y.Z version.");
  }
  const config = JSON.parse(fs.readFileSync(path.join(root, "tauri/src-tauri/tauri.conf.json"), "utf8"));
  const cargo = fs.readFileSync(path.join(root, "tauri/src-tauri/Cargo.toml"), "utf8").split("[dependencies]")[0];
  if (config.version !== version || !cargo.includes(`version = "${version}"`)) {
    throw new Error("App, Tauri and Cargo versions must match.");
  }
  return version;
}
export function repository(value) {
  if (typeof value !== "string" || value !== value.trim() || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value || "") ||
      value.split("/").some(s => s === "." || s === "..")) throw new Error("A valid GitHub owner/repository is required.");
  return value;
}
export function feedFor(repo) {
  return `https://github.com/${repository(repo)}/releases/latest/download/latest.json`;
}
export function releaseConfiguration(env) {
  const feed = env.RECORD_MAKER_TAURI_UPDATE_URL || null;
  const publicKey = env.RECORD_MAKER_TAURI_PUBLIC_KEY || null;
  const publisherNames = (env.RECORD_MAKER_PUBLISHER_NAME || "").split(";").map(s => s.trim()).filter(Boolean);
  if (!feed) return { feed, publicKey, publisherNames };
  const url = new URL(feed);
  if (url.protocol !== "https:" || url.username || url.password || !publicKey || !publisherNames.length) {
    throw new Error("Updates require an HTTPS feed, public key and approved publisher names.");
  }
  return { feed, publicKey, publisherNames };
}
export function manifest({ version, repo, filename, signature }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || filename !== `Recordly-${version}-x64-setup.exe`) {
    throw new Error("Invalid release version or installer name.");
  }
  // Tauri's signer emits base64-encoded minisign text, not a URL/path.
  const decoded = Buffer.from(signature.trim(), "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:") || !decoded.includes("\ntrusted comment:") ||
      !new RegExp(`version:${version.replaceAll(".", "\\.")}(?:\\t|\\r?\\n|$)`).test(decoded)) {
    throw new Error("The installer needs a version-bound Tauri signature.");
  }
  return {
    version, notes: `Recordly ${version}. See the release notes and code signing policy.`,
    pub_date: new Date().toISOString(),
    platforms: { "windows-x86_64": {
      signature: signature.trim(),
      url: `https://github.com/${repository(repo)}/releases/download/v${version}/${filename}`,
    } },
  };
}
