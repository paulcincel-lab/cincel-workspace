import { customType, pgSchema, timestamp } from "drizzle-orm/pg-core";

/**
 * All Cincel business tables live in the `core` Postgres schema.
 * Greenfield model (rebuild plan Part C); no legacy tables, no legacy ids.
 */
export const core = pgSchema("core");

/** Raw file bytes (Postgres `bytea`) — drizzle-orm has no built-in helper for it. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ── Enums (Part C.0) ────────────────────────────────────────────────────────
// Values are ASCII codes; display labels live in the UI (Part B.5).
export const contactType = core.enum("contact_type", ["cliente", "socio", "proveedor"]);
export const contactKind = core.enum("contact_kind", ["empresa", "particular"]);
export const providerSubtype = core.enum("provider_subtype", [
  "contratista",
  "colaborador",
  "tienda",
]);
export const providerStatus = core.enum("provider_status", [
  "activo",
  "inactivo",
  "pausado",
  "prospecto",
  "lista_negra",
]);
export const staffKind = core.enum("staff_kind", ["empleado", "freelance", "servicio_social"]);
export const projectStatus = core.enum("project_status", [
  "activo",
  "pausado",
  "completado",
  "cancelado",
]);
export const taskKind = core.enum("task_kind", ["workflow", "usuario"]);
export const taskStatus = core.enum("task_status", [
  "pendiente",
  "en_proceso",
  "completado",
  "bloqueado",
]);
export const taskPriority = core.enum("task_priority", ["alta", "media", "baja"]);
export const historyEntity = core.enum("history_entity", [
  "task",
  "project",
  "contact",
  "resource_link",
  "staff",
  "area",
  "workflow",
]);
export const historyEventKind = core.enum("history_event_kind", ["comentario", "cambio"]);

// ── Shared column fragments ─────────────────────────────────────────────────
/** `stamps` in the model: one created_at / updated_at timestamptz per row. */
export const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** `soft` in the model: rows are never hard-deleted; `where live` = deleted_at is null. */
export const soft = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
