import { loadEnvConfig } from "@next/env";
import { maintenance } from "../src/platform/maintenance";
loadEnvConfig(process.cwd());
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
  });
async function main() {
  do {
    try {
      await maintenance();
    } catch (e) {
      console.error(
        "Maintenance failed:",
        e instanceof Error ? e.name : "UnknownError",
      );
    }
    if (process.argv.includes("--once") || stopping) break;
    await new Promise((r) => setTimeout(r, 30000));
  } while (!stopping);
}
main().catch(() => {
  process.exitCode = 1;
});
