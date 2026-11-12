// Keep this dispatch ahead of normal application imports. Diagnostic mode must
// never import account, record, updater, renderer, or document services.
import { createRequire } from "node:module";

const entryProcessAgeMs = Math.round(process.uptime() * 1000);
const load = createRequire(__filename);
if (process.argv.includes("--record-maker-startup-diagnostic")) {
  try {
    load("./startup-diagnostic.cjs").startDiagnostic(load("electron"), entryProcessAgeMs);
  } catch {
    console.error("Startup diagnostic could not initialize. Check the diagnostic launcher's logs.");
    load("electron").app.exit(2);
  }
} else {
  load("./application.cjs");
}
