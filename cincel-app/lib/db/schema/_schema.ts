import { pgSchema, timestamp } from "drizzle-orm/pg-core";

/**
 * All Cincel business tables live in the `core` Postgres schema, matching the
 * legacy Supabase migrations in `supabase/migrations/`.
 */
export const core = pgSchema("core");

// ── Enums (mirror 202607270001_init_extensions_and_enums.sql) ────────────────
export const clientKind = core.enum("client_kind", ["Empresa", "Particular"]);
export const workflowType = core.enum("workflow_type", [
  "Presale",
  "Diseno",
  "Construccion",
  "Decoracion",
]);
export const taskStatus = core.enum("task_status", [
  "Pendiente",
  "En proceso",
  "Completado",
  "Bloqueado",
]);
export const taskPriority = core.enum("task_priority", ["Alta", "Media", "Baja"]);

// ── Shared column fragments ─────────────────────────────────────────────────
/**
 * `created_at` / `updated_at` / `deleted_at` present on every table.
 * The legacy schema used a `core.set_updated_at()` trigger; here `updated_at`
 * is maintained in application code via drizzle's `$onUpdate`.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
