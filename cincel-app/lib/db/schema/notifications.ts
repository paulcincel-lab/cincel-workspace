import { sql } from "drizzle-orm";
import { boolean, check, index, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { core, historyEntity, notificationEmailStatus, notificationKind, stamps } from "./_schema";
import { staff } from "./people";

/**
 * One row per recipient and event (BE §3.5, review B10). `notify()` always
 * inserts; the delivery state lives on the row so deferred emails and
 * digest-only kinds are never lost.
 */
export const notifications = core.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    entity: historyEntity("entity"),
    entityId: uuid("entity_id"),
    url: text("url"),
    /** e.g. "vencimiento:<taskId>:2026-11-09". */
    dedupeKey: text("dedupe_key"),
    /** Listed in the Bandeja. */
    inApp: boolean("in_app").notNull(),
    emailStatus: notificationEmailStatus("email_status").notNull().default("none"),
    /** Include in the next daily digest. */
    digest: boolean("digest").notNull().default(false),
    digestedAt: timestamp("digested_at", { withTimezone: true }),
    /** Quiet hours push the email to their end. */
    deliverAfter: timestamp("deliver_after", { withTimezone: true }).notNull().defaultNow(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailError: text("email_error"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("notifications_entity_pair_check", sql`(${t.entity} is null) = (${t.entityId} is null)`),
    check("notifications_delivery_check", sql`${t.inApp} or ${t.emailStatus} <> 'none' or ${t.digest}`),
    index("idx_notifications_inbox").on(t.staffId, t.createdAt).where(sql`${t.inApp}`),
    index("idx_notifications_unread").on(t.staffId).where(sql`${t.inApp} and ${t.readAt} is null`),
    index("idx_notifications_email_pending").on(t.deliverAfter).where(sql`${t.emailStatus} = 'pending'`),
    index("idx_notifications_digest_pending").on(t.staffId).where(sql`${t.digest} and ${t.digestedAt} is null`),
    uniqueIndex("notifications_dedupe_uq").on(t.staffId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ]
);

/** Channel choice per staff and kind; missing rows use `NOTIFICATION_DEFAULTS` (§9.3). */
export const notificationPreferences = core.table(
  "notification_preferences",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
    digest: boolean("digest").notNull().default(false),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.staffId, t.kind] })]
);
