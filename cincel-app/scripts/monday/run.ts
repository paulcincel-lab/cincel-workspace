/**
 * Command dispatch for the monday migration CLI (scripts/monday/cli.ts).
 *
 * Commands (docs/specs/monday-migration/backend.md §2.1):
 *   export   --out exports/<client> [--boards 123,456] [--no-files] [--no-updates]
 *   init     --export exports/<client>
 *   plan     --export exports/<client>
 *   apply    --export exports/<client> --by <staff email>
 *   rollback --batch <import_batch_id> [--drive-only]
 *
 * Each command is a handler in COMMANDS; the ones not built yet exit with a
 * "not implemented yet" message.
 */

export const USAGE = `Usage: npm run monday -- <command> [options]

Commands:
  export    --out exports/<client> [--boards 123,456] [--no-files] [--no-updates]
  init      --export exports/<client>
  plan      --export exports/<client>
  apply     --export exports/<client> --by <staff email>
  rollback  --batch <import_batch_id> [--drive-only]

The monday API token is read from MONDAY_TOKEN (environment or the
git-ignored .env.monday), otherwise it is asked for with hidden input.
It is never accepted as a command-line flag.
`;

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export type CommandHandler = (args: string[], io: CliIo) => Promise<number>;

export const COMMAND_NAMES = ["export", "init", "plan", "apply", "rollback"] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

function notImplemented(name: CommandName): CommandHandler {
  return async (_args, io) => {
    io.stderr(`monday: "${name}" is not implemented yet.\n`);
    return 2;
  };
}

export const COMMANDS: Record<CommandName, CommandHandler> = {
  export: notImplemented("export"),
  init: notImplemented("init"),
  plan: notImplemented("plan"),
  apply: notImplemented("apply"),
  rollback: notImplemented("rollback"),
};

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function isCommand(name: string): name is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(name);
}

/** Runs one CLI invocation and returns the process exit code. */
export async function run(
  argv: string[],
  io: CliIo = defaultIo,
  commands: Record<CommandName, CommandHandler> = COMMANDS,
): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.stdout(USAGE);
    return 0;
  }
  if (!isCommand(command)) {
    io.stderr(`monday: unknown command "${command}".\n\n${USAGE}`);
    return 1;
  }
  if (args.some((a) => a === "--token" || a.startsWith("--token="))) {
    io.stderr(
      "monday: the token is never passed as a flag. Set MONDAY_TOKEN in .env.monday or enter it when asked.\n",
    );
    return 1;
  }
  return commands[command](args, io);
}
