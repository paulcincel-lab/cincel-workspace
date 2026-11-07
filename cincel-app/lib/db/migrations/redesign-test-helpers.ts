/**
 * Scratch-database helpers for the redesign migration tests (BE §16). Each
 * scratch database lives next to TEST_DATABASE_URL and is dropped afterwards.
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const TEST_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = resolve(__dirname);
export const REDESIGN_TAG_SUFFIX = "_redesign_contracts";

type JournalEntry = { idx: number; tag: string; when: number };
type Journal = { entries: JournalEntry[] } & Record<string, unknown>;

const tempDirs: string[] = [];

function journal(): Journal {
  return JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;
}

/** Tag of the redesign migration, whatever number drizzle-kit gave it. */
export function redesignTag(): string {
  const entry = journal().entries.find((e) => e.tag.endsWith(REDESIGN_TAG_SUFFIX));
  if (!entry) throw new Error("redesign migration not in the journal");
  return entry.tag;
}

/** A copy of lib/db/migrations holding the migrations before (exclusive) or up to (inclusive) `tag`. */
function migrationsFolder(tag: string, inclusive: boolean): string {
  const j = journal();
  const at = j.entries.findIndex((e) => e.tag === tag);
  if (at < 0) throw new Error(`migration ${tag} not in the journal`);
  const entries = j.entries.slice(0, inclusive ? at + 1 : at);
  const dir = mkdtempSync(join(tmpdir(), "cincel-redesign-migrations-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...j, entries }));
  for (const e of entries) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  return dir;
}

export async function migrateBefore(sql: postgres.Sql, tag: string) {
  await migrate(drizzle(sql), { migrationsFolder: migrationsFolder(tag, false) });
}

export async function migrateThrough(sql: postgres.Sql, tag: string) {
  await migrate(drizzle(sql), { migrationsFolder: migrationsFolder(tag, true) });
}

export async function canCreateDatabases(): Promise<boolean> {
  if (!TEST_URL) return false;
  const probe = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  try {
    const [row] = await probe`select (rolsuper or rolcreatedb) as ok from pg_roles where rolname = current_user`;
    return Boolean(row?.ok);
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

export type Scratch = { name: string; sql: postgres.Sql };

export async function createScratch(label: string, max = 1): Promise<Scratch> {
  const admin = postgres(TEST_URL!, { max: 1, onnotice: () => {} });
  const name = `cincel_rd_${label}_${randomUUID().slice(0, 8)}`;
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const target = new URL(TEST_URL!);
  target.pathname = `/${name}`;
  return { name, sql: postgres(target.toString(), { max, onnotice: () => {} }) };
}

export async function dropScratch(scratch: Scratch | undefined) {
  if (!scratch) return;
  await scratch.sql.end();
  const admin = postgres(TEST_URL!, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${scratch.name}" with (force)`);
  } finally {
    await admin.end();
  }
}

export function cleanupTempDirs() {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back. */
export async function inRollback(sql: postgres.Sql, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

/** Runs `fn` in a savepoint and returns the name of the constraint it violated (or null). */
export async function violated(tx: postgres.TransactionSql, fn: (sp: postgres.TransactionSql) => Promise<unknown>) {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (error) {
    const e = error as { constraint_name?: string; message?: string };
    return e.constraint_name ?? e.message ?? "error";
  }
}
