/** Apply before Electron becomes ready or creates any window. */
export function configureGraphics(
  app: { disableHardwareAcceleration(): void },
  platform: string,
  argv: readonly string[],
) {
  const explicit = argv.includes("--record-maker-disable-gpu");
  const disableGpu = platform === "win32" || explicit;
  if (disableGpu) app.disableHardwareAcceleration();
  return {
    disableGpu,
    graphicsPolicy: explicit ? "launch-flag" : platform === "win32" ? "windows-compatibility-default" : "system-default",
  };
}
