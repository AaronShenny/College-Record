import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveInside } from "./store";

const document = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(500), format: z.enum(["docx", "pdf"]),
  subjectId: z.string().uuid(), programIds: z.array(z.string().uuid()).max(500),
  createdAt: z.string().datetime(), byteLength: z.number().int().nonnegative(),
});
async function metadata(filename: string) {
  if ((await fs.stat(filename)).size > 16 * 1024 * 1024) throw new Error("Incoming inventory metadata exceeds the supported limit.");
  return JSON.parse(await fs.readFile(filename, "utf8"));
}
/** Validate references in the staged inventory, not just the editable record
 * graph. A generated index must never acknowledge files that were not received. */
export async function validateIncomingInventory(root: string) {
  try {
    const index = path.join(root, "generated/index.json");
    let docs: z.infer<typeof document>[] = [];
    try { docs = z.array(document).max(20_000).parse(await metadata(index)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const ids = new Set<string>();
    for (const doc of docs) {
      if (ids.has(doc.id) || path.basename(doc.name) !== doc.name || /[\\/:]/.test(doc.name) ||
          !doc.name.endsWith(`.${doc.format}`)) throw new Error("Invalid generated document reference");
      ids.add(doc.id);
      const stat = await fs.stat(resolveInside(root, `generated/${doc.id}/${doc.name}`));
      // Creation size is display metadata: an owner may have resaved the file
      // in Word. Download integrity is checked against its immutable byte hash.
      if (!stat.isFile()) throw new Error("Missing generated document");
    }
    let names: string[] = [];
    try { names = await fs.readdir(path.join(root, "imports"), { recursive: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const name of names.filter(name => path.basename(name) === "import.json")) {
      const info = await metadata(path.join(root, "imports", name));
      if (!info || typeof info.name !== "string" || /[\\/:]/.test(info.name) || !info.name ||
          !Number.isFinite(Date.parse(info.importedAt))) throw new Error("Invalid archived import reference");
      if (!(await fs.stat(path.join(root, "imports", path.dirname(name), info.name))).isFile()) throw new Error("Missing archived import");
    }
  } catch {
    throw new Error("The incoming generated/import inventory is incomplete or invalid. Nothing was activated or acknowledged; cached files were preserved.");
  }
}
