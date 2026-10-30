/**
 * `npm run monday -- rollback --batch <import_batch_id> [--drive-only]`
 * (docs/specs/monday-migration/backend.md §9).
 *
 * Step 1, built here: refuse when anything outside the batch touched or
 * depends on a batch row, and print every blocker as table, id, what:
 *
 *   (a) a batch row whose `updated_at` differs from `import_refs.row_updated_at`;
 *   (b) `history_events` on a batch task, project or contact that aren't in
 *       the batch's `import_refs`;
 *   (c) rows outside the batch that point at a batch row, through every
 *       foreign key into a batch table (POINTER_CHECKS; a unit test checks
 *       the list against the schema's foreign keys);
 *   (d) `project_portal_access` rows on a batch project, once that table exists.
 *
 * The check only reads. A refusal exits non-zero and writes nothing; that is
 * the signal to fix forward. Step 2 (the delete transaction), step 3 (Drive
 * trash) and `--drive-only` are not built yet.
 */
import { sql, type SQL } from "drizzle-orm";

import type { ImportDb, ImportEntity } from "../../lib/import/refs";
import { createMondayDb, type MondayDbHandle } from "./db";
import type { CliIo, CommandHandler } from "./run";

export type BlockerKind = "edited" | "history" | "reference" | "portal";

/** One reason the batch can't be rolled back. */
export interface RollbackBlocker {
  kind: BlockerKind;
  /** The table of the blocking row. */
  table: string;
  /** The blocking row's id; composite keys are joined with ":". */
  id: string;
  what: string;
}

/**
 * The table behind each import ref entity and the column `import_refs.row_id`
 * matches. `task_support` has a composite key: `row_id` is the task id and
 * the staff id is in `data.staffId`.
 */
export const ENTITY_TABLES: Record<
  ImportEntity,
  { table: string; key: string; hasUpdatedAt: boolean }
> = {
  contact: { table: "contacts", key: "id", hasUpdatedAt: true },
  contact_person: { table: "contact_people", key: "id", hasUpdatedAt: true },
  provider_profile: {
    table: "provider_profiles",
    key: "contact_id",
    hasUpdatedAt: true,
  },
  project: { table: "projects", key: "id", hasUpdatedAt: true },
  project_schedule: {
    table: "project_schedules",
    key: "id",
    hasUpdatedAt: true,
  },
  task: { table: "tasks", key: "id", hasUpdatedAt: true },
  checklist_item: {
    table: "task_checklist_items",
    key: "id",
    hasUpdatedAt: true,
  },
  task_support: { table: "task_support", key: "task_id", hasUpdatedAt: true },
  task_dependency: {
    table: "task_dependencies",
    key: "id",
    hasUpdatedAt: true,
  },
  // Append-only: no updated_at to compare.
  history_event: { table: "history_events", key: "id", hasUpdatedAt: false },
  schedule_task: { table: "schedule_tasks", key: "id", hasUpdatedAt: true },
  task_link: { table: "task_links", key: "id", hasUpdatedAt: true },
  project_link: { table: "project_links", key: "id", hasUpdatedAt: true },
  drive_file: { table: "drive_files", key: "id", hasUpdatedAt: true },
};

/** How a pointing row is recognized as the batch's own. */
type Owner =
  /** It is an import ref of this entity in the batch. */
  | { entity: ImportEntity }
  /** `import_files` of the batch (matched by its batch_id). */
  | "import_files"
  /** It can't belong to a batch: every such row blocks. */
  | null;

/** One foreign key into a batch table, checked for rows outside the batch. */
export interface PointerCheck {
  table: string;
  column: string;
  target: ImportEntity;
  /** SQL text for the row's id, over alias `c`. */
  idSql: string;
  owner: Owner;
}

const own = (entity: ImportEntity): Owner => ({ entity });

/**
 * Every foreign key into a batch table (BE §9 step 1). The spec's list plus
 * the other foreign keys in the schema into the same tables (task
 * attachments, contact tags, the cronograma's payment rows, imprevistos and
 * adicionales, resource links on a drive file, import_files of another batch).
 */
export const POINTER_CHECKS: readonly PointerCheck[] = [
  // Into tasks
  {
    table: "tasks",
    column: "project_id",
    target: "project",
    idSql: "c.id",
    owner: own("task"),
  },
  {
    table: "tasks",
    column: "parent_task_id",
    target: "task",
    idSql: "c.id",
    owner: own("task"),
  },
  {
    table: "task_checklist_items",
    column: "task_id",
    target: "task",
    idSql: "c.id",
    owner: own("checklist_item"),
  },
  {
    table: "task_support",
    column: "task_id",
    target: "task",
    idSql: "c.task_id || ':' || c.staff_id",
    owner: own("task_support"),
  },
  {
    table: "task_links",
    column: "task_id",
    target: "task",
    idSql: "c.id",
    owner: own("task_link"),
  },
  {
    table: "task_dependencies",
    column: "task_id",
    target: "task",
    idSql: "c.id",
    owner: own("task_dependency"),
  },
  {
    table: "task_dependencies",
    column: "depends_on_task_id",
    target: "task",
    idSql: "c.id",
    owner: own("task_dependency"),
  },
  {
    table: "task_attachments",
    column: "task_id",
    target: "task",
    idSql: "c.id",
    owner: null,
  },
  {
    table: "task_attachments",
    column: "checklist_item_id",
    target: "checklist_item",
    idSql: "c.id",
    owner: null,
  },
  {
    table: "import_files",
    column: "task_id",
    target: "task",
    idSql: "c.id",
    owner: "import_files",
  },
  // Into projects
  {
    table: "project_links",
    column: "project_id",
    target: "project",
    idSql: "c.id",
    owner: own("project_link"),
  },
  {
    table: "project_contacts",
    column: "project_id",
    target: "project",
    idSql: "c.project_id || ':' || c.contact_id",
    owner: null,
  },
  {
    table: "project_members",
    column: "project_id",
    target: "project",
    idSql: "c.project_id || ':' || c.staff_id",
    owner: null,
  },
  {
    table: "project_stages",
    column: "project_id",
    target: "project",
    idSql: "c.project_id || ':' || c.workflow_id",
    owner: null,
  },
  {
    table: "project_schedules",
    column: "project_id",
    target: "project",
    idSql: "c.id",
    owner: own("project_schedule"),
  },
  {
    table: "import_files",
    column: "project_id",
    target: "project",
    idSql: "c.id",
    owner: "import_files",
  },
  // Into the cronograma
  {
    table: "schedule_tasks",
    column: "schedule_id",
    target: "project_schedule",
    idSql: "c.id",
    owner: own("schedule_task"),
  },
  {
    table: "schedule_payment_rows",
    column: "schedule_id",
    target: "project_schedule",
    idSql: "c.id",
    owner: null,
  },
  {
    table: "schedule_imprevistos",
    column: "schedule_id",
    target: "project_schedule",
    idSql: "c.id",
    owner: null,
  },
  {
    table: "schedule_adicionales",
    column: "schedule_id",
    target: "project_schedule",
    idSql: "c.id",
    owner: null,
  },
  // Into contacts
  {
    table: "projects",
    column: "client_id",
    target: "contact",
    idSql: "c.id",
    owner: own("project"),
  },
  {
    table: "schedule_tasks",
    column: "responsable_contact_id",
    target: "contact",
    idSql: "c.id",
    owner: own("schedule_task"),
  },
  {
    table: "provider_profiles",
    column: "contact_id",
    target: "contact",
    idSql: "c.contact_id",
    owner: own("provider_profile"),
  },
  {
    table: "contact_people",
    column: "contact_id",
    target: "contact",
    idSql: "c.id",
    owner: own("contact_person"),
  },
  {
    table: "contact_tags",
    column: "contact_id",
    target: "contact",
    idSql: "c.contact_id || ':' || c.kind || ':' || c.value",
    owner: null,
  },
  {
    table: "project_contacts",
    column: "contact_id",
    target: "contact",
    idSql: "c.project_id || ':' || c.contact_id",
    owner: null,
  },
  // Into drive_files
  {
    table: "project_links",
    column: "drive_file_id",
    target: "drive_file",
    idSql: "c.id",
    owner: own("project_link"),
  },
  {
    table: "resource_links",
    column: "drive_file_id",
    target: "drive_file",
    idSql: "c.id",
    owner: null,
  },
  // Into task_checklist_items is task_attachments.checklist_item_id, above.
];

/** The batch rows of one entity, as a subquery over `import_refs` for `exists`. */
function batchRef(
  batchId: string,
  entity: ImportEntity,
  rowIdSql: string,
): SQL {
  return sql`exists (select 1 from core.import_refs r where r.batch_id = ${batchId} and r.entity = ${entity} and r.row_id = ${sql.raw(rowIdSql)})`;
}

function ownedBy(batchId: string, owner: Owner): SQL | null {
  if (owner === null) return null;
  if (owner === "import_files") return sql`c.batch_id = ${batchId}`;
  if (owner.entity === "task_support") {
    return sql`exists (select 1 from core.import_refs s where s.batch_id = ${batchId} and s.entity = 'task_support' and s.row_id = c.task_id and s.data->>'staffId' = c.staff_id::text)`;
  }
  const key = ENTITY_TABLES[owner.entity].key;
  return sql`exists (select 1 from core.import_refs s where s.batch_id = ${batchId} and s.entity = ${owner.entity} and s.row_id = ${sql.raw(`c.${key}`)})`;
}

type Row = Record<string, unknown>;

async function rows(db: ImportDb, query: SQL): Promise<Row[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

const str = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);

/** (a) Batch rows edited since the import. */
async function editedRows(
  db: ImportDb,
  batchId: string,
): Promise<RollbackBlocker[]> {
  const out: RollbackBlocker[] = [];
  for (const [entity, meta] of Object.entries(ENTITY_TABLES) as [
    ImportEntity,
    (typeof ENTITY_TABLES)[ImportEntity],
  ][]) {
    if (!meta.hasUpdatedAt) continue;
    const join =
      entity === "task_support"
        ? "t.task_id = r.row_id and t.staff_id::text = r.data->>'staffId'"
        : `t.${meta.key} = r.row_id`;
    const id =
      entity === "task_support"
        ? "t.task_id || ':' || t.staff_id"
        : `t.${meta.key}::text`;
    // Compared to the millisecond: a snapshot taken through a JS Date has no
    // microseconds.
    const found = await rows(
      db,
      sql`select ${sql.raw(id)} as id, r.external_id, t.updated_at, r.row_updated_at
        from core.import_refs r
        join ${sql.raw(`core.${meta.table}`)} t on ${sql.raw(join)}
        where r.batch_id = ${batchId} and r.entity = ${entity}
          and date_trunc('milliseconds', t.updated_at)
            is distinct from date_trunc('milliseconds', r.row_updated_at)
        order by 1`,
    );
    for (const row of found) {
      out.push({
        kind: "edited",
        table: meta.table,
        id: str(row.id),
        what:
          row.row_updated_at == null
            ? `batch ${entity} (monday ${str(row.external_id)}) has no row_updated_at snapshot`
            : `batch ${entity} (monday ${str(row.external_id)}) edited after the import: updated_at ${str(row.updated_at)}, imported ${str(row.row_updated_at)}`,
      });
    }
  }
  return out;
}

/** (b) Comments and changes on batch tasks, projects and contacts that the import didn't write. */
async function foreignHistory(
  db: ImportDb,
  batchId: string,
): Promise<RollbackBlocker[]> {
  const found = await rows(
    db,
    sql`select h.id::text as id, h.entity::text as entity, h.entity_id::text as entity_id, h.kind::text as kind
      from core.history_events h
      where h.entity in ('task', 'project', 'contact')
        and exists (select 1 from core.import_refs r where r.batch_id = ${batchId} and r.entity = h.entity::text and r.row_id = h.entity_id)
        and not exists (select 1 from core.import_refs s where s.batch_id = ${batchId} and s.entity = 'history_event' and s.row_id = h.id)
      order by h.event_at, h.id`,
  );
  return found.map((row) => ({
    kind: "history",
    table: "history_events",
    id: str(row.id),
    what: `${str(row.kind)} on batch ${str(row.entity)} ${str(row.entity_id)}, not from the import`,
  }));
}

/** (c) Rows outside the batch that point at a batch row. */
async function foreignPointers(
  db: ImportDb,
  batchId: string,
): Promise<RollbackBlocker[]> {
  const out: RollbackBlocker[] = [];
  for (const check of POINTER_CHECKS) {
    const owned = ownedBy(batchId, check.owner);
    const found = await rows(
      db,
      sql`select ${sql.raw(check.idSql)} as id, ${sql.raw(`c.${check.column}`)}::text as target_id
        from ${sql.raw(`core.${check.table}`)} c
        where ${batchRef(batchId, check.target, `c.${check.column}`)}
          ${owned ? sql`and not ${owned}` : sql``}
        order by 1`,
    );
    for (const row of found) {
      out.push({
        kind: "reference",
        table: check.table,
        id: str(row.id),
        what: `${check.column} → batch ${check.target} ${str(row.target_id)}`,
      });
    }
  }
  return out;
}

/** (d) Portal access on a batch project; skipped until the portal tables exist. */
async function portalAccess(
  db: ImportDb,
  batchId: string,
): Promise<RollbackBlocker[]> {
  const [exists] = await rows(
    db,
    sql`select 1 as ok from information_schema.columns
      where table_schema = 'core' and table_name = 'project_portal_access' and column_name = 'project_id'`,
  );
  if (!exists) return [];
  const found = await rows(
    db,
    sql`select c.id::text as id, c.project_id::text as project_id
      from core.project_portal_access c
      where ${batchRef(batchId, "project", "c.project_id")}
      order by 1`,
  );
  return found.map((row) => ({
    kind: "portal",
    table: "project_portal_access",
    id: str(row.id),
    what: `portal access on batch project ${str(row.project_id)}`,
  }));
}

/** Every blocker for rolling back `batchId`; empty when the batch is untouched. Read-only. */
export async function findRollbackBlockers(
  db: ImportDb,
  batchId: string,
): Promise<RollbackBlocker[]> {
  return [
    ...(await editedRows(db, batchId)),
    ...(await foreignHistory(db, batchId)),
    ...(await foreignPointers(db, batchId)),
    ...(await portalAccess(db, batchId)),
  ];
}

/** Blockers as an aligned table, table | id | what. */
export function formatBlockers(blockers: readonly RollbackBlocker[]): string {
  const header = { table: "table", id: "id", what: "what" };
  const all = [header, ...blockers];
  const wTable = Math.max(...all.map((b) => b.table.length));
  const wId = Math.max(...all.map((b) => b.id.length));
  return (
    all
      .map((b) => `${b.table.padEnd(wTable)}  ${b.id.padEnd(wId)}  ${b.what}`)
      .join("\n") + "\n"
  );
}

export interface RollbackArgs {
  batchId: string;
  driveOnly: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses `--batch <id> [--drive-only]`; returns an error message when invalid. */
export function parseRollbackArgs(args: string[]): RollbackArgs | string {
  let batchId: string | undefined;
  let driveOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--drive-only") driveOnly = true;
    else if (arg === "--batch") batchId = args[++i];
    else if (arg.startsWith("--batch=")) batchId = arg.slice("--batch=".length);
    else return `unknown option "${arg}"`;
  }
  if (!batchId) return "--batch <import_batch_id> is required";
  if (!UUID.test(batchId))
    return `--batch must be an import batch id (uuid), got "${batchId}"`;
  return { batchId, driveOnly };
}

export interface RollbackDeps {
  openDb: () => MondayDbHandle;
}

/** Builds the `rollback` handler; tests pass their own database. */
export function createRollbackCommand(
  deps: RollbackDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  return async (args: string[], io: CliIo) => {
    const parsed = parseRollbackArgs(args);
    if (typeof parsed === "string") {
      io.stderr(
        `monday rollback: ${parsed}.\nUsage: rollback --batch <import_batch_id> [--drive-only]\n`,
      );
      return 1;
    }
    if (parsed.driveOnly) {
      io.stderr('monday rollback: "--drive-only" is not implemented yet.\n');
      return 2;
    }

    const handle = deps.openDb();
    try {
      const [batch] = await rows(
        handle.db,
        sql`select id::text as id, status::text as status from core.import_batches where id = ${parsed.batchId}`,
      );
      if (!batch) {
        io.stderr(
          `monday rollback: import batch ${parsed.batchId} not found.\n`,
        );
        return 1;
      }
      if (batch.status === "rolled_back") {
        io.stderr(
          `monday rollback: batch ${parsed.batchId} is already rolled back; use --drive-only to retry the Drive step.\n`,
        );
        return 1;
      }

      const blockers = await findRollbackBlockers(handle.db, parsed.batchId);
      if (blockers.length > 0) {
        io.stderr(
          `monday rollback: refused. ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} on batch ${parsed.batchId}; nothing was changed. Fix forward instead.\n\n`,
        );
        io.stderr(formatBlockers(blockers));
        return 1;
      }

      io.stdout(`Batch ${parsed.batchId}: no blockers.\n`);
      io.stderr(
        "monday rollback: deleting the batch (steps 2 and 3) is not implemented yet.\n",
      );
      return 2;
    } finally {
      await handle.close();
    }
  };
}

export const rollbackCommand: CommandHandler = createRollbackCommand();
