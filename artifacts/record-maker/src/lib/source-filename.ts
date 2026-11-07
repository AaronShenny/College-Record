/** A source's display name must also be usable in Windows file dialogs. */
export function sourceNameError(name: string): string {
  if (!name.trim()) return "File name is required.";
  if (name.length > 200) return "File name is too long.";
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return "Use a Windows file name without paths or < > : \" | ? * characters.";
  if (/[. ]$/.test(name)) return "A Windows file name cannot end in a dot or space.";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return "This name is reserved by Windows. Choose another file name.";
  return "";
}
