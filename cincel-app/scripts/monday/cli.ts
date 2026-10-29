/**
 * monday.com migration CLI — entry point for `npm run monday -- <command>`.
 * Dispatch lives in ./run.ts; run with no command for usage.
 */
import { run } from "./run";

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`monday: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
