import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { contacts } from "./contacts";
import { staff } from "./people";
import { projects } from "./projects";

/**
 * Obra-level construction schedule for a project ("Cronograma de Obra"),
 * distinct from the office workflow `tasks` table — do not merge the two
 * domains. A project has at most one schedule.
 */
export const projectSchedules = core.table(
  "project_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    sourceFileName: text("source_file_name"),
    paymentCalendarLabel: text("payment_calendar_label"),
    ...stamps,
  },
  (t) => [uniqueIndex("project_schedules_project_uq").on(t.projectId)]
);

export const scheduleTaskStatus = core.enum("schedule_task_status", ["pending", "progress", "done"]);

/**
 * A single Gantt row. `stableKey` (planta + djb2(tarea)) is the identity
 * that survives Excel re-imports even when rows move or dates change —
 * see lib/cronograma/hash.ts.
 */
export const scheduleTasks = core.table(
  "schedule_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => projectSchedules.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    legacyId: text("legacy_id"),
    planta: text("planta").notNull(),
    seccion: text("seccion").notNull(),
    seccionOrder: integer("seccion_order").notNull(),
    responsable: text("responsable"),
    // Bare FK, not the composite (id, type) pattern used for projects.clientId:
    // the responsable can be any contact type, so it isn't constrained to one.
    responsableContactId: uuid("responsable_contact_id").references(() => contacts.id),
    inicio: date("inicio").notNull(),
    fin: date("fin").notNull(),
    tarea: text("tarea").notNull(),
    status: scheduleTaskStatus("status").notNull().default("pending"),
    flagged: boolean("flagged").notNull().default(false),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    statusUpdatedBy: uuid("status_updated_by").references(() => staff.id),
    sortOrder: integer("sort_order").notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("schedule_tasks_key_uq").on(t.scheduleId, t.stableKey),
    index("idx_schedule_tasks_schedule_id").on(t.scheduleId),
    index("idx_schedule_tasks_fin").on(t.fin),
    index("idx_schedule_tasks_responsable_contact_id").on(t.responsableContactId),
    index("idx_schedule_tasks_status_updated_by").on(t.statusUpdatedBy),
  ]
);

export const schedulePaymentRows = core.table(
  "schedule_payment_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => projectSchedules.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    pagadoPct: numeric("pagado_pct", { precision: 5, scale: 2 }).notNull(),
    avancePct: numeric("avance_pct", { precision: 5, scale: 2 }).notNull(),
    ...stamps,
  },
  (t) => [index("idx_schedule_payment_rows_schedule_fecha").on(t.scheduleId, t.fecha)]
);

export const scheduleImprevistos = core.table(
  "schedule_imprevistos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => projectSchedules.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    texto: text("texto").notNull(),
    createdBy: uuid("created_by").references(() => staff.id),
    ...stamps,
  },
  (t) => [index("idx_schedule_imprevistos_schedule_id").on(t.scheduleId)]
);

export const scheduleAdicionales = core.table(
  "schedule_adicionales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => projectSchedules.id, { onDelete: "cascade" }),
    partida: text("partida").notNull(),
    // Postgres text[], simpler and more queryable than jsonb for a flat string list.
    items: text("items").array().notNull(),
    quoteRef: text("quote_ref"),
    sortOrder: integer("sort_order").notNull(),
    ...stamps,
  },
  (t) => [index("idx_schedule_adicionales_schedule_id").on(t.scheduleId)]
);

/**
 * Audit trail for status changes ("who marked what, when"). Deliberately not
 * FK'd to scheduleTasks with onDelete: cascade — a re-import that removes a
 * task must not silently destroy its history. `taskId` is left dangling (no
 * FK) once its task is deleted by an import; `taskStableKey` is kept
 * alongside it so history stays attributable even after the task row is gone.
 */
export const scheduleTaskEvents = core.table(
  "schedule_task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id"),
    taskStableKey: text("task_stable_key").notNull(),
    from: scheduleTaskStatus("from").notNull(),
    to: scheduleTaskStatus("to").notNull(),
    userId: uuid("user_id").references(() => staff.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_schedule_task_events_stable_key").on(t.taskStableKey),
    index("idx_schedule_task_events_task_id").on(t.taskId),
  ]
);

export const projectSchedulesRelations = relations(projectSchedules, ({ one, many }) => ({
  project: one(projects, { fields: [projectSchedules.projectId], references: [projects.id] }),
  tasks: many(scheduleTasks),
  payments: many(schedulePaymentRows),
  imprevistos: many(scheduleImprevistos),
  adicionales: many(scheduleAdicionales),
}));

export const scheduleTasksRelations = relations(scheduleTasks, ({ one }) => ({
  schedule: one(projectSchedules, { fields: [scheduleTasks.scheduleId], references: [projectSchedules.id] }),
  responsableContact: one(contacts, {
    fields: [scheduleTasks.responsableContactId],
    references: [contacts.id],
  }),
  statusUpdatedByStaff: one(staff, {
    fields: [scheduleTasks.statusUpdatedBy],
    references: [staff.id],
  }),
}));

export const schedulePaymentRowsRelations = relations(schedulePaymentRows, ({ one }) => ({
  schedule: one(projectSchedules, { fields: [schedulePaymentRows.scheduleId], references: [projectSchedules.id] }),
}));

export const scheduleImprevistosRelations = relations(scheduleImprevistos, ({ one }) => ({
  schedule: one(projectSchedules, { fields: [scheduleImprevistos.scheduleId], references: [projectSchedules.id] }),
  createdByStaff: one(staff, { fields: [scheduleImprevistos.createdBy], references: [staff.id] }),
}));

export const scheduleAdicionalesRelations = relations(scheduleAdicionales, ({ one }) => ({
  schedule: one(projectSchedules, { fields: [scheduleAdicionales.scheduleId], references: [projectSchedules.id] }),
}));

export const scheduleTaskEventsRelations = relations(scheduleTaskEvents, ({ one }) => ({
  userStaff: one(staff, { fields: [scheduleTaskEvents.userId], references: [staff.id] }),
}));
