import { relations, sql } from "drizzle-orm";
import { bigint, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { contacts } from "./contacts";
import { staff } from "./people";
import { projects } from "./projects";

/**
 * Client portal (BE §B.3). Portal clients have their own users, sessions and
 * cookie, fully separate from staff auth (`auth.ts`): a portal session never
 * satisfies a staff check and vice versa.
 */

export const portalUserStatus = core.enum("portal_user_status", ["invited", "active", "disabled"]);
export type PortalUserStatus = (typeof portalUserStatus.enumValues)[number];

export const portalUsers = core.table(
  "portal_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercase; the login identity. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    status: portalUserStatus("status").notNull().default("invited"),
    invitedByStaffId: uuid("invited_by_staff_id")
      .notNull()
      .references(() => staff.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledByStaffId: uuid("disabled_by_staff_id").references(() => staff.id),
    ...stamps,
  },
  (t) => [uniqueIndex("portal_users_email_lower_uq").on(sql`lower(${t.email})`)]
);

/** Opaque portal sessions: the `cincel_portal_session` cookie carries a random token, only its sha256 is stored. */
export const portalSessions = core.table(
  "portal_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_portal_sessions_user").on(t.portalUserId),
    index("idx_portal_sessions_expires_at").on(t.expiresAt),
  ]
);

/**
 * Single-use magic sign-in links (#487, replaces `portal_login_codes` in BE
 * §B.3). Only the sha256 of the 32-byte random token is stored; the raw token
 * exists only in the email. Valid 15 minutes; `used_at` is set by the one
 * conditional update that consumes it. No attempts counter: a wrong token
 * matches no row.
 */
export const portalLoginLinks = core.table(
  "portal_login_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Already validated with `safeReturnTo`. */
    returnTo: text("return_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIp: text("requested_ip"),
    ...stamps,
  },
  (t) => [
    index("idx_portal_login_links_user").on(t.portalUserId),
    index("idx_portal_login_links_expires_at").on(t.expiresAt),
  ]
);

/** Per-project portal access. Revoking sets `revoked_at`; rows are kept. */
export const projectPortalAccess = core.table(
  "project_portal_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    grantedByStaffId: uuid("granted_by_staff_id")
      .notNull()
      .references(() => staff.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedByStaffId: uuid("revoked_by_staff_id").references(() => staff.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    uniqueIndex("project_portal_access_active_uq")
      .on(t.projectId, t.portalUserId)
      .where(sql`${t.revokedAt} is null`),
    index("idx_project_portal_access_user").on(t.portalUserId),
  ]
);

export const portalFileAction = core.enum("portal_file_action", ["download", "preview", "upload"]);

/** Every client download, preview and upload. */
export const portalFileEvents = core.table(
  "portal_file_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    driveFileId: text("drive_file_id").notNull(),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    action: portalFileAction("action").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_portal_file_events_project_at").on(t.projectId, t.at),
    index("idx_portal_file_events_user_at").on(t.portalUserId, t.at),
  ]
);

/** Staff-side portal actions. */
export const portalAuditEvents = core.table(
  "portal_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "invite" | "resend" | "revoke" | "disable" | "enable"
    kind: text("kind").notNull(),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id),
    projectId: uuid("project_id").references(() => projects.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_portal_audit_events_user_at").on(t.portalUserId, t.at)]
);

export const portalUsersRelations = relations(portalUsers, ({ one, many }) => ({
  contact: one(contacts, { fields: [portalUsers.contactId], references: [contacts.id] }),
  sessions: many(portalSessions),
  access: many(projectPortalAccess),
}));

export const portalSessionsRelations = relations(portalSessions, ({ one }) => ({
  portalUser: one(portalUsers, { fields: [portalSessions.portalUserId], references: [portalUsers.id] }),
}));

export const portalLoginLinksRelations = relations(portalLoginLinks, ({ one }) => ({
  portalUser: one(portalUsers, { fields: [portalLoginLinks.portalUserId], references: [portalUsers.id] }),
}));

export const projectPortalAccessRelations = relations(projectPortalAccess, ({ one }) => ({
  project: one(projects, { fields: [projectPortalAccess.projectId], references: [projects.id] }),
  portalUser: one(portalUsers, { fields: [projectPortalAccess.portalUserId], references: [portalUsers.id] }),
}));
