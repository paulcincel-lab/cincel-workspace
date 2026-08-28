import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clientKind, core, timestamps } from "./_schema";

export const clients = core.table(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }).unique(),
    name: text("name").notNull(),
    kind: clientKind("kind").notNull().default("Particular"),
    phone: text("phone"),
    acquisitionChannel: text("acquisition_channel"),
    totalSpentMxn: numeric("total_spent_mxn", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalProjectsWorked: integer("total_projects_worked").notNull().default(0),
    firstWorkDate: date("first_work_date"),
    hasActiveProject: boolean("has_active_project").notNull().default(false),
    activeProjectName: text("active_project_name"),
    activeProjectType: text("active_project_type"),
    ...timestamps,
  },
  (t) => [
    index("idx_clients_name").on(t.name),
    index("idx_clients_kind").on(t.kind),
    index("idx_clients_deleted_at").on(t.deletedAt),
  ]
);

export const clientContacts = core.table("client_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  name: text("name").notNull(),
  role: text("role"),
  phone: text("phone"),
  email: text("email"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const clientHistory = core.table(
  "client_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    field: text("field").notNull(),
    beforeValue: text("before_value").notNull().default(""),
    afterValue: text("after_value").notNull().default(""),
    authorName: text("author_name").notNull().default(""),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("idx_client_history_client_id").on(t.clientId),
    index("idx_client_history_event_at").on(t.eventAt),
  ]
);

export const clientsRelations = relations(clients, ({ many }) => ({
  contacts: many(clientContacts),
  history: many(clientHistory),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));

export const clientHistoryRelations = relations(clientHistory, ({ one }) => ({
  client: one(clients, {
    fields: [clientHistory.clientId],
    references: [clients.id],
  }),
}));
