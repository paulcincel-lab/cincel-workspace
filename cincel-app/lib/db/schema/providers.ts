import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { bigint, check, date, index, integer, text, uuid } from "drizzle-orm/pg-core";
import { core, timestamps } from "./_schema";

/**
 * Closed set the proveedores UI writes to `status` (NULL allowed). CHECK rather
 * than an enum so it can be widened without a type migration.
 */
const providerStatusCheck = (name: string, col: AnyPgColumn) =>
  check(
    name,
    sql`${col} is null or ${col} in ('Activo', 'Inactivo', 'Pausado', 'Prospecto', 'Lista Negra (no deseado)')`
  );

// ── Contractors ────────────────────────────────────────────────────────────
export const contractors = core.table(
  "contractors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }).unique(),
    company: text("company"),
    provider: text("provider").notNull(),
    status: text("status"),
    mainSpecialty: text("main_specialty"),
    seniority: text("seniority"),
    priceLevel: text("price_level"),
    rating: integer("rating").notNull().default(0),
    webPage: text("web_page"),
    contact: text("contact"),
    startDate: date("start_date"),
    comments: text("comments"),
    ...timestamps,
  },
  (t) => [
    index("idx_contractors_provider").on(t.provider),
    index("idx_contractors_status").on(t.status),
    providerStatusCheck("contractors_status_check", t.status),
    index("idx_contractors_deleted_at").on(t.deletedAt),
  ]
);

export const contractorCategories = core.table("contractor_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorId: uuid("contractor_id")
    .notNull()
    .references(() => contractors.id),
  category: text("category").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

// ── Collaborator providers ─────────────────────────────────────────────────
export const collaboratorProviders = core.table(
  "collaborator_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }).unique(),
    name: text("name").notNull(),
    role: text("role"),
    status: text("status"),
    department: text("department"),
    contact: text("contact"),
    email: text("email"),
    seniority: text("seniority"),
    priceLevel: text("price_level"),
    availability: text("availability"),
    rating: integer("rating").notNull().default(0),
    startDate: date("start_date"),
    comments: text("comments"),
    ...timestamps,
  },
  (t) => [
    index("idx_collaborator_providers_name").on(t.name),
    index("idx_collaborator_providers_status").on(t.status),
    providerStatusCheck("collaborator_providers_status_check", t.status),
    index("idx_collaborator_providers_deleted_at").on(t.deletedAt),
  ]
);

export const collaboratorCategories = core.table("collaborator_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  collaboratorId: uuid("collaborator_id")
    .notNull()
    .references(() => collaboratorProviders.id),
  category: text("category").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const collaboratorSkills = core.table("collaborator_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  collaboratorId: uuid("collaborator_id")
    .notNull()
    .references(() => collaboratorProviders.id),
  skill: text("skill").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

// ── Stores ─────────────────────────────────────────────────────────────────
export const stores = core.table(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }).unique(),
    name: text("name").notNull(),
    company: text("company"),
    status: text("status"),
    storeType: text("store_type"),
    mainSpecialty: text("main_specialty"),
    location: text("location"),
    contact: text("contact"),
    rating: integer("rating").notNull().default(0),
    priceLevel: text("price_level"),
    startDate: date("start_date"),
    comments: text("comments"),
    website: text("website"),
    ...timestamps,
  },
  (t) => [
    index("idx_stores_name").on(t.name),
    index("idx_stores_status").on(t.status),
    providerStatusCheck("stores_status_check", t.status),
    index("idx_stores_deleted_at").on(t.deletedAt),
  ]
);

export const storeCategories = core.table("store_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  category: text("category").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

// ── Relations ──────────────────────────────────────────────────────────────
export const contractorsRelations = relations(contractors, ({ many }) => ({
  categories: many(contractorCategories),
}));
export const contractorCategoriesRelations = relations(
  contractorCategories,
  ({ one }) => ({
    contractor: one(contractors, {
      fields: [contractorCategories.contractorId],
      references: [contractors.id],
    }),
  })
);

export const collaboratorProvidersRelations = relations(
  collaboratorProviders,
  ({ many }) => ({
    categories: many(collaboratorCategories),
    skills: many(collaboratorSkills),
  })
);
export const collaboratorCategoriesRelations = relations(
  collaboratorCategories,
  ({ one }) => ({
    collaborator: one(collaboratorProviders, {
      fields: [collaboratorCategories.collaboratorId],
      references: [collaboratorProviders.id],
    }),
  })
);
export const collaboratorSkillsRelations = relations(
  collaboratorSkills,
  ({ one }) => ({
    collaborator: one(collaboratorProviders, {
      fields: [collaboratorSkills.collaboratorId],
      references: [collaboratorProviders.id],
    }),
  })
);

export const storesRelations = relations(stores, ({ many }) => ({
  categories: many(storeCategories),
}));
export const storeCategoriesRelations = relations(storeCategories, ({ one }) => ({
  store: one(stores, {
    fields: [storeCategories.storeId],
    references: [stores.id],
  }),
}));
