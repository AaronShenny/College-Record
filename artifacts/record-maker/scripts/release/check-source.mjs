import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const suspicious = files.filter(file =>
  /(^|\/)\.env(?:\.|$)/i.test(file) ||
  /\.(pfx|p12|pem|key|keystore|jsonl)$/i.test(file) ||
  /(?:google-client|credentials|refresh-token|performance-log)\.json$/i.test(file) ||
  (file.startsWith("attached_assets/") && file !== "attached_assets/pdf_to_qns_1793905163999.py"));
if (suspicious.length) {
  console.error("Remove sensitive/user files from the public source set before release:", suspicious.join("\n"));
  process.exit(1);
}
console.log("Tracked-file name check passed. This is not a full secret or Git history audit.");
