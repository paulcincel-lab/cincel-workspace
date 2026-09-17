import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { core, historyEntity, historyEventKind, soft, stamps } from "./_schema";
import { staff } from "./people";

/** The one audit log; append-only (Part C.5, rule 8). */
export const historyEvents = core.table(
  "history_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: historyEntity("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: historyEventKind("kind").notNull(),
    actorId: uuid("actor_id").references(() => staff.id, { onDelete: "set null" }),
    field: text("field"),
    beforeValue: text("before_value"),
    afterValue: text("after_value"),
    comment: text("comment"),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "history_events_shape_check",
      sql`(${t.kind} = 'comentario' and ${t.comment} is not null and ${t.field} is null) or (${t.kind} = 'cambio' and ${t.field} is not null and ${t.comment} is null)`
    ),
    index("idx_history_events_entity").on(t.entity, t.entityId, t.eventAt),
    index("idx_history_events_actor_id").on(t.actorId),
  ]
);

/** Cached Google Drive metadata, shared by project_links and resource_links. */
export const driveFiles = core.table("drive_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleFileId: text("google_file_id").notNull().unique(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  iconLink: text("icon_link"),
  thumbnailLink: text("thumbnail_link"),
  webViewLink: text("web_view_link"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  ...stamps,
});

/** Recursos sections. */
export const resourceLinks = core.table(
  "resource_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key"),
    title: text("title").notNull(),
    section: text("section").notNull(),
    subsection: text("subsection"),
    linkType: text("link_type").notNull(),
    appliesTo: text("applies_to").notNull().default("general"),
    url: text("url").notNull(),
    status: text("status").notNull().default("vigente"),
    ownerId: uuid("owner_id").references(() => staff.id, { onDelete: "set null" }),
    personalForId: uuid("personal_for_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    driveFileId: uuid("drive_file_id").references(() => driveFiles.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [
    check(
      "resource_links_section_check",
      sql`${t.section} in ('mis-documentos', 'mis-favoritos', 'plantillas-diseno', 'formatos-obra', 'mis-vacaciones', 'formacion', 'empresa')`
    ),
    check(
      "resource_links_subsection_check",
      sql`${t.subsection} is null or ${t.subsection} in ('diseno', 'construccion')`
    ),
    check(
      "resource_links_link_type_check",
      sql`${t.linkType} in ('drive_folder', 'drive_file', 'web')`
    ),
    check(
      "resource_links_applies_to_check",
      sql`${t.appliesTo} in ('general', 'diseno', 'construccion', 'ambos')`
    ),
    check("resource_links_status_check", sql`${t.status} in ('vigente', 'obsoleto')`),
    index("idx_resource_links_section").on(t.section, t.subsection),
    index("idx_resource_links_status").on(t.status),
    index("idx_resource_links_owner_id").on(t.ownerId),
    index("idx_resource_links_personal_for_id").on(t.personalForId),
  ]
);

/**
 * Old id → new id mapping for the production data cutover (rebuild Phase 9).
 * Empty on every environment until the cutover actually runs -- this table
 * is prepared ahead of time, not populated by this phase.
 *
 *   entity    -- which legacy table the row came from, e.g. "activities",
 *                "clients", "team_members" (see docs/rebuild-table-inventory.md
 *                for the full old-table → new-table mapping)
 *   legacy_id -- the row's numeric id in the old (pre-rebuild) schema
 *   row_id    -- the same row's uuid in the corresponding `core.*` table
 *
 * (entity, legacy_id) is the primary key -- one mapping per legacy row.
 */
export const legacyRefs = core.table(
  "legacy_refs",
  {
    entity: text("entity").notNull(),
    legacyId: bigint("legacy_id", { mode: "number" }).notNull(),
    rowId: uuid("row_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entity, t.legacyId] }),
    index("idx_legacy_refs_row_id").on(t.rowId),
  ]
);

export const historyEventsRelations = relations(historyEvents, ({ one }) => ({
  actor: one(staff, { fields: [historyEvents.actorId], references: [staff.id] }),
}));

export const resourceLinksRelations = relations(resourceLinks, ({ one }) => ({
  owner: one(staff, {
    fields: [resourceLinks.ownerId],
    references: [staff.id],
    relationName: "resource_owner",
  }),
  personalFor: one(staff, {
    fields: [resourceLinks.personalForId],
    references: [staff.id],
    relationName: "resource_personal_for",
  }),
  driveFile: one(driveFiles, {
    fields: [resourceLinks.driveFileId],
    references: [driveFiles.id],
  }),
}));
