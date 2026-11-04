import { createMondayClient, type FetchLike, type MondayClient } from "@/scripts/monday/client";

/**
 * Fake monday API used with `MONDAY_FAKE=1` (local e2e only): it answers with the CLI fixture account
 * (scripts/monday/__fixtures__/export-account.json) whatever the token, and never calls monday.
 */

type Fixture = Record<string, unknown>;

let fixture: Promise<Fixture> | null = null;
const loadFixture = () =>
  (fixture ??= import("@/scripts/monday/__fixtures__/export-account.json").then((m) => m.default as Fixture));

const fakeFetch: FetchLike = async (_url, init) => {
  const f = await loadFixture();
  const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
  const op = /^\s*query\s+(\w+)/m.exec(body.query)?.[1] ?? "?";
  let reply: unknown;
  switch (op) {
    case "Me":
      reply = f.me;
      break;
    case "Boards":
      reply = f.boards;
      break;
    case "SubitemColumns":
      reply = f.subitemColumns;
      break;
    case "Users":
      reply = f.users;
      break;
    case "Workspaces":
      reply = f.workspaces;
      break;
    case "FirstPage":
      reply = (body.variables.board as string[])[0] === "101" ? f.classicFirstPage : f.multiLevelFirstPage;
      break;
    case "NextPage":
      reply = f.classicNextPage;
      break;
    case "Updates":
      reply = { data: { items: (body.variables.ids as string[]).map((id) => ({ id, updates: [] })) } };
      break;
    case "Assets":
      reply = { data: { assets: [] } };
      break;
    default:
      reply = { errors: [{ message: `fake monday: unexpected query ${op}` }] };
  }
  return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) };
};

/** Whether the wizard should talk to the fake monday API. */
export const isMondayFake = (env: NodeJS.ProcessEnv = process.env) => env.MONDAY_FAKE === "1";

export function createFakeMondayClient(token: string): MondayClient {
  return createMondayClient({ token, fetch: fakeFetch, sleep: async () => {} });
}
