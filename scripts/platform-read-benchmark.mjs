// Bounded read-only smoke/load test. Loopback only: never targets a public server.
import { performance } from "node:perf_hooks";
const base = new URL(process.argv[2] || "http://127.0.0.1:3000");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  throw new Error("A loopback HTTP origin is required");
const paths = [
  "/api/health",
  "/api/platform/club",
  "/api/platform/merchants",
  "/api/platform/catalog",
];
const durations = [];
let failures = 0,
  cursor = 0;
const total = 120,
  concurrency = 6,
  started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (cursor < total) {
      const index = cursor++,
        begin = performance.now();
      try {
        const res = await fetch(new URL(paths[index % paths.length], base), {
          signal: AbortSignal.timeout(5000),
        });
        await res.arrayBuffer();
        if (!res.ok) failures++;
      } catch {
        failures++;
      }
      durations.push(performance.now() - begin);
    }
  }),
);
durations.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    requests: total,
    concurrency,
    failures,
    elapsedMs: Math.round(performance.now() - started),
    p50Ms: Math.round(durations[Math.floor(total * 0.5)]),
    p95Ms: Math.round(durations[Math.floor(total * 0.95)]),
    scope: "local read endpoints; not a production capacity estimate",
  }),
);
if (failures) process.exitCode = 1;
