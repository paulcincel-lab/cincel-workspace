/**
 * monday.com migration CLI — entry point for `npm run monday -- <command>`.
 *
 * Commands (see docs/specs/monday-migration/backend.md §2.1):
 *   export   --out exports/<client> [--boards 123,456] [--no-files] [--no-updates]
 *   init     --export exports/<client>
 *   plan     --export exports/<client>
 *   apply    --export exports/<client> --by <staff email>
 *   rollback --batch <import_batch_id> [--drive-only]
 *
 * The commands themselves are not wired up yet; this entry only prints usage.
 */

const USAGE = `Usage: npm run monday -- <command> [options]

Commands:
  export    --out exports/<client> [--boards 123,456] [--no-files] [--no-updates]
  init      --export exports/<client>
  plan      --export exports/<client>
  apply     --export exports/<client> --by <staff email>
  rollback  --batch <import_batch_id> [--drive-only]
`;

function main(argv: string[]): number {
  const [command] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  process.stderr.write(`monday: command "${command}" is not available yet.\n\n${USAGE}`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
