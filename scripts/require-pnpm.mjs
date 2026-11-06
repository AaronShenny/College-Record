import { rmSync } from "node:fs";

// Native Windows installations do not necessarily have sh/rm on PATH.
if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
for (const name of ["package-lock.json", "yarn.lock"]) {
  rmSync(new URL(`../${name}`, import.meta.url), { force: true });
}
