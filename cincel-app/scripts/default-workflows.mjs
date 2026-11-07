// The default workflows (project stages) every install starts with. Shared by
// scripts/seed.ts and scripts/migrate.mjs so the two can't drift; plain .mjs
// with no app imports so the runtime image can run it next to migrate.mjs.
// Their fases and templates come from scripts/default-catalog.mjs.
// Decoración was retired (migration 0010) and is not created.

/** @typedef {"on_create" | "on_ready" | "manual"} WorkflowAutoStart */

/** @type {ReadonlyArray<{ key: string; name: string; autoStart: WorkflowAutoStart }>} */
export const DEFAULT_WORKFLOWS = Object.freeze([
  { key: "presale", name: "Presale", autoStart: "on_create" },
  { key: "diseno", name: "Diseño", autoStart: "manual" },
  { key: "construccion", name: "Construcción", autoStart: "manual" },
]);

/**
 * Creates the default workflows when `core.workflows` has no rows at all
 * (soft-deleted rows count, so an install that removed them on purpose is left
 * alone). Never updates or deletes existing rows; safe to repeat.
 * Returns how many workflows were created (0 when some already exist).
 * @param {import("postgres").Sql | import("postgres").TransactionSql} sql
 * @param {ReadonlyArray<{ key: string; name: string; autoStart?: WorkflowAutoStart }>} [workflows]
 */
export async function ensureDefaultWorkflows(sql, workflows = DEFAULT_WORKFLOWS) {
  const [{ count }] = await sql`select count(*)::int as count from core.workflows`;
  if (count > 0) return 0;
  let created = 0;
  for (const [i, w] of workflows.entries()) {
    const rows = await sql`
      insert into core.workflows (key, name, sort_order, auto_start)
      values (${w.key}, ${w.name}, ${i}, ${w.autoStart ?? "manual"}::core.workflow_auto_start)
      on conflict do nothing
      returning id`;
    created += rows.length;
  }
  return created;
}
