/**
 * MONDAY_TOKEN resolution for the migration CLI.
 *
 * Order (docs/specs/monday-migration/backend.md §2.1):
 *   1. MONDAY_TOKEN in the environment
 *   2. MONDAY_TOKEN in the git-ignored `.env.monday` (cincel-app/)
 *   3. a prompt with hidden input
 *
 * The token is never accepted as a CLI flag, never written to disk and never
 * logged: nothing in this module prints it, and the prompt does not echo it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

export const TOKEN_ENV = "MONDAY_TOKEN";
export const TOKEN_FILE = ".env.monday";

export type TokenSource = "env" | "file" | "prompt";

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

export interface TokenDeps {
  env?: Record<string, string | undefined>;
  /** Returns the file contents, or null when it doesn't exist. */
  readFile?: (path: string) => string | null;
  /** Path of the env file. Defaults to `.env.monday` in the current directory. */
  filePath?: string;
  /** Asks for the token without echoing it. */
  prompt?: (question: string) => Promise<string>;
}

/** Reads one key from a dotenv-style file (KEY=value, optional quotes, # comments). */
export function parseEnvValue(contents: string, key: string): string | undefined {
  let found: string | undefined;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== key) continue;
    let value = m[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    found = value;
  }
  return found;
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Prompts on stderr with hidden input: the question is shown, the typed
 * characters are not.
 */
export function promptHidden(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Promise<string> {
  return new Promise((resolvePrompt, reject) => {
    let muted = false;
    const sink = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) output.write(chunk, encoding as BufferEncoding);
        callback();
      },
    });
    const rl = createInterface({ input, output: sink, terminal: true });
    let answered = false;
    rl.on("close", () => {
      if (!answered) reject(new Error("No monday token entered."));
    });
    rl.question(question, (answer) => {
      answered = true;
      muted = false;
      output.write("\n");
      rl.close();
      resolvePrompt(answer);
    });
    muted = true;
  });
}

/** Resolves the monday API token: env, then `.env.monday`, then a hidden prompt. */
export async function resolveMondayToken(deps: TokenDeps = {}): Promise<ResolvedToken> {
  const env = deps.env ?? process.env;
  const fromEnv = env[TOKEN_ENV]?.trim();
  if (fromEnv) return { token: fromEnv, source: "env" };

  const readFile = deps.readFile ?? readFileOrNull;
  const contents = readFile(deps.filePath ?? resolve(process.cwd(), TOKEN_FILE));
  const fromFile = contents ? parseEnvValue(contents, TOKEN_ENV)?.trim() : undefined;
  if (fromFile) return { token: fromFile, source: "file" };

  const prompt = deps.prompt ?? ((q: string) => promptHidden(q));
  const fromPrompt = (await prompt("monday API token (input hidden): ")).trim();
  if (!fromPrompt) throw new Error("No monday token entered.");
  return { token: fromPrompt, source: "prompt" };
}
