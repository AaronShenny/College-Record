import "./index.css";
import "./app.css";
import { installTauriBridge } from "./lib/tauri-bridge";

async function start() {
  const root = document.getElementById("root")!;
  root.textContent = "Opening Recordly…";
  root.setAttribute("role", "status");
  try {
    await installTauriBridge();
    root.removeAttribute("role");
    await import("./main");
  } catch (error) {
    root.textContent = "";
    const heading = document.createElement("h1");
    heading.textContent = "Recordly could not open";
    const detail = document.createElement("p");
    detail.textContent = typeof error === "string" ? error : error instanceof Error ? error.message :
      "Your records were preserved. Close the old Electron app and retry. No browser storage was used.";
    const retry = document.createElement("button");
    retry.textContent = "Retry"; retry.onclick = () => location.reload();
    root.style.cssText = "max-width:640px;margin:12vh auto;padding:32px";
    root.setAttribute("role", "alert");
    root.append(heading, detail, retry);
  }
}
void start();
