import { sql } from "drizzle-orm";
import { boolean, check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, noteColor, reminderRepeat, soft, stamps } from "./_schema";
import { staff } from "./people";
import { projects } from "./projects";
import { tasks } from "./tasks";

/** Mi espacio notes, owner-only (BE §3.6). Body is markdown, ≤ 20 000 chars (validation). */
export const notes = core.table(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    color: noteColor("color").notNull().default("neutral"),
    pinned: boolean("pinned").notNull().default(false),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ...stamps,
    ...soft,
  },
  (t) => [
    check("notes_not_empty_check", sql`length(${t.title}) > 0 or length(${t.body}) > 0`),
    index("idx_notes_staff_live").on(t.staffId, t.pinned, t.updatedAt).where(sql`${t.deletedAt} is null`),
    index("idx_notes_project").on(t.projectId).where(sql`${t.projectId} is not null`),
  ]
);

/** Personal checklists (not task checklists), owner-only (BE §3.6). */
export const checklists = core.table(
  "checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ...stamps,
    ...soft,
  },
  (t) => [
    index("idx_checklists_staff_live").on(t.staffId).where(sql`${t.deletedAt} is null`),
    index("idx_checklists_project").on(t.projectId).where(sql`${t.projectId} is not null`),
  ]
);

export const checklistItems = core.table(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    ...stamps,
  },
  (t) => [
    check("checklist_items_text_check", sql`length(trim(${t.text})) > 0`),
    index("idx_checklist_items_list").on(t.checklistId, t.sortOrder),
  ]
);

/**
 * Reminders (BE §3.6). A repeating reminder is one row whose `due_at` moves
 * forward when it fires (`fired_at` stays null); the notification carries the
 * dedupe key `recordatorio:<id>:<due_at ISO>`.
 */
export const reminders = core.table(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    repeat: reminderRepeat("repeat").notNull().default("none"),
    channels: text("channels").array().notNull().default(sql`'{app}'::text[]`),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    firedAt: timestamp("fired_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    check(
      "reminders_channels_check",
      sql`${t.channels} <@ array['app','email']::text[] and cardinality(${t.channels}) > 0`
    ),
    index("idx_reminders_due_open").on(t.dueAt).where(sql`${t.firedAt} is null and ${t.cancelledAt} is null`),
    index("idx_reminders_staff").on(t.staffId, t.dueAt),
    index("idx_reminders_task").on(t.taskId).where(sql`${t.taskId} is not null`),
    index("idx_reminders_project").on(t.projectId).where(sql`${t.projectId} is not null`),
  ]
);
