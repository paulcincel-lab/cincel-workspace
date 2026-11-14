import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { TicketContext, TicketEventPayload } from "../../types/soporte";
import {
  core,
  stamps,
  supportEventType,
  supportEventVisibility,
  supportTicketKind,
  supportTicketPriority,
  supportTicketStatus,
} from "./_schema";
import { staff } from "./people";

/** Backs `support_tickets.code` (`SOL-0001`): one number per ticket, unique under concurrency. */
export const supportTicketSeq = core.sequence("support_ticket_seq");

/** A solicitud: an error, an improvement or a question filed by a staff member (Soporte). */
export const supportTickets = core.table(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `SOL-0001`, generated from `support_ticket_seq`. */
    code: text("code")
      .notNull()
      .unique()
      .default(sql`'SOL-' || lpad(nextval('core.support_ticket_seq')::text, 4, '0')`),
    kind: supportTicketKind("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    steps: text("steps"),
    /** Route group the ticket was filed from: inicio, tareas, calendario, …, otro. */
    area: text("area").notNull().default("otro"),
    context: jsonb("context").$type<TicketContext>().notNull(),
    status: supportTicketStatus("status").notNull().default("nuevo"),
    /** Set by admins only. */
    priority: supportTicketPriority("priority"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    assigneeId: uuid("assignee_id").references(() => staff.id, { onDelete: "set null" }),
    duplicateOf: uuid("duplicate_of").references((): AnyPgColumn => supportTickets.id, { onDelete: "set null" }),
    githubIssueNumber: integer("github_issue_number"),
    githubIssueUrl: text("github_issue_url"),
    githubSyncedAt: timestamp("github_synced_at", { withTimezone: true }),
    ...stamps,
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    check("support_tickets_title_len_check", sql`char_length(${t.title}) between 4 and 120`),
    check("support_tickets_not_own_duplicate_check", sql`${t.duplicateOf} is null or ${t.duplicateOf} <> ${t.id}`),
    index("idx_support_tickets_author").on(t.createdBy, t.createdAt.desc()),
    index("idx_support_tickets_status").on(t.status, t.updatedAt.desc()),
    index("idx_support_tickets_github").on(t.githubIssueNumber).where(sql`${t.githubIssueNumber} is not null`),
  ]
);

/** One row per change on a solicitud. `internal` events are never shown to the author. */
export const supportTicketEvents = core.table(
  "support_ticket_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    /** Null = the system or the GitHub sync. */
    actorId: uuid("actor_id").references(() => staff.id, { onDelete: "set null" }),
    type: supportEventType("type").notNull(),
    visibility: supportEventVisibility("visibility").notNull().default("public"),
    payload: jsonb("payload").$type<TicketEventPayload>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_support_ticket_events_ticket").on(t.ticketId, t.createdAt)]
);

/** Images attached to a solicitud, kept in private storage under `file_key`. */
export const supportTicketAttachments = core.table(
  "support_ticket_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_support_ticket_attachments_ticket").on(t.ticketId)]
);
