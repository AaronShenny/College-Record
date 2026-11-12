import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CredentialUnlockError, GoogleAccount } from "./google-auth";

test("an unavailable asynchronous native vault cannot persist plaintext credentials", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-async-vault-"));
  let encryptions = 0;
  try {
    const account = new GoogleAccount(path.join(root, "credentials"), {
      available: async () => false,
      encrypt: async text => { encryptions++; return Buffer.from(text); },
      decrypt: async bytes => bytes.toString(),
    }, async () => {});
    await assert.rejects(account.configure({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "fixture" } }), /unavailable/);
    assert.equal(encryptions, 0);
    await assert.rejects(fs.access(path.join(root, "credentials/google-client.bin")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("repeated and concurrent Drive requests do not re-encrypt unchanged Google credentials", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-token-"));
  let writes = 0;
  try {
    const account = new GoogleAccount(root, {
      available: () => true, encrypt: text => { writes++; return Buffer.from(text); }, decrypt: bytes => bytes.toString(),
    }, async () => {});
    // Fake the provider, not the storage code: exercise the actual encryption
    // and atomic persistence path without using a real Google account.
    const client = { credentials: { access_token: "fixture-token", expiry_date: 9999999999999 },
      getAccessToken: async () => ({ token: "fixture-token" }) };
    (account as any).client = client;
    account.identity = { sub: "fixture", email: "fixture@rajagiri.edu", name: "Fixture" };
    await Promise.all(Array.from({ length: 30 }, () => account.token()));
    assert.equal(writes, 1);
    client.credentials = { ...client.credentials, access_token: "refreshed-fixture-token" };
    await Promise.all(Array.from({ length: 30 }, () => account.token()));
    assert.equal(writes, 2, "new credentials must still be securely persisted");
    await account.clear();
    await assert.rejects(account.token(), /Connect/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("credential unlock failure is identifiable and does not expose or remove stored bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-auth-"));
  try {
    const directory = path.join(root, "credentials");
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "google-client.bin"), "encrypted-fixture");
    const account = new GoogleAccount(directory, {
      available: () => true,
      encrypt: text => Buffer.from(text),
      decrypt: () => { throw new Error("sensitive-provider-detail"); },
    }, async () => {});
    await assert.rejects(account.initialize(), error =>
      error instanceof CredentialUnlockError && !error.message.includes("sensitive-provider-detail"));
    assert.equal(await fs.readFile(path.join(directory, "google-client.bin"), "utf8"), "encrypted-fixture");
    assert.equal(account.identity, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("confirmed recovery preserves encrypted credentials and leaves account workspaces untouched", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-auth-"));
  try {
    const directory = path.join(root, "credentials");
    const workspace = path.join(root, "workspaces", "account-existing");
    await fs.mkdir(directory);
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(path.join(workspace, "pending-work.json"), "unsynced-fixture");
    await fs.writeFile(path.join(directory, "google-client.bin"), "locked-client");
    await fs.writeFile(path.join(directory, "google-session.bin"), "locked-session");
    const account = new GoogleAccount(directory, {
      available: () => true, encrypt: text => Buffer.from(text), decrypt: bytes => bytes.toString(),
    }, async () => {});
    await account.recoverLockedCredentials();
    const backups = (await fs.readdir(root)).filter(name => name.startsWith("credentials.recovery-"));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(root, backups[0], "google-session.bin"), "utf8"), "locked-session");
    assert.equal(await fs.readFile(path.join(root, backups[0], "google-client.bin"), "utf8"), "locked-client");
    assert.equal(await fs.readFile(path.join(workspace, "pending-work.json"), "utf8"), "unsynced-fixture");
    assert.equal(account.configured, false);
    assert.equal(account.key, null);
    await account.configure({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "fixture" } });
    assert.equal(account.configured, true);
    assert.equal(await fs.readFile(path.join(root, backups[0], "google-session.bin"), "utf8"), "locked-session");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
