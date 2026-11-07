/**
 * "Crear integrante" of the import wizard's Personas (#689): a monday person with no staff account becomes a
 * staff member with monday's name and email, pending until their first Google sign-in (active, no `google_sub`:
 * the sign-in links the row by email). The mapping marks the person `{ action: "staff", staffId, created: true }`,
 * so plan and apply treat them like any staff member and the batch's mapping says who the import created. The
 * wizard keeps the ids it made in the run (wizard.json) and drops `created` from any other staff target when a
 * draft is saved or uploaded and before apply, so a hand-edited mapping can't make a rollback remove someone else.
 *
 * A rollback removes (soft-deletes) those staff members unless they have been used since: signed in, edited, still
 * pointed at by any row once the batch's rows are gone, or mapped by another batch that isn't rolled back.
 */
import { sql, type SQL } from "drizzle-orm";

import type { ImportDb } from "../../lib/import/refs";
import { isRetiredMondayUser } from "../../lib/monday-import/people";

/** Thrown with a Spanish message to show inline; `existingId` is the staff member already using the name or email. */
export class CreateStaffRefused extends Error {
  constructor(
    message: string,
    readonly existingId: string | null = null,
  ) {
    super(message);
    this.name = "CreateStaffRefused";
  }
}

type Row = Record<string, unknown>;

async function rows(db: ImportDb, query: SQL): Promise<Row[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface CreatedStaff {
  id: string;
  name: string;
  email: string | null;
}

/**
 * Creates the staff member of a monday person: name and email from monday, `empleado`, active and not linked to
 * Google yet. Refuses deleted users and bots, and a name or email another live staff member already has.
 */
export async function createStaffFromMonday(
  db: ImportDb,
  user: { id: string; name: string; email: string | null; kind?: string | null; status?: string | null },
): Promise<CreatedStaff> {
  if (isRetiredMondayUser(user)) {
    throw new CreateStaffRefused("Esta persona está eliminada en monday o es un bot; no se crea como integrante.");
  }
  const name = user.name.trim();
  if (!name) throw new CreateStaffRefused("Esta persona no tiene nombre en monday.");
  const email = user.email?.trim().toLowerCase() || null;

  const [taken] = await rows(
    db,
    sql`select id::text as id, name, lower(email) = ${email ?? ""} as same_email from core.staff
      where deleted_at is null
        and (lower(name) = lower(${name}) or (${email}::text is not null and lower(email) = ${email}))
      order by (lower(email) = ${email ?? ""}) desc nulls last
      limit 1`,
  );
  if (taken) {
    const what = taken.same_email === true ? "ese correo" : "ese nombre";
    throw new CreateStaffRefused(
      `Ya hay un integrante con ${what}: ${String(taken.name)}. Elígelo en la lista.`,
      String(taken.id),
    );
  }

  try {
    const [created] = await rows(
      db,
      sql`insert into core.staff (name, email, kind, active)
        values (${name}, ${email}, 'empleado', true)
        returning id::text as id, name, email`,
    );
    const createdEmail = created.email == null ? null : String(created.email);
    return { id: String(created.id), name: String(created.name), email: createdEmail };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CreateStaffRefused("Ya hay un integrante con ese nombre o correo. Elígelo en la lista.");
    }
    throw err;
  }
}

/** The staff ids a mapping created with "Crear integrante" (its `created` staff targets). */
export function createdStaffIds(mapping: unknown): string[] {
  const people = (mapping as { people?: Record<string, unknown> } | null)?.people;
  if (!people || typeof people !== "object") return [];
  const ids = new Set<string>();
  for (const target of Object.values(people)) {
    const t = target as { action?: unknown; staffId?: unknown; created?: unknown } | null;
    if (t?.action === "staff" && t.created === true && typeof t.staffId === "string") ids.add(t.staffId);
  }
  return [...ids];
}

/**
 * The mapping with `created` dropped from every staff target whose id isn't in `allowed` (the ids the run's
 * "Crear integrante" actually made), so a hand-edited or uploaded mapping can't mark an existing staff member as
 * created and have a rollback remove them. Returns the mapping itself when nothing changes.
 */
export function keepVerifiedCreatedStaff<T>(mapping: T, allowed: ReadonlySet<string>): T {
  const people = (mapping as { people?: unknown } | null)?.people;
  if (!people || typeof people !== "object" || Array.isArray(people)) return mapping;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, target] of Object.entries(people as Record<string, unknown>)) {
    const t = target as { action?: unknown; staffId?: unknown; created?: unknown } | null;
    if (t && typeof t === "object" && "created" in t && !(typeof t.staffId === "string" && allowed.has(t.staffId))) {
      const rest: Record<string, unknown> = { ...t };
      delete rest.created;
      next[key] = rest;
      changed = true;
    } else next[key] = target;
  }
  return changed ? ({ ...(mapping as object), people: next } as T) : mapping;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Tables whose rows about a created staff member go with them: the puestos "Crear integrante" gave
 * (`staff_positions`, project flow BE §10.9). They don't count as use, and a removal deletes them.
 */
export const OWNED_STAFF_TABLES: readonly string[] = ["staff_positions"];

/** Every foreign key column into core.staff, read from the catalog so a new table is never missed. */
async function staffPointers(db: ImportDb): Promise<{ table: string; column: string }[]> {
  const found = await rows(
    db,
    sql`select n.nspname as schema, cl.relname as tbl, a.attname as col
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'core.staff'::regclass
        and not (n.nspname = 'core' and cl.relname = any(${sql.raw(`array[${OWNED_STAFF_TABLES.map((t) => `'${t}'`).join(",")}]::text[]`)}))`,
  );
  return found.map((r) => ({ table: `${ident(String(r.schema))}.${ident(String(r.tbl))}`, column: ident(String(r.col)) }));
}

/**
 * Inside the rollback transaction, after the batch's rows are deleted: soft-deletes the staff members the batch's
 * mapping created that are still unused, and returns which were removed and which were kept.
 */
export async function removeUnusedCreatedStaff(
  tx: ImportDb,
  batchId: string,
): Promise<{ removed: string[]; kept: string[] }> {
  const [batch] = await rows(tx, sql`select mapping from core.import_batches where id = ${batchId}`);
  const ids = createdStaffIds(batch?.mapping);
  if (ids.length === 0) return { removed: [], kept: [] };

  const pointers = await staffPointers(tx);
  const removed: string[] = [];
  const kept: string[] = [];
  for (const id of ids) {
    const [member] = await rows(
      tx,
      sql`select (google_sub is null and last_login_at is null and updated_at = created_at) as untouched
        from core.staff where id = ${id} and deleted_at is null`,
    );
    if (!member) continue;
    let used = member.untouched !== true;
    if (!used) {
      const [other] = await rows(
        tx,
        sql`select 1 as hit from core.import_batches b, jsonb_each(coalesce(b.mapping->'people', '{}'::jsonb)) p
          where b.id <> ${batchId} and b.status <> 'rolled_back' and p.value->>'staffId' = ${id}
          limit 1`,
      );
      used = Boolean(other);
    }
    for (const p of pointers) {
      if (used) break;
      const [hit] = await rows(
        tx,
        sql`select 1 as hit from ${sql.raw(p.table)} where ${sql.raw(p.column)} = ${id}::uuid limit 1`,
      );
      used = Boolean(hit);
    }
    if (used) {
      kept.push(id);
      continue;
    }
    // A soft delete doesn't cascade: the puestos given at creation go here.
    await tx.execute(sql`delete from core.staff_positions where staff_id = ${id}`);
    await tx.execute(sql`update core.staff set deleted_at = now(), updated_at = now() where id = ${id}`);
    removed.push(id);
  }
  return { removed, kept };
}
