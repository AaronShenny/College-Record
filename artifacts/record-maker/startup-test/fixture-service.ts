// Deliberately imports storage only: no Electron, Drive, OAuth, Python, or updates.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { WorkspaceStore } from "../desktop/store";
import { workspaceSchema, type Workspace } from "../src/lib/contracts";
import { dashboardIndex } from "./summary-index";

const uuid = (n: number) => `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const date = "2026-01-01T00:00:00.000Z";
function syntheticImage(seed: number) {
  // Distinct, valid, incompressible-ish images: do not benchmark eighty aliases
  // to one tiny pooled asset and mistake that for screenshot hydration.
  const width = 160, height = 90;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let value = seed + 123456;
  for (let y = 0; y < height; y++) for (let x = 0; x < width * 4; x++) {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    raw[y * (width * 4 + 1) + x + 1] = x % 4 === 3 ? 255 : value & 255;
  }
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4), trailer = Buffer.alloc(4);
    header.writeUInt32BE(data.length); trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, trailer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
export function syntheticWorkspace(): Workspace {
  return workspaceSchema.parse({
    schemaVersion: 1,
    subjects: Array.from({ length: 4 }, (_, s) => ({
      id: uuid(s * 1000 + 1), name: ["Python Lab", "Java Lab", "C Lab", "Data Structures Lab"][s],
      semester: 4, courseCode: `TEST${s + 1}`, updatedAt: date, trashedAt: null,
      template: null, fields: [],
      programs: Array.from({ length: 20 }, (_, p) => ({
        id: uuid(s * 1000 + p * 10 + 2), number: p + 1,
        title: `Synthetic program ${p + 1}`, question: "Startup benchmark data, not student work.",
        createdAt: date, updatedAt: date, trashedAt: null, outputMayBeStale: false,
        sources: [{ id: uuid(s * 1000 + p * 10 + 3), name: `sample${p + 1}.py`,
          role: "Main code", include: true,
          code: Array.from({ length: 80 }, (_, n) => `print("synthetic line ${n + 1}")`).join("\n") }],
        outputs: [{ id: uuid(s * 1000 + p * 10 + 4), kind: "image",
          name: "Synthetic image", dataUrl: syntheticImage(s * 20 + p + 1), include: true },
        { id: uuid(s * 1000 + p * 10 + 5), kind: "text", name: "Synthetic output",
          text: "Example output for startup testing only.", include: true }],
      })),
    })),
  });
}

export async function runService(args: string[]) {
  if (args.length !== 2 || !["--prepare", "--serve"].includes(args[0])) throw new Error("Invalid test invocation");
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error("Windows test directory unavailable");
  const expected = path.join(local, "CollegeRecordMaker-TauriChecks", "fixture-v1");
  if (path.resolve(args[1]) !== path.resolve(expected)) throw new Error("Not a test workspace");
  const base = path.dirname(expected);
  await fs.mkdir(base, { recursive: true });
  // Refuse redirected fixture roots. This engine must never open real app data.
  if (await fs.lstat(expected).then(s => s.isSymbolicLink(), e => {
    if (e.code === "ENOENT") return false; throw e;
  })) throw new Error("Redirected test root");
  await fs.mkdir(expected, { recursive: true });
  if (path.dirname(await fs.realpath(expected)) !== await fs.realpath(base)) throw new Error("Unsafe test root");
  const store = new WorkspaceStore(expected);
  if (args[0] === "--prepare") {
    if (!await store.pointer()) await store.save(syntheticWorkspace());
    const workspace = await store.load();
    if (JSON.stringify(workspace) !== JSON.stringify(syntheticWorkspace())) throw new Error("Unexpected fixture content");
    const pointer = await store.pointer();
    if (!pointer) throw new Error("Fixture pointer unavailable");
    const index = dashboardIndex(workspace, pointer.revisionId);
    const temp = path.join(expected, `dashboard-index-${randomUUID()}.tmp`);
    await fs.writeFile(temp, JSON.stringify(index), { flag: "wx" });
    try { await fs.rename(temp, path.join(expected, "dashboard-index-v2.json")); }
    finally { await fs.rm(temp, { force: true }); }
    console.log(JSON.stringify({ ok: true, subjects: 4, programs: 80, fixtureVersion: 2 }));
    return;
  }
  if (!await store.pointer()) throw new Error("Run preparation before measuring startup");
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of reader) {
    if (line !== "load") throw new Error("Unsupported test request");
    const processAgeAtRequestMs = Math.round(process.uptime() * 1000);
    const started = performance.now();
    const workspace = await store.load();
    const storeLoadMs = Math.round(performance.now() - started);
    const encoding = performance.now();
    const data = JSON.stringify(workspace);
    const serializeMs = Math.round(performance.now() - encoding);
    // One bounded protocol response; metrics contain no filenames or content.
    console.log('{"ok":true,"workspace":' + data + ',"timings":' +
      JSON.stringify({ processAgeAtRequestMs, storeLoadMs, serializeMs }) + '}');
  }
}
if (process.argv[2] === "--prepare" || process.argv[2] === "--serve") {
  runService(process.argv.slice(2)).catch(() => {
    console.log(JSON.stringify({ ok: false, error: "Synthetic fixture unavailable. Run Prepare-Test.cmd." }));
    process.exitCode = 2;
  });
}
