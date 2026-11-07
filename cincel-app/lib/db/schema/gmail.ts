import { sql } from "drizzle-orm";
import { boolean, index, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { staff } from "./people";
import { projects } from "./projects";

/** Gmail sync state per staff (BE §3.7). Tokens stay in `google_oauth_accounts`. */
export const gmailAccounts = core.table("gmail_accounts", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  /** Last Gmail historyId seen. */
  historyId: text("history_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** Backoff on 429/5xx. */
  nextSyncAfter: timestamp("next_sync_after", { withTimezone: true }),
  /** Set by `disconnectGmailAction` (review B15). */
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  ...stamps,
});

/** Header/snippet cache of the last 500 threads per staff; bodies are read live (BE §3.7). */
export const gmailThreads = core.table(
  "gmail_threads",
  {
    /** Gmail thread id. */
    id: text("id").notNull(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    unread: boolean("unread").notNull().default(true),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    suggestedProjectId: uuid("suggested_project_id").references(() => projects.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.staffId, t.id] }),
    index("idx_gmail_threads_staff_received").on(t.staffId, t.receivedAt),
    index("idx_gmail_threads_project").on(t.projectId).where(sql`${t.projectId} is not null`),
    index("idx_gmail_threads_suggested_project")
      .on(t.suggestedProjectId)
      .where(sql`${t.suggestedProjectId} is not null`),
  ]
);
