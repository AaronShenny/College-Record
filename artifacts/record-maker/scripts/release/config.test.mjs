import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { manifest, repository, feedFor, releaseConfiguration, versionOf } from "./config.mjs";

test("release feed is public HTTPS and rejects malformed repository paths", () => {
  assert.equal(feedFor("owner/Recordly"), "https://github.com/owner/Recordly/releases/latest/download/latest.json");
  for (const input of ["", "../repo", "owner/../repo", "owner/repo?token=x", "https://github.com/o/r", "o/r\n"]) {
    assert.throws(() => repository(input));
  }
});
test("update-enabled configuration requires all verification inputs", () => {
  assert.equal(releaseConfiguration({}).feed, null);
  const valid = { RECORD_MAKER_TAURI_UPDATE_URL: feedFor("o/r"), RECORD_MAKER_TAURI_PUBLIC_KEY: "public",
    RECORD_MAKER_PUBLISHER_NAME: " SignPath Foundation " };
  assert.deepEqual(releaseConfiguration(valid).publisherNames, ["SignPath Foundation"]);
  for (const url of ["http://host/feed", "https://user:pass@host/feed"]) {
    assert.throws(() => releaseConfiguration({ ...valid, RECORD_MAKER_TAURI_UPDATE_URL: url }));
  }
  assert.throws(() => releaseConfiguration({ ...valid, RECORD_MAKER_TAURI_PUBLIC_KEY: "" }));
  assert.throws(() => releaseConfiguration({ ...valid, RECORD_MAKER_PUBLISHER_NAME: "" }));
});
test("manifest requires a version-bound signer output, never an arbitrary path or URL", () => {
  const signature = Buffer.from("untrusted comment: signature\nRWtest\ntrusted comment: timestamp:1\tfile:installer\tversion:0.3.1\ntrusted-signature\n").toString("base64");
  const input = { version: "0.3.1", repo: "o/r", filename: "Recordly-0.3.1-x64-setup.exe", signature };
  const result = manifest(input);
  assert.equal(result.platforms["windows-x86_64"].signature, signature);
  assert.match(result.platforms["windows-x86_64"].url, /\/v0\.3\.1\/Recordly-0\.3\.1-x64-setup.exe$/);
  for (const bad of ["installer.sig", "https://host/signature", Buffer.from("untrusted comment: x\ntrusted comment: version:0.3.0").toString("base64")]) {
    assert.throws(() => manifest({ ...input, signature: bad }));
  }
});
test("all native version sources agree", () => {
  assert.match(versionOf(), /^\d+\.\d+\.\d+$/);
  const root = mkdtempSync(path.join(tmpdir(), "recordly-version-"));
  try {
    mkdirSync(path.join(root, "tauri/src-tauri"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"version":"0.3.0"}');
    writeFileSync(path.join(root, "tauri/src-tauri/tauri.conf.json"), '{"version":"0.3.1"}');
    writeFileSync(path.join(root, "tauri/src-tauri/Cargo.toml"), '[package]\nversion = "0.3.0"\n[dependencies]\n');
    assert.throws(() => versionOf(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("release workflow is manually triggered, signed in two stages, and draft-only", () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, "../../../../.github/workflows/recordly-release.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request_target|pull_request|push):/m);
  assert.match(workflow, /environment: recordly-release/);
  assert.equal((workflow.match(/uses: signpath\/github-action-submit-signing-request@/g) || []).length, 2);
  assert.match(workflow, /--draft/);
  assert.doesNotMatch(workflow, /release edit|--clobber/);
  const finish = readFileSync(new URL("./finish.mjs", import.meta.url), "utf8");
  assert.match(finish, /--no-binary-patching/);
  assert.match(finish, /"--app-version", version/);
});
