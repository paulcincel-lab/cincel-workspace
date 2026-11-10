import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
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
/** `admin`: admin-only task with no tramo, fase or espacio (project flow, BE §3.5). */
export const taskKind = core.enum("task_kind", ["workflow", "usuario", "admin"]);
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
  // Redesign (BE §3.2): assistant actions on these are logged (§9.9).
  "note",
  "reminder",
  "time_entry",
  "vacation_request",
]);
export const historyEventKind = core.enum("history_event_kind", ["comentario", "cambio"]);

// ── Redesign enums (BE §3.2) ────────────────────────────────────────────────
export const themeId = core.enum("theme_id", ["azul", "calido", "grafito"]);
export const colorMode = core.enum("color_mode", ["light", "dark", "system"]);
export const presentationStyle = core.enum("presentation_style", ["visual", "esencial", "analitico"]);
export const density = core.enum("density", ["comoda", "compacta"]);
export const notificationKind = core.enum("notification_kind", [
  "asignacion",
  "mencion",
  "vencimiento",
  "comentario",
  "aprobacion_cliente",
  "recordatorio",
  "sistema",
]);
export const noteColor = core.enum("note_color", ["neutral", "blue", "amber", "violet", "cyan"]);
export const reminderRepeat = core.enum("reminder_repeat", ["none", "daily", "weekly", "monthly"]);
export const timeEntrySource = core.enum("time_entry_source", ["sidebar", "login", "assistant", "auto_close"]);
export const vacationKind = core.enum("vacation_kind", ["vacaciones", "personal", "enfermedad"]);
export const vacationStatus = core.enum("vacation_status", ["pendiente", "aprobada", "rechazada", "cancelada"]);
export const assistantRole = core.enum("assistant_role", ["user", "assistant", "system", "tool"]);
export const assistantActionStatus = core.enum("assistant_action_status", [
  "proposed",
  "confirmed",
  "cancelled",
  "done",
  "failed",
]);
/** Email delivery state of a notification row (BE §3.5, review B10). */
export const notificationEmailStatus = core.enum("notification_email_status", ["none", "pending", "sent", "failed"]);

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

// ── Search folding (lib/search/search.ts) ────────────────────────────────────
/** Accented letters and their plain forms, folded by `translate(lower(x))` in search. */
export const FOLD_FROM_CHARS = "áàäâãåéèëêíìïîóòöôõúùüûñç";
export const FOLD_TO_CHARS = "aaaaaaeeeeiiiiooooouuuunc";

/**
 * The folded text search compares: lower case, accents removed, null as ''.
 * The translate strings are literals so trigram indexes on this expression
 * (`foldedTrgm`) match the search queries exactly.
 */
export function foldedText(column: SQLWrapper): SQL<string> {
  return sql<string>`translate(lower(coalesce(${column}, '')), ${sql.raw(`'${FOLD_FROM_CHARS}'`)}, ${sql.raw(`'${FOLD_TO_CHARS}'`)})`;
}

/** Index expression for a GIN trigram index on `foldedText(column)`. */
export function foldedTrgm(column: SQLWrapper): SQL {
  return sql`${foldedText(column)} gin_trgm_ops`;
}
