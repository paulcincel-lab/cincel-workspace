import { relations, sql } from "drizzle-orm";
import { bigint, check, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, timestamps } from "./_schema";
import { teamMembers } from "./team";

type ResourceHistoryItem = Record<string, unknown>;

export const resourceLinks = core.table(
  "resource_links",
  {
    id: text("id").primaryKey(),
    templateKey: text("template_key").notNull(),
    title: text("title").notNull(),
    section: text("section").notNull(),
    subsection: text("subsection"),
    linkType: text("link_type").notNull(),
    appliesTo: text("applies_to").notNull(),
    url: text("url").notNull(),
    status: text("status").notNull().default("vigente"),
    ownerTeamMemberLegacyId: bigint("owner_team_member_legacy_id", {
      mode: "number",
    }),
    personalForTeamMemberLegacyId: bigint("personal_for_team_member_legacy_id", {
      mode: "number",
    }),
    // Real FK references, backfilled from the legacy bigints above (migration
    // 0006). Dual-written by saveResourceLinksAction; reads still use the
    // legacy columns for now (see issue #112 follow-up).
    ownerMemberId: uuid("owner_member_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    personalForMemberId: uuid("personal_for_member_id").references(
      () => teamMembers.id,
      { onDelete: "set null" }
    ),
    updatedAtLabel: text("updated_at_label"),
    // Google Drive metadata cached when a link is picked via the Drive browser.
    // Nullable — `url` remains the fallback for manually-pasted links.
    googleFileId: text("google_file_id"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    iconLink: text("icon_link"),
    thumbnailLink: text("thumbnail_link"),
    webViewLink: text("web_view_link"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    history: jsonb("history")
      .$type<ResourceHistoryItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
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
    check(
      "resource_links_status_check",
      sql`${t.status} in ('vigente', 'obsoleto')`
    ),
    index("idx_resource_links_section").on(t.section),
    index("idx_resource_links_subsection").on(t.subsection),
    index("idx_resource_links_status").on(t.status),
    index("idx_resource_links_owner_team_member_legacy_id").on(
      t.ownerTeamMemberLegacyId
    ),
    index("idx_resource_links_personal_for_team_member_legacy_id").on(
      t.personalForTeamMemberLegacyId
    ),
    index("idx_resource_links_owner_member_id").on(t.ownerMemberId),
    index("idx_resource_links_personal_for_member_id").on(t.personalForMemberId),
    index("idx_resource_links_deleted_at").on(t.deletedAt),
  ]
);

export const resourceLinksRelations = relations(resourceLinks, ({ one }) => ({
  owner: one(teamMembers, {
    fields: [resourceLinks.ownerMemberId],
    references: [teamMembers.id],
  }),
  personalFor: one(teamMembers, {
    fields: [resourceLinks.personalForMemberId],
    references: [teamMembers.id],
  }),
}));
