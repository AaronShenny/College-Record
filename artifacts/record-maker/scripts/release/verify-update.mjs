import { createHash, createPublicKey, verify } from "node:crypto";

function decode(value) {
  const text = value.trim();
  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error("Invalid signing data encoding.");
  const bytes = Buffer.from(text, "base64");
  if (bytes.toString("base64") !== text) throw new Error("Non-canonical signing data encoding.");
  return bytes;
}

/**
 * Verify the standard prehashed minisign packets emitted by Tauri.
 * Uses Node/OpenSSL Ed25519 and BLAKE2b, not custom cryptographic primitives.
 * Packet/comment binding follows jedisct1/rust-minisign's verify implementation.
 * The installed app independently verifies again with tauri-plugin-updater.
 */
export function verifyUpdate(bytes, publicKey, signature, version) {
  if (typeof publicKey !== "string" || typeof signature !== "string") throw new Error("Signing inputs are missing.");
  const keyLines = decode(publicKey).toString("utf8").trimEnd().split(/\r?\n/);
  const sigLines = decode(signature).toString("utf8").trimEnd().split(/\r?\n/);
  if (keyLines.length !== 2 || !keyLines[0].startsWith("untrusted comment: ") ||
      sigLines.length !== 4 || !sigLines[0].startsWith("untrusted comment: ") ||
      !sigLines[2].startsWith("trusted comment: ")) throw new Error("Invalid minisign packet.");
  const keyPacket = decode(keyLines[1]);
  const sigPacket = decode(sigLines[1]);
  const globalSignature = decode(sigLines[3]);
  if (keyPacket.length !== 42 || keyPacket.subarray(0, 2).toString() !== "Ed" ||
      sigPacket.length !== 74 || sigPacket.subarray(0, 2).toString() !== "ED" ||
      globalSignature.length !== 64 || !keyPacket.subarray(2, 10).equals(sigPacket.subarray(2, 10))) {
    throw new Error("Unsupported signature or mismatched verification key.");
  }
  const trusted = sigLines[2].slice("trusted comment: ".length);
  const boundVersion = trusted.split("\t").find(field => field.startsWith("version:"))?.slice(8);
  if (boundVersion !== version) throw new Error("Update signature version mismatch.");
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keyPacket.subarray(10)]),
    type: "spki", format: "der",
  });
  const raw = sigPacket.subarray(10);
  const hash = createHash("blake2b512").update(bytes).digest();
  if (!verify(null, hash, key, raw) ||
      !verify(null, Buffer.concat([raw, Buffer.from(trusted, "utf8")]), key, globalSignature)) {
    throw new Error("Update bytes or trusted comment failed signature verification.");
  }
  return true;
}
