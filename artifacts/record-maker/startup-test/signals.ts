type NativeWindow = Window & { __TAURI__?: { core?: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } } };
export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const native = (window as NativeWindow).__TAURI__?.core?.invoke;
  if (!native) return Promise.reject(new Error("Native startup bridge missing; browser fallback is disabled."));
  return native<T>(command, args);
}
export const mark = (stage: string) => invoke<string>("probe", { stage });
export const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
export const waitFor = async <T>(read: () => T, limit = 20_000): Promise<NonNullable<T>> => {
  const start = performance.now();
  while (performance.now() - start < limit) {
    const result = read();
    if (result) return result as NonNullable<T>;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("The expected interactive screen did not appear.");
};
export async function pageSignals() {
  await mark("scriptReady");
  const chromium = /Chrome\/([0-9.]+)/.exec(navigator.userAgent)?.[1];
  if (chromium) await invoke("browser_version", { version: chromium });
  if (document.readyState === "loading") await new Promise<void>(r => document.addEventListener("DOMContentLoaded", () => r(), { once: true }));
  await mark("domReady");
  if (document.readyState !== "complete") await new Promise<void>(r => window.addEventListener("load", () => r(), { once: true }));
  await mark("loadFinished");
  await frames();
  // A frame opportunity is not a compositor/screenshot first-paint measurement.
  await mark("paintFrames");
}
export async function fail() {
  const status = document.getElementById("test-status") || document.getElementById("status");
  if (status) status.textContent = "Startup test failed. Share this run's diagnostic files.";
  await mark("pageError").catch(() => undefined);
}
window.addEventListener("error", () => { void fail(); });
window.addEventListener("unhandledrejection", () => { void fail(); });
