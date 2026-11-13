import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// All storage and document services in the account's owned process share this
// boundary. Network/Python work must run outside it; only capture/activation and
// local inventory mutations belong here.
const queues = new Map<string, Promise<unknown>>();
const context = new AsyncLocalStorage<Map<string, { active: boolean }>>();
const key = (root: string) => process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
const journalName = "_incoming-activation";
const directories = ["generated", "imports"] as const;
type Journal = {
  version: 1; phase: "prepared" | "committed";
  oldDirectories: Record<string, boolean>;
  metadata: Record<string, unknown | null>;
};
async function exists(filename: string) {
  try { await fs.lstat(filename); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export async function writeAtomicJson(filename: string, value: unknown) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await fs.open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
  finally { await file.close(); }
  try { await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, { force: true }); }
}
async function retire(root: string) {
  const old = path.join(root, journalName);
  const retired = path.join(root, `_finished-activation-${randomUUID()}`);
  // Rename BEFORE recursive cleanup: interruption cannot erase the recovery
  // marker while leaving an active, ambiguous journal behind.
  await fs.rename(old, retired);
  await fs.rm(retired, { recursive: true, force: true }).catch(() => undefined);
}
async function recover(root: string) {
  const folder = path.join(root, journalName), marker = path.join(folder, "transaction.json");
  if (!await exists(folder)) return;
  let journal: Journal;
  try { journal = JSON.parse(await fs.readFile(marker, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" &&
        !await exists(path.join(folder, "old-generated")) && !await exists(path.join(folder, "old-imports"))) {
      await retire(root); return; // Preparation failed before any live rename.
    }
    throw new Error("Incoming-sync recovery metadata is unreadable. All copies were preserved; do not reset this cache.");
  }
  if (journal.version !== 1 || !["prepared", "committed"].includes(journal.phase) ||
      !journal.oldDirectories || !journal.metadata ||
      directories.some(dir => typeof journal.oldDirectories[dir] !== "boolean") ||
      !["current.json", "sync-state.json"].every(name => Object.hasOwn(journal.metadata, name))) {
    throw new Error("Incoming-sync recovery metadata is invalid. All copies were preserved.");
  }
  if (journal.phase === "prepared") {
    for (const dir of directories) {
      const backup = path.join(folder, `old-${dir}`), live = path.join(root, dir);
      if (await exists(backup)) {
        await fs.rm(live, { recursive: true, force: true });
        await fs.rename(backup, live);
      } else if (!journal.oldDirectories[dir]) {
        await fs.rm(live, { recursive: true, force: true });
      }
    }
    for (const name of ["current.json", "sync-state.json"]) {
      if (journal.metadata[name] === null) await fs.rm(path.join(root, name), { force: true });
      else await writeAtomicJson(path.join(root, name), journal.metadata[name]);
    }
  }
  await retire(root);
}
export function inLocalTransaction(root: string) { return context.getStore()?.get(key(root))?.active === true; }
export async function localTransaction<T>(root: string, work: () => Promise<T>): Promise<T> {
  const id = key(root);
  if (inLocalTransaction(root)) return work();
  const previous = queues.get(id) ?? Promise.resolve();
  const ticket = { active: true };
  const operation = previous.catch(() => undefined).then(() => {
    const inherited = new Map(context.getStore()); inherited.set(id, ticket);
    return context.run(inherited, async () => {
      try { await recover(root); return await work(); }
      finally { ticket.active = false; }
    });
  });
  const tail = operation.catch(() => undefined);
  queues.set(id, tail);
  try { return await operation; }
  finally { if (queues.get(id) === tail) queues.delete(id); }
}
/** Called only under the account boundary, after the original revision AND
 * inventory have been checked. Incoming directories are complete before entry. */
export async function activateIncoming(root: string, incoming: string, pointer: unknown, sync: unknown, abort?: AbortSignal) {
  if (!inLocalTransaction(root)) throw new Error("Incoming activation requires the local mutation boundary.");
  const folder = path.join(root, journalName);
  const metadata: Record<string, unknown | null> = {};
  const oldDirectories: Record<string, boolean> = {};
  for (const name of ["current.json", "sync-state.json"]) {
    const filename = path.join(root, name);
    metadata[name] = await exists(filename) ? JSON.parse(await fs.readFile(filename, "utf8")) : null;
  }
  for (const dir of directories) oldDirectories[dir] = await exists(path.join(root, dir));
  const journal: Journal = { version: 1, phase: "prepared", oldDirectories, metadata };
  await fs.mkdir(folder); // No merge with an unresolved transaction.
  await writeAtomicJson(path.join(folder, "transaction.json"), journal);
  try {
    for (const dir of directories) {
      abort?.throwIfAborted();
      if (oldDirectories[dir]) await fs.rename(path.join(root, dir), path.join(folder, `old-${dir}`));
      await fs.rename(path.join(incoming, dir), path.join(root, dir));
    }
    abort?.throwIfAborted();
    await writeAtomicJson(path.join(root, "current.json"), pointer);
    await writeAtomicJson(path.join(root, "sync-state.json"), sync);
    abort?.throwIfAborted();
    await writeAtomicJson(path.join(folder, "transaction.json"), { ...journal, phase: "committed" });
  } catch (error) {
    // If rollback itself is interrupted/fails, the durable journal blocks all
    // subsequent reads/writes until it can be resumed, including after restart.
    await recover(root);
    throw error;
  }
  await retire(root);
}
