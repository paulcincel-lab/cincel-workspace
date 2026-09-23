import { relations } from "drizzle-orm";
import { boolean, index, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { staff } from "./people";

/**
 * Login is a property of a staff member, 1:1. `passwordHash` / `salt` are
 * produced by scrypt (`lib/auth/password.ts`).
 */
export const authCredentials = core.table("auth_credentials", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...stamps,
});

/**
 * Opaque server-side sessions. The cookie carries a random token; only its
 * hash is stored. Rows are deleted, never soft-deleted.
 */
export const sessions = core.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_staff_id").on(t.staffId), index("idx_sessions_expires_at").on(t.expiresAt)]
);

export const authCredentialsRelations = relations(authCredentials, ({ one }) => ({
  staff: one(staff, { fields: [authCredentials.staffId], references: [staff.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  staff: one(staff, { fields: [sessions.staffId], references: [staff.id] }),
}));

/**
 * A staff member's own connected Google account (real OAuth, distinct from
 * the service-account domain-wide-delegation impersonation in
 * lib/google/client.ts). One row per staff — connecting a different account
 * replaces it. `refreshToken` is nullable because Google only issues one on
 * the first consent with a given account; re-consenting (prompt=consent,
 * always requested here) keeps it populated on every (re)connect.
 */
export const googleOauthAccounts = core.table("google_oauth_accounts", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...stamps,
});

/**
 * Secret URL token for a staff member's subscribable calendar feed (ICS).
 * Google Calendar can't send a session cookie, so the feed URL itself is the
 * credential: only its sha256 is stored (like `sessions`), one row per staff —
 * regenerating replaces it and kills the old URL.
 */
export const calendarFeedTokens = core.table("calendar_feed_tokens", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  ...stamps,
});

/**
 * Google Calendar sync state per staff member (#434): the dedicated "Cincel"
 * calendar created in their Google account, and the last sync outcome.
 */
export const googleCalendarSyncs = core.table("google_calendar_syncs", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id"),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...stamps,
});

/**
 * Which Google event mirrors which app calendar event (keyed by the stable id
 * `buildCalendarEvents` produces), plus a hash of what was last pushed so a
 * sync only touches events that actually changed.
 */
export const googleCalendarEvents = core.table(
  "google_calendar_events",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    googleEventId: text("google_event_id").notNull(),
    contentHash: text("content_hash").notNull(),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.staffId, t.eventKey] })]
);
