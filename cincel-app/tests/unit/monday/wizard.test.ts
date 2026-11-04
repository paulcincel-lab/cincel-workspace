// @vitest-environment node
/**
 * The monday import wizard's server side (#672, lib/monday-import/*): the CLI
 * steps used as a library against a run folder.
 *
 * Runs with the CLI fixtures: export-account.json behind a fake monday API
 * for Conectar and the export, translate-nested-export.json written out as an
 * export folder for the preview. The apply → rollback flow needs
 * TEST_DATABASE_URL and runs in a transaction that is rolled back.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import type { DriveAdmin } from "@/lib/google/drive-admin";
import type { ImportDb } from "@/lib/import/refs";
import {
  createRun,
  isRunId,
  jobView,
  readRun,
  runDir,
  startJob,
  updateRun,
  waitForJob,
} from "@/lib/monday-import/runs";
import {
  checkRollback,
  connectMonday,
  getExportSource,
  getOptionsInfo,
  getRunState,
  importedProjects,
  mergeDraft,
  previewImport,
  resolveWizardToken,
  saveDraft,
  startApply,
  startExport,
  startRollback,
  uploadDraft,
  WizardError,
  type WizardDeps,
} from "@/lib/monday-import/service";
import { FIRST_LOGIN_WIZARD_ROUTES } from "@/lib/onboarding/first-login";
import accountFixture from "@/scripts/monday/__fixtures__/export-account.json";
import { createMondayClient, type FetchLike } from "@/scripts/monday/client";
import type { InitLookups } from "@/scripts/monday/init";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { PlanLookups } from "@/scripts/monday/plan";

import { fakeDrive, nestedMapping, writeExportFolder } from "./apply-fixtures";

const TOKEN = "secret-token-xyz";
const ANA = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "33333333-3333-4333-8333-333333333333";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** The export-account.json monday account; records every token it was called with. */
function fakeMonday() {
  const tokens: string[] = [];
  const fetch: FetchLike = async (_url, init) => {
    tokens.push(init.headers.Authorization ?? "");
    const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
    const op = /^\s*query\s+(\w+)/m.exec(body.query)?.[1] ?? "?";
    const f = accountFixture as unknown as Record<string, unknown>;
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
        throw new Error(`unexpected query ${op}`);
    }
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) };
  };
  return { tokens, createClient: (token: string) => createMondayClient({ token, fetch, sleep: async () => {} }) };
}

const noInitMatches: InitLookups = {
  staffByEmail: async () => new Map(),
  customStatuses: async () => new Map(),
  matchClient: async () => null,
  contactsByName: async () => new Map(),
  matchArea: async () => null,
  areaWorkflows: async () => [],
  templateCandidates: async () => [],
};

/** Plan lookups of an empty Cincel with Ana and the client of nestedMapping. */
const planLookups: PlanLookups = {
  translateLookups: async () => ({ customStatuses: {}, templates: {}, staff: { [ANA]: { name: "Ana" } } }),
  importedRefs: async () => new Map(),
  importedAssets: async () => new Set(),
  contactTypes: async (ids) => new Map(ids.filter((id) => id === CLIENT).map((id) => [id, "cliente" as const])),
  contactNamesTaken: async () => new Set(),
  projectNamesTaken: async () => new Set(),
  projectCodesTaken: async () => new Set(),
  workflowIds: async () => new Set(),
  areaWorkflowIds: async () => new Map(),
  projectTemplatesTaken: async () => new Set(),
  foreignSchedules: async () => new Set(),
};

const okDrive = () => ({ list: async () => ({ files: [] }) }) as unknown as DriveAdmin;

let root: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "monday-wizard-"));
  env = { MONDAY_IMPORT_DIR: root, GOOGLE_SHARED_DRIVE_ID: "sd1" };
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A run whose folder holds the nested fixture export and `mapping` as its draft. */
async function nestedRun(mapping: MappingInput) {
  const run = await createRun(ADMIN, env);
  const src = writeExportFolder("wizard-test-777", mapping);
  cpSync(src, runDir(run.runId, env), { recursive: true });
  rmSync(src, { recursive: true, force: true });
  await updateRun(run.runId, (r) => {
    r.boardIds = ["901", "902", "903", "904"];
  }, env);
  return run;
}

// ---------------------------------------------------------------------------
// Token, runs, jobs
// ---------------------------------------------------------------------------

describe("monday wizard token", () => {
  it("uses the typed token, else MONDAY_TOKEN, else nothing", () => {
    expect(resolveWizardToken(" abc ", { MONDAY_TOKEN: "env" })).toEqual({ token: "abc", source: "input" });
    expect(resolveWizardToken("", { MONDAY_TOKEN: " env " })).toEqual({ token: "env", source: "env" });
    expect(resolveWizardToken(null, {})).toBeNull();
  });
});

describe("monday wizard runs", () => {
  it("only accepts run ids, never paths", () => {
    expect(isRunId("../etc")).toBe(false);
    expect(() => runDir("../../etc", env)).toThrow();
  });

  it("keeps a job's log and status, and reads a job left running as interrupted", async () => {
    const run = await createRun(ADMIN, env);
    startJob(run.runId, "export", "Exportando", async ({ io, progress }) => {
      io.stdout("board 1 listo\n");
      progress(1, 2, "Exportando");
      return null;
    }, env);
    expect(() => startJob(run.runId, "apply", "x", async () => null, env)).toThrow("JOB_RUNNING");
    await waitForJob(run.runId, "export");
    const stored = (await readRun(run.runId, env))!;
    expect(stored.jobs.export).toMatchObject({ status: "succeeded", log: ["board 1 listo"], progress: { done: 1, total: 2 } });

    const left = { ...stored, runId: "00000000-0000-4000-8000-000000000000", jobs: { apply: { ...stored.jobs.export!, kind: "apply" as const, status: "running" as const } } };
    expect(jobView(left, "apply")?.status).toBe("interrupted");
  });

  it("fails a job with the body's message", async () => {
    const run = await createRun(ADMIN, env);
    startJob(run.runId, "apply", "x", async () => {
      throw new Error("boom");
    }, env);
    await waitForJob(run.runId, "apply");
    expect((await readRun(run.runId, env))!.jobs.apply).toMatchObject({ status: "failed", error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// Conectar + export + init
// ---------------------------------------------------------------------------

describe("monday wizard connect and export", () => {
  it("lists the boards with counts and estimates, and never returns the token", async () => {
    const monday = fakeMonday();
    const deps = { db: {} as ImportDb, env, createClient: monday.createClient } satisfies WizardDeps;
    const connection = await connectMonday(TOKEN, deps);
    expect(connection.account).toEqual({ id: "555", slug: "acme", name: "Acme" });
    expect(connection.tokenSource).toBe("input");
    expect(connection.boards.map((b) => [b.id, b.itemsCount])).toEqual([
      ["101", 3],
      ["202", 1],
    ]);
    expect(connection.estimatedCalls).toBeGreaterThan(0);
    expect(JSON.stringify(connection)).not.toContain(TOKEN);
    expect(monday.tokens.length).toBeGreaterThan(0);
    expect(monday.tokens.every((t) => t === TOKEN)).toBe(true);
  });

  it("asks for a token when none is typed and MONDAY_TOKEN is unset", async () => {
    await expect(connectMonday("", { db: {} as ImportDb, env })).rejects.toBeInstanceOf(WizardError);
  });

  it("exports the picked boards in the background, then drafts mapping.json with init", async () => {
    const monday = fakeMonday();
    const deps = {
      db: {} as ImportDb,
      env,
      createClient: monday.createClient,
      initLookups: () => noInitMatches,
    } satisfies WizardDeps;
    const run = await createRun(ADMIN, env);
    const job = await startExport(run.runId, TOKEN, { boardIds: ["101"], files: false }, deps);
    expect(job.status).toBe("running");
    await waitForJob(run.runId, "export");

    const stored = (await readRun(run.runId, env))!;
    expect(stored.jobs.export?.status).toBe("succeeded");
    expect(stored.jobs.export?.progress).toMatchObject({ done: 1, total: 1 });
    expect(stored.account).toEqual({ id: "555", slug: "acme", name: "Acme" });
    expect(stored.boardIds).toEqual(["101"]);

    const dir = runDir(run.runId, env);
    const mapping = JSON.parse(readFileSync(join(dir, "mapping.json"), "utf8")) as MappingInput;
    expect(mapping.boards.map((b) => b.mondayBoardId)).toEqual(["101"]);
    expect(mapping.options).toMatchObject({ includeFiles: false });

    // The token is nowhere on disk.
    for (const file of ["wizard.json", "manifest.json", "mapping.json"])
      expect(readFileSync(join(dir, file), "utf8")).not.toContain(TOKEN);

    const source = await getExportSource(run.runId, deps);
    expect(source.boards[0]).toMatchObject({ id: "101", name: "Proyectos", itemCount: 3 });
    expect(source.boards[0].statusLabels.status).toEqual([{ id: "1", name: "Listo", isDone: false }]);
    expect((await getOptionsInfo(run.runId, deps)).filesDisabledReason).toBe("Los archivos no se exportaron de monday.");
  });

  it("keeps the admin's board and people choices when the draft is extended", () => {
    const base = nestedMapping(ANA, CLIENT);
    const edited: MappingInput = { ...base, boards: [{ ...base.boards[0], strategy: "skip" }] };
    const merged = mergeDraft(edited, base, ["901", "902"]);
    expect(merged.boards.map((b) => [b.mondayBoardId, b.strategy])).toEqual([
      ["901", "skip"],
      ["902", "board_as_project"],
    ]);
    expect(merged.people).toEqual(base.people);
  });

  it("turns off what a re-export skipped, whatever the old draft said", () => {
    const base = nestedMapping(ANA, CLIENT);
    const edited: MappingInput = { ...base, options: { includeUpdates: true, includeFiles: true } };
    const drafted: MappingInput = { ...base, options: { includeUpdates: true, includeFiles: false } };
    expect(mergeDraft(edited, drafted, ["901"]).options).toEqual({ includeUpdates: true, includeFiles: false });
  });
});

// ---------------------------------------------------------------------------
// Draft and preview
// ---------------------------------------------------------------------------

describe("monday wizard draft and preview", () => {
  it("saves an incomplete draft with its issues; an upload only replaces a valid one", async () => {
    const run = await nestedRun(nestedMapping(ANA, CLIENT));
    const deps = { db: {} as ImportDb, env };
    const saved = await saveDraft(run.runId, { version: 1, boards: [] }, "equivalencias", deps);
    expect(saved.issues.length).toBeGreaterThan(0);
    expect((await readRun(run.runId, env))!.step).toBe("equivalencias");

    expect((await uploadDraft(run.runId, "{nope", deps)).issues).toEqual(["El archivo no es JSON válido."]);
    expect((await uploadDraft(run.runId, JSON.stringify(nestedMapping(ANA, CLIENT)), deps)).issues).toEqual([]);
  });

  it("previews the plan as counts per Cincel entity and 5 sample items per board", async () => {
    const run = await nestedRun(nestedMapping(ANA, CLIENT));
    const deps = { db: {} as ImportDb, env, openDrive: okDrive, planLookups: () => planLookups } satisfies WizardDeps;
    const preview = await previewImport(run.runId, ADMIN, deps);

    expect(preview.canApply).toBe(true);
    expect(preview.issues.filter((i) => i.blocking)).toEqual([]);
    expect(preview.boards.map((b) => [b.boardId, b.strategy])).toEqual([
      ["901", "board_as_project"],
      ["902", "board_as_project"],
      ["903", "item_as_project"],
      ["904", "crm_contacts"],
    ]);
    const casaNido = preview.boards[0];
    expect(casaNido.samples.length).toBeLessThanOrEqual(5);
    expect(casaNido.samples.map((s) => s.mondayName)).toEqual(["Muros", "Planos", "Limpieza"]);
    expect(casaNido.samples[0]).toMatchObject({ entity: "tarea", cincel: { project: "Casa Nido" } });
    expect(preview.boards[2].samples[0]).toMatchObject({ entity: "proyecto", mondayName: "Casa Mar" });
    // a project sample counts its tasks as tareas, not subtareas
    expect(preview.boards[2].samples[0].cincel.childTasks).toBe(0);
    expect(preview.boards[3].samples[0]).toMatchObject({ entity: "contacto", mondayName: "Familia Mar" });
    const sum = (key: keyof typeof preview.totals) => preview.boards.reduce((n, b) => n + b.counts[key], 0);
    expect(preview.totals.tareas).toBe(sum("tareas"));
    expect(preview.totals.proyectos).toBe(sum("proyectos"));
  });

  it("turns files off in the draft when Drive isn't configured, so the preview doesn't block on it", async () => {
    const run = await nestedRun(nestedMapping(ANA, CLIENT));
    const env = { MONDAY_IMPORT_DIR: root };
    const preview = await previewImport(run.runId, ADMIN, {
      db: {} as ImportDb,
      env,
      openDrive: okDrive,
      planLookups: () => planLookups,
    });
    expect(preview.issues.map((i) => i.code)).not.toContain("DRIVE_NOT_CONFIGURED");
    const stored = JSON.parse(readFileSync(join(runDir(run.runId, env), "mapping.json"), "utf8")) as MappingInput;
    expect(stored.options).toMatchObject({ includeFiles: false });
  });
});

describe("first-login routing", () => {
  it("sends Google-signed-in admins to the import wizard page", () => {
    expect(FIRST_LOGIN_WIZARD_ROUTES.monday_import).toBe("/configuracion/importar-monday");
  });
});

// ---------------------------------------------------------------------------
// Apply → rollback (test DB)
// ---------------------------------------------------------------------------

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("monday wizard apply and rollback (test DB)", { timeout: 60_000 }, () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  afterAll(() => client.end({ timeout: 5 }));

  async function inTx(fn: (tx: ImportDb) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  it("applies with files excluded and no Drive, matches the preview, lists the projects and rolls back", async () => {
    await inTx(async (tx) => {
      await tx.insert(schema.staff).values({ id: ANA, name: "Ana Wizard", email: "ana.wizard@example.com" });
      await tx.insert(schema.contacts).values({ id: CLIENT, type: "cliente", name: "Wizard Cliente" });
      const mapping = nestedMapping(ANA, CLIENT);
      mapping.options = { includeUpdates: true, includeFiles: false };
      const run = await nestedRun(mapping);
      const drive = fakeDrive();
      const deps: WizardDeps = { db: tx, env: { MONDAY_IMPORT_DIR: root }, openDrive: () => drive.drive };

      const preview = await previewImport(run.runId, ANA, deps);
      expect(preview.canApply).toBe(true);

      await startApply(run.runId, { email: "ana.wizard@example.com" }, deps);
      await waitForJob(run.runId, "apply");
      const state = await getRunState(run.runId, deps);
      expect(state.jobs.apply?.status).toBe("succeeded");
      expect(state.batchStatus).toBe("applied");
      expect(drive.log).toEqual([]);

      const [{ n }] = (await tx.execute(
        sql`select count(*)::int as n from core.import_refs where batch_id = ${state.batchId} and entity = 'project'`,
      )) as unknown as { n: number }[];
      expect(n).toBe(preview.totals.proyectos);
      expect((await importedProjects(run.runId, deps)).length).toBe(preview.totals.proyectos);

      const check = await checkRollback(run.runId, deps);
      expect(check).toMatchObject({ canRollback: true, blockers: [] });
      await startRollback(run.runId, deps);
      await waitForJob(run.runId, "rollback");
      const [batch] = await tx
        .select({ status: schema.importBatches.status })
        .from(schema.importBatches)
        .where(eq(schema.importBatches.id, state.batchId!));
      expect(batch.status).toBe("rolled_back");
      expect(existsSync(runDir(run.runId, deps.env))).toBe(true);
    });
  });
});
