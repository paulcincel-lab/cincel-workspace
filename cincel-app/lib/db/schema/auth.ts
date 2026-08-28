import { relations } from "drizzle-orm";
import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, timestamps } from "./_schema";
import { teamMembers } from "./team";

/**
 * Password credentials for a team member. Placeholder in Phase 1 — populated and
 * wired into login in Phase 3 (replaces the legacy `team_members.auth` jsonb and
 * the unsalted FNV-1a hash in `lib/auth/auth-service.ts`).
 *
 * `passwordHash` / `salt` are produced by scrypt (`node:crypto`).
 */
export const authCredentials = core.table("auth_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamMemberId: uuid("team_member_id")
    .notNull()
    .unique()
    .references(() => teamMembers.id),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  authEnabled: boolean("auth_enabled").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

/**
 * Opaque server-side sessions. The cookie carries a random 32-byte token; only
 * its hash is stored here. Placeholder in Phase 1 — wired into `getSession()` /
 * `middleware.ts` in Phase 3.
 */
export const sessions = core.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  teamMemberId: uuid("team_member_id")
    .notNull()
    .references(() => teamMembers.id),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const authCredentialsRelations = relations(authCredentials, ({ one }) => ({
  teamMember: one(teamMembers, {
    fields: [authCredentials.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  teamMember: one(teamMembers, {
    fields: [sessions.teamMemberId],
    references: [teamMembers.id],
  }),
}));
