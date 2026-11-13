import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyUpdate } from "./verify-update.mjs";

// Ephemeral test-only keys. Never generated for or reused by production releases.
function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const bytes = Buffer.from("test installer bytes");
  const id = Buffer.from("0001020304050607", "hex");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const keyText = `untrusted comment: test key\n${Buffer.concat([Buffer.from("Ed"), id, pub]).toString("base64")}\n`;
  const raw = sign(null, createHash("blake2b512").update(bytes).digest(), privateKey);
  const trusted = "timestamp:1\tfile:installer.exe\tversion:0.3.1";
  const packet = Buffer.concat([Buffer.from("ED"), id, raw]).toString("base64");
  const global = sign(null, Buffer.concat([raw, Buffer.from(trusted)]), privateKey).toString("base64");
  const text = `untrusted comment: signature\n${packet}\ntrusted comment: ${trusted}\n${global}\n`;
  return { bytes, key: Buffer.from(keyText).toString("base64"), signature: Buffer.from(text).toString("base64") };
}
test("release verifier checks installer bytes, public key and authenticated version comment", () => {
  const f = fixture();
  assert.equal(verifyUpdate(f.bytes, f.key, f.signature, "0.3.1"), true);
  assert.throws(() => verifyUpdate(Buffer.from("modified installer"), f.key, f.signature, "0.3.1"));
  assert.throws(() => verifyUpdate(f.bytes, fixture().key, f.signature, "0.3.1"));
  assert.throws(() => verifyUpdate(f.bytes, f.key, f.signature, "0.3.2"));
  const changed = Buffer.from(Buffer.from(f.signature, "base64").toString().replace("version:0.3.1", "version:0.3.2")).toString("base64");
  assert.throws(() => verifyUpdate(f.bytes, f.key, changed, "0.3.2"));
  for (const bad of ["https://host/key", "bad", Buffer.from("untrusted comment: fake").toString("base64")]) {
    assert.throws(() => verifyUpdate(f.bytes, bad, f.signature, "0.3.1"));
  }
});
