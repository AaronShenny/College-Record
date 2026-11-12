import { pageSignals, mark, frames, fail } from "./signals";
async function run() {
  await pageSignals();
  const button = document.getElementById("probe") as HTMLButtonElement;
  let clicked = false;
  button.addEventListener("click", () => { clicked = true; button.textContent = "Local interaction succeeded"; });
  button.click();
  await frames();
  if (!clicked || !button.textContent.includes("succeeded")) throw new Error("Interaction failed");
  await mark("interactionComplete");
  await new Promise(r => setTimeout(r, 250));
  await mark("responsive");
  document.getElementById("status")!.textContent = "Ready. The test closes automatically after collecting memory samples.";
}
void run().catch(fail);
