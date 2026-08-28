import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { core, timestamps } from "./_schema";

type EmergencyContact = {
  name: string;
  relation: string;
  phone: string;
  address: string;
};

/**
 * Legacy `auth` jsonb blob. Retained through Phase 2 for compatibility; Phase 3
 * moves credentials into the dedicated `core.auth_credentials` table.
 */
type LegacyAuthBlock = {
  passwordHash: string;
  authEnabled: boolean;
  mustChangePassword?: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

export const teamMembers = core.table("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  legacyId: bigint("legacy_id", { mode: "number" }).unique(),
  name: text("name").notNull(),
  birthDate: text("birth_date"),
  nationality: text("nationality"),
  phone: text("phone"),
  institutionalEmail: text("institutional_email"),
  address: text("address"),
  maritalStatus: text("marital_status"),
  homePhone: text("home_phone"),
  personalEmail: text("personal_email"),
  curp: text("curp"),
  rfc: text("rfc"),
  emergencyContact: jsonb("emergency_contact").$type<EmergencyContact>(),
  role: text("role"),
  area: text("area"),
  capacity: integer("capacity").notNull().default(0),
  availability: text("availability"),
  active: boolean("active").notNull().default(true),
  auth: jsonb("auth").$type<LegacyAuthBlock>(),
  ...timestamps,
}, (t) => [index("idx_team_members_deleted_at").on(t.deletedAt)]);
