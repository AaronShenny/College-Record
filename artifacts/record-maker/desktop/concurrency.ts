/** Bounded I/O, ordered results. Settle in-flight writes before rejecting so
 * callers cannot remove staging directories while another write is finishing. */
export async function mapConcurrent<T, R>(items: readonly T[], run: (item: T) => Promise<R>, limit = 3): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0, failed = false, failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await run(items[index]); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
  return results;
}
