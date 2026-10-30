/**
 * `npm run monday -- rollback --batch <import_batch_id> [--drive-only]`
 * (docs/specs/monday-migration/backend.md §9).
 *
 * Step 1: refuse when anything outside the batch touched or depends on a
 * batch row, and print every blocker as table, id, what:
 *
 *   (a) a batch row whose `updated_at` differs from `import_refs.row_updated_at`;
 *   (b) `history_events` on a batch task, project or contact that aren't in
 *       the batch's `import_refs`;
 *   (c) rows outside the batch that point at a batch row, through every
 *       foreign key into a batch table (POINTER_CHECKS; a unit test checks
 *       the list against the schema's foreign keys);
 *   (d) `project_portal_access` rows on a batch project, once that table exists.
 *
 * A refusal exits non-zero and writes nothing; that is the signal to fix
 * forward.
 *
 * Step 2, one transaction: the check runs again inside it, then the Drive ids
 * to trash go into `import_batches.stats.driveTrash` and every batch row is
 * deleted in reverse order, then `import_files` and `import_refs`; the batch
 * ends `rolled_back` with `rolled_back_at`. Deleting the import's own
 * history is the one sanctioned exception to "nunca eliminar historial".
 *
 * Step 3, after commit: trash (never delete) the uploaded files, the import
 * folders and the project folders the batch created. A project folder Drive
 * reports as created before the batch was applied is kept. What's done is
 * recorded in `stats.driveTrashed` / `stats.driveKept`; failures are listed
 * and `--drive-only` retries the rest for a `rolled_back` batch.
 */
import { sql, type SQL } from "drizzle-orm";

import {
  createDriveAdmin,
  DRIVE_SCOPE,
  isDriveNotFound,
  type DriveAdmin,
} from "../../lib/google/drive-admin";
import { getServiceAccountTokenSource } from "../../lib/google/service-account";
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

/** The Drive ids recorded in `stats.driveTrash` before the rows go (BE §9 step 2). */
export interface DriveTrashList {
  /** Uploaded files (`import_files.drive_file_id`, batch `drive_files`). */
  files: string[];
  /** `01 Interno/Importado de monday` of each batch project. */
  importFolders: string[];
  /** Root folder of each batch project; kept when it predates the batch. */
  projectFolders: string[];
}

/** The Drive ids `stats.driveTrash` asks to trash, from the batch's rows. */
export async function collectDriveTrash(
  db: ImportDb,
  batchId: string,
): Promise<DriveTrashList> {
  const ids = async (query: SQL) =>
    (await rows(db, query)).map((row) => str(row.id));
  const project = batchRef(batchId, "project", "p.id");
  return {
    files: await ids(
      sql`select id from (
          select f.drive_file_id as id from core.import_files f
            where f.batch_id = ${batchId} and f.drive_file_id is not null
          union
          select d.google_file_id as id from core.drive_files d
            where ${batchRef(batchId, "drive_file", "d.id")}
        ) ids order by id`,
    ),
    importFolders: await ids(
      sql`select distinct p.drive_import_folder_id as id from core.projects p
        where ${project} and p.drive_import_folder_id is not null order by 1`,
    ),
    projectFolders: await ids(
      sql`select distinct p.drive_folder_id as id from core.projects p
        where ${project} and p.drive_folder_id is not null order by 1`,
    ),
  };
}

/** One delete of the transaction: the batch's rows of one table. */
interface DeleteStep {
  /** Name in the summary. */
  label: string;
  query: (batchId: string) => SQL;
}

/** Deletes the rows of an entity's table that are import refs of the batch. */
function deleteRefs(
  entity: ImportEntity,
  extra: string | null = null,
  label: string = ENTITY_TABLES[entity].table,
): DeleteStep {
  const { table, key } = ENTITY_TABLES[entity];
  return {
    label,
    query: (batchId) =>
      sql`delete from ${sql.raw(`core.${table}`)} t where ${batchRef(batchId, entity, `t.${key}`)}${extra ? sql.raw(` and ${extra}`) : sql``}`,
  };
}

/**
 * The delete order of BE §9 step 2. `import_files` goes before the tasks and
 * projects it points at (its foreign keys don't cascade); `import_refs` and
 * the batch status follow in `deleteBatchRows`.
 */
export const DELETE_STEPS: readonly DeleteStep[] = [
  deleteRefs("task_link"),
  deleteRefs("project_link"),
  deleteRefs("drive_file"),
  deleteRefs("history_event"),
  deleteRefs("schedule_task"),
  deleteRefs("project_schedule"),
  deleteRefs("task_dependency"),
  deleteRefs("checklist_item"),
  {
    label: "task_support",
    query: (batchId) =>
      sql`delete from core.task_support t where exists (select 1 from core.import_refs r where r.batch_id = ${batchId} and r.entity = 'task_support' and r.row_id = t.task_id and r.data->>'staffId' = t.staff_id::text)`,
  },
  {
    label: "import_files",
    query: (batchId) =>
      sql`delete from core.import_files where batch_id = ${batchId}`,
  },
  deleteRefs("task", "t.parent_task_id is not null", "child tasks"),
  deleteRefs("task"),
  deleteRefs("project"),
  deleteRefs("provider_profile"),
  deleteRefs("contact_person"),
  deleteRefs("contact"),
];

function affected(result: unknown): number {
  const r = result as { count?: number; rowCount?: number };
  return Number(r.count ?? r.rowCount ?? 0);
}

/** Rows deleted per step, in order. */
export type DeleteCounts = { label: string; count: number }[];

/**
 * Step 2 inside the caller's transaction: records the Drive ids, deletes
 * every batch row, the batch's `import_files` and `import_refs`, and marks
 * the batch `rolled_back`. Run only after `findRollbackBlockers` came back
 * empty in the same transaction.
 */
export async function deleteBatchRows(
  tx: ImportDb,
  batchId: string,
): Promise<{ trash: DriveTrashList; counts: DeleteCounts }> {
  const trash = await collectDriveTrash(tx, batchId);
  await tx.execute(
    sql`update core.import_batches
      set stats = stats || jsonb_build_object('driveTrash', ${JSON.stringify(trash)}::jsonb)
      where id = ${batchId}`,
  );
  const counts: DeleteCounts = [];
  for (const step of DELETE_STEPS) {
    counts.push({
      label: step.label,
      count: affected(await tx.execute(step.query(batchId))),
    });
  }
  counts.push({
    label: "import_refs",
    count: affected(
      await tx.execute(
        sql`delete from core.import_refs where batch_id = ${batchId}`,
      ),
    ),
  });
  await tx.execute(
    sql`update core.import_batches
      set status = 'rolled_back', rolled_back_at = now(), updated_at = now()
      where id = ${batchId}`,
  );
  return { trash, counts };
}

export type DriveTrashKind = "file" | "import folder" | "project folder";

export interface DriveTrashFailure {
  id: string;
  kind: DriveTrashKind;
  error: string;
}

export interface DriveTrashResult {
  /** Trashed in this run (or already gone from Drive). */
  trashed: string[];
  /** Project folders that existed before the batch, left in place. */
  kept: string[];
  failed: DriveTrashFailure[];
  /** Done in an earlier run, skipped. */
  skipped: number;
}

const errorText = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : String(err);

const asIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

/** Appends `id` to the `stats.<key>` array of the batch. */
async function recordDone(
  db: ImportDb,
  batchId: string,
  key: "driveTrashed" | "driveKept",
  id: string,
): Promise<void> {
  await db.execute(
    sql`update core.import_batches
      set stats = jsonb_set(stats, ${`{${key}}`}::text[], coalesce(stats->${key}, '[]'::jsonb) || to_jsonb(${id}::text))
      where id = ${batchId}`,
  );
}

/**
 * Step 3: trashes what `stats.driveTrash` lists and isn't recorded as done
 * yet: files first, then import folders, then project folders. A project
 * folder Drive says was created before the batch's `applied_at` existed
 * before the import and is kept. An item already gone from Drive counts as
 * trashed. Each item is recorded as soon as it's done, so a retry
 * (`--drive-only`) only does the rest.
 */
export async function trashBatchDrive(
  db: ImportDb,
  openDrive: () => DriveAdmin,
  batchId: string,
): Promise<DriveTrashResult> {
  const [batch] = await rows(
    db,
    sql`select stats, applied_at from core.import_batches where id = ${batchId}`,
  );
  const stats = (batch?.stats ?? {}) as Record<string, unknown>;
  const list = (stats.driveTrash ?? {}) as Partial<
    Record<keyof DriveTrashList, unknown>
  >;
  const done = new Set([
    ...asIds(stats.driveTrashed),
    ...asIds(stats.driveKept),
  ]);
  const appliedAt = new Date(str(batch?.applied_at));

  const seen = new Set<string>();
  const items: { id: string; kind: DriveTrashKind }[] = [];
  let skipped = 0;
  for (const [ids, kind] of [
    [asIds(list.files), "file"],
    [asIds(list.importFolders), "import folder"],
    [asIds(list.projectFolders), "project folder"],
  ] as const) {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (done.has(id)) skipped++;
      else items.push({ id, kind });
    }
  }

  const result: DriveTrashResult = {
    trashed: [],
    kept: [],
    failed: [],
    skipped,
  };
  if (items.length === 0) return result;

  let drive: DriveAdmin;
  try {
    drive = openDrive();
  } catch (err) {
    result.failed = items.map((item) => ({ ...item, error: errorText(err) }));
    return result;
  }

  for (const item of items) {
    try {
      if (item.kind === "project folder") {
        const file = await drive.get(item.id, "id,createdTime");
        const created = file.createdTime ? new Date(file.createdTime) : null;
        if (created && created.getTime() < appliedAt.getTime()) {
          await recordDone(db, batchId, "driveKept", item.id);
          result.kept.push(item.id);
          continue;
        }
      }
      await drive.trash(item.id);
    } catch (err) {
      if (!isDriveNotFound(err)) {
        result.failed.push({ ...item, error: errorText(err) });
        continue;
      }
    }
    await recordDone(db, batchId, "driveTrashed", item.id);
    result.trashed.push(item.id);
  }
  return result;
}

/** The Drive client for step 3: the env-configured service account. */
export function openServiceAccountDrive(): DriveAdmin {
  const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
  if (!getAccessToken)
    throw new Error(
      "Drive is not configured (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY)",
    );
  return createDriveAdmin({ getAccessToken });
}

/** Prints the Drive summary and failures; returns the exit code. */
function reportDrive(
  io: CliIo,
  batchId: string,
  result: DriveTrashResult,
): number {
  io.stdout(
    `Drive: ${result.trashed.length} trashed, ${result.kept.length} kept (existed before the batch), ${result.skipped} already done, ${result.failed.length} failed.\n`,
  );
  if (result.failed.length === 0) return 0;
  const all = [{ id: "id", kind: "kind", error: "error" }, ...result.failed];
  const wId = Math.max(...all.map((f) => f.id.length));
  const wKind = Math.max(...all.map((f) => f.kind.length));
  io.stderr(
    `monday rollback: ${result.failed.length} Drive item${result.failed.length === 1 ? "" : "s"} not trashed. The database rollback is done; retry with:\n  npm run monday -- rollback --batch ${batchId} --drive-only\n\n` +
      all
        .map((f) => `${f.id.padEnd(wId)}  ${f.kind.padEnd(wKind)}  ${f.error}`)
        .join("\n") +
      "\n",
  );
  return 1;
}

export interface RollbackDeps {
  openDb: () => MondayDbHandle;
  /** Opened only when there is something to trash. */
  openDrive?: () => DriveAdmin;
}

/** Thrown inside the transaction to undo it when the check finds blockers. */
class Refused extends Error {
  constructor(readonly blockers: RollbackBlocker[]) {
    super("rollback refused");
  }
}

const ALREADY_ROLLED_BACK = (batchId: string) =>
  `monday rollback: batch ${batchId} is already rolled back; use --drive-only to retry the Drive step.\n`;

/** Builds the `rollback` handler; tests pass their own database and Drive. */
export function createRollbackCommand(
  deps: RollbackDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  const openDrive = deps.openDrive ?? openServiceAccountDrive;
  return async (args: string[], io: CliIo) => {
    const parsed = parseRollbackArgs(args);
    if (typeof parsed === "string") {
      io.stderr(
        `monday rollback: ${parsed}.\nUsage: rollback --batch <import_batch_id> [--drive-only]\n`,
      );
      return 1;
    }
    const { batchId } = parsed;

    const handle = deps.openDb();
    try {
      const [batch] = await rows(
        handle.db,
        sql`select id::text as id, status::text as status from core.import_batches where id = ${batchId}`,
      );
      if (!batch) {
        io.stderr(`monday rollback: import batch ${batchId} not found.\n`);
        return 1;
      }

      if (parsed.driveOnly) {
        if (batch.status !== "rolled_back") {
          io.stderr(
            `monday rollback: batch ${batchId} is not rolled back; --drive-only only retries the Drive step of a rolled back batch.\n`,
          );
          return 1;
        }
        return reportDrive(
          io,
          batchId,
          await trashBatchDrive(handle.db, openDrive, batchId),
        );
      }

      if (batch.status === "rolled_back") {
        io.stderr(ALREADY_ROLLED_BACK(batchId));
        return 1;
      }

      let counts: DeleteCounts;
      try {
        counts = await handle.db.transaction(async (tx) => {
          // Locks the batch so a second rollback waits, then checks again
          // inside the transaction so nothing changes between check and delete.
          const [locked] = await rows(
            tx,
            sql`select status::text as status from core.import_batches where id = ${batchId} for update`,
          );
          if (locked?.status === "rolled_back") throw new Refused([]);
          const blockers = await findRollbackBlockers(tx, batchId);
          if (blockers.length > 0) throw new Refused(blockers);
          return (await deleteBatchRows(tx, batchId)).counts;
        });
      } catch (err) {
        if (!(err instanceof Refused)) throw err;
        const { blockers } = err;
        if (blockers.length === 0) {
          io.stderr(ALREADY_ROLLED_BACK(batchId));
          return 1;
        }
        io.stderr(
          `monday rollback: refused. ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} on batch ${batchId}; nothing was changed. Fix forward instead.\n\n`,
        );
        io.stderr(formatBlockers(blockers));
        return 1;
      }

      const total = counts.reduce((sum, c) => sum + c.count, 0);
      io.stdout(
        `Batch ${batchId} rolled back: ${total} rows deleted (${counts
          .filter((c) => c.count > 0)
          .map((c) => `${c.label} ${c.count}`)
          .join(", ")}).\n`,
      );
      return reportDrive(
        io,
        batchId,
        await trashBatchDrive(handle.db, openDrive, batchId),
      );
    } finally {
      await handle.close();
    }
  };
}

export const rollbackCommand: CommandHandler = createRollbackCommand();
