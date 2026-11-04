// The default workflows (project stages) every install starts with. Shared by
// scripts/seed.ts and scripts/migrate.mjs so the two can't drift; plain .mjs
// with no app imports so the runtime image can run it next to migrate.mjs.
// Workflows have no templates until the client supplies them (Phase 0).
// Decoración was retired (migration 0010) and is not created.

/** @type {ReadonlyArray<{ key: string; name: string; area: string }>} */
export const DEFAULT_WORKFLOWS = Object.freeze([
  { key: "presale", name: "Presale", area: "Presale" },
  { key: "diseno", name: "Diseño", area: "Diseño" },
  { key: "construccion", name: "Construcción", area: "Construcción" },
]);

/**
 * Creates the default workflows when `core.workflows` has no rows at all
 * (soft-deleted rows count, so an install that removed them on purpose is left
 * alone). Never updates or deletes existing rows; safe to repeat.
 * Returns how many workflows were created (0 when some already exist).
 * @param {import("postgres").Sql | import("postgres").TransactionSql} sql
 * @param {ReadonlyArray<{ key: string; name: string }>} [workflows]
 */
export async function ensureDefaultWorkflows(sql, workflows = DEFAULT_WORKFLOWS) {
  const [{ count }] = await sql`select count(*)::int as count from core.workflows`;
  if (count > 0) return 0;
  let created = 0;
  for (const [i, w] of workflows.entries()) {
    const rows = await sql`
      insert into core.workflows (key, name, sort_order) values (${w.key}, ${w.name}, ${i})
      on conflict do nothing
      returning id`;
    created += rows.length;
  }
  return created;
}
